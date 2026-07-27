import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email } = await request.json();
    if (typeof email !== 'string' || !email.trim()) {
      console.warn('send-waitlist-confirmation: no email provided');
      return new Response('ok', { status: 202, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Issue verify token
    const { data: token, error: tokenError } = await supabase.rpc(
      'issue_waitlist_email_token',
      { p_email: email, p_purpose: 'verify' },
    );
    if (tokenError) {
      console.error('send-waitlist-confirmation: failed to issue verify token', tokenError.message);
      return new Response('ok', { status: 202, headers: corsHeaders });
    }
    if (!token) {
      console.warn('send-waitlist-confirmation: no member found for', email);
      return new Response('ok', { status: 202, headers: corsHeaders });
    }

    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173';
    const verifyUrl = `${siteUrl}/verify-email?token=${encodeURIComponent(token)}`;

    // Issue unsubscribe token
    const { data: unsubToken, error: unsubError } = await supabase.rpc(
      'issue_waitlist_email_token',
      { p_email: email, p_purpose: 'unsubscribe' },
    );
    if (unsubError) {
      console.error('send-waitlist-confirmation: failed to issue unsubscribe token', unsubError.message);
    }
    const unsubscribeUrl = unsubToken
      ? `${siteUrl}/unsubscribe?token=${encodeURIComponent(unsubToken)}`
      : `${siteUrl}/#unsubscribe`;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('send-waitlist-confirmation: RESEND_API_KEY is not configured');
      return new Response(JSON.stringify({
        sent: false,
        config_error: 'RESEND_API_KEY not set',
      }), {
        status: 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailFrom = Deno.env.get('EMAIL_FROM') ?? "Shah's Nutrition <hello@shahsnutrition.com>";

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [email],
        subject: "Confirm your Shah's Nutrition launch updates",
        html: `<p>Thanks for joining Shah's Nutrition.</p>
<p><a href="${verifyUrl}">Confirm your launch updates</a></p>
<p>You can <a href="${unsubscribeUrl}">unsubscribe at any time</a>.</p>`,
      }),
    });

    if (!resendResponse.ok) {
      const errBody = await resendResponse.text();
      console.error('send-waitlist-confirmation: Resend API error', resendResponse.status, errBody);
    }

    return new Response(JSON.stringify({ sent: resendResponse.ok }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('send-waitlist-confirmation: unexpected error', msg);
    // Still return 202 to avoid blocking the signup flow
    return new Response(JSON.stringify({ sent: false, error: msg }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
