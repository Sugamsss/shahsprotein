import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendResult {
  member_id: string;
  email: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
  log_id?: string;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();

  try {
    // ── Extract and validate auth ─────────────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a client with the caller's JWT for auth checks.
    // We pass service_role as the apikey so the gateway allows the RPC;
    // auth.uid() is derived from the caller's JWT in Authorization.
    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify admin status
    const { data: isAdmin, error: isAdminError } = await userClient.rpc('is_admin');
    if (isAdminError || !isAdmin) {
      console.error('Admin check failed:', isAdminError?.message ?? 'Not an admin');
      return new Response(JSON.stringify({ error: 'Unauthorized. Admin access required.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the admin user id for audit trail
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Could not verify user identity' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse request body ────────────────────────────────────
    const body = await request.json();
    const { member_ids, subject, html_body, plain_text, campaign_name } = body;

    // Validate required fields
    if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'member_ids is required and must be a non-empty array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (member_ids.length > 100) {
      return new Response(JSON.stringify({
        error: `Too many recipients. Maximum is 100, but ${member_ids.length} were provided.`,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return new Response(JSON.stringify({ error: 'subject is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!html_body || typeof html_body !== 'string' || !html_body.trim()) {
      return new Response(JSON.stringify({ error: 'html_body is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Check Resend configuration ────────────────────────────
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({
        error: 'Resend is not configured. Set the RESEND_API_KEY secret before sending emails.',
        config_missing: 'RESEND_API_KEY',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailFrom = Deno.env.get('EMAIL_FROM') ?? "Shah's Nutrition <hello@shahsnutrition.com>";
    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173';

    // ── Create service-role client for DB operations ──────────
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── Fetch members, filtering excluded ones ────────────────
    const { data: members, error: membersError } = await serviceClient
      .from('waitlist_members')
      .select('id, email, marketing_consent, status, unsubscribed_at')
      .in('id', member_ids);

    if (membersError) {
      console.error('Failed to fetch members:', membersError);
      return new Response(JSON.stringify({ error: 'Database error fetching members' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build exclusion logic
    const results: SendResult[] = [];
    const toSend: { id: string; email: string }[] = [];

    for (const mid of member_ids) {
      const member = members?.find((m) => m.id === mid);
      if (!member) {
        results.push({ member_id: mid, email: 'unknown', status: 'skipped', reason: 'Member not found' });
        continue;
      }

      // Exclusion checks
      if (member.unsubscribed_at) {
        results.push({ member_id: mid, email: member.email, status: 'skipped', reason: 'Unsubscribed' });
        continue;
      }
      if (member.status === 'unsubscribed' || member.status === 'bounced' || member.status === 'spam') {
        results.push({ member_id: mid, email: member.email, status: 'skipped', reason: `Status is "${member.status}"` });
        continue;
      }
      if (!member.marketing_consent) {
        results.push({ member_id: mid, email: member.email, status: 'skipped', reason: 'No marketing consent' });
        continue;
      }

      toSend.push({ id: member.id, email: member.email });
    }

    if (toSend.length === 0) {
      return new Response(JSON.stringify({
        summary: { total: member_ids.length, sent: 0, skipped: results.length, failed: 0, elapsed_ms: Date.now() - startTime },
        results,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Create campaign record if name is provided ────────────
    let campaignId: string | null = null;
    if (campaign_name && typeof campaign_name === 'string' && campaign_name.trim()) {
      const { data: campaign, error: campaignError } = await serviceClient
        .from('email_campaigns')
        .insert({
          name: campaign_name.trim(),
          subject: subject.trim(),
          html_body: html_body,
          plain_text: plain_text?.trim() ?? '',
          status: 'sending',
          created_by: user.id,
        })
        .select('id')
        .single();

      if (campaignError) {
        console.error('Failed to create campaign record:', campaignError);
        // Non-fatal – continue without campaign linking
      } else {
        campaignId = campaign.id;
      }
    }

    // ── Send emails via Resend ────────────────────────────────
    const resendEndpoint = 'https://api.resend.com/emails';

    for (const recipient of toSend) {
      try {
        // Generate unsubscribe token for this member
        const { data: unsubToken, error: tokenError } = await serviceClient.rpc(
          'issue_waitlist_email_token',
          { p_email: recipient.email, p_purpose: 'unsubscribe' },
        );

        if (tokenError || !unsubToken) {
          const reason = tokenError?.message ?? 'Could not generate unsubscribe link';
          console.error(`Unsubscribe token failed for ${recipient.email}:`, reason);
          results.push({ member_id: recipient.id, email: recipient.email, status: 'failed', reason });
          continue;
        }

        const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

        // Inject unsubscribe link into the HTML body
        const unsubscribeFooter = `<p style="margin-top:32px;font-size:12px;color:#888;">You're receiving this because you signed up for Shah's Nutrition updates. <a href="${unsubscribeUrl}">Unsubscribe</a></p>`;
        const htmlWithUnsubscribe = /<\/body>/i.test(html_body)
          ? html_body.replace(/<\/body>/i, `${unsubscribeFooter}\n</body>`)
          : `${html_body}\n${unsubscribeFooter}`;

        const plainWithUnsubscribe = (plain_text || '')
          ? `${plain_text}\n\n---\nUnsubscribe: ${unsubscribeUrl}`
          : `Unsubscribe: ${unsubscribeUrl}`;

        const resendResponse = await fetch(resendEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: emailFrom,
            to: [recipient.email],
            subject: subject.trim(),
            html: htmlWithUnsubscribe,
            text: plainWithUnsubscribe,
          }),
        });

        const resendBody = await resendResponse.json();

        if (resendResponse.ok) {
          // Log success
          const { data: logId } = await serviceClient.rpc('log_email_delivery', {
            p_campaign_id: campaignId,
            p_member_id: recipient.id,
            p_email: recipient.email,
            p_status: 'sent',
            p_subject: subject.trim(),
          });

          results.push({
            member_id: recipient.id,
            email: recipient.email,
            status: 'sent',
            log_id: logId ?? undefined,
          });
        } else {
          const errorMsg = resendBody?.message ?? resendBody?.error ?? `HTTP ${resendResponse.status}`;
          console.error(`Resend failed for ${recipient.email}:`, errorMsg);

          // Log failure
          await serviceClient.rpc('log_email_delivery', {
            p_campaign_id: campaignId,
            p_member_id: recipient.id,
            p_email: recipient.email,
            p_status: 'failed',
            p_subject: subject.trim(),
            p_error_message: errorMsg,
          });

          results.push({
            member_id: recipient.id,
            email: recipient.email,
            status: 'failed',
            reason: errorMsg,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Exception sending to ${recipient.email}:`, errorMsg);

        await serviceClient.rpc('log_email_delivery', {
          p_campaign_id: campaignId,
          p_member_id: recipient.id,
          p_email: recipient.email,
          p_status: 'failed',
          p_subject: subject.trim(),
          p_error_message: errorMsg,
        });

        results.push({
          member_id: recipient.id,
          email: recipient.email,
          status: 'failed',
          reason: errorMsg,
        });
      }
    }

    // ── Update campaign status ────────────────────────────────
    if (campaignId) {
      await serviceClient
        .from('email_campaigns')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
    }

    // ── Return results ────────────────────────────────────────
    const sentCount = results.filter((r) => r.status === 'sent').length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    return new Response(JSON.stringify({
      summary: {
        total: member_ids.length,
        attempted: toSend.length,
        sent: sentCount,
        skipped: skippedCount,
        failed: failedCount,
        elapsed_ms: Date.now() - startTime,
      },
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-admin-email unexpected error:', errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
