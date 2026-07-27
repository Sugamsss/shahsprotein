import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email } = await request.json();
    if (typeof email !== 'string' || !email.trim()) return new Response('ok', { status: 202, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: token } = await supabase.rpc('issue_waitlist_email_token', { p_email: email, p_purpose: 'verify' });
    if (!token) return new Response('ok', { status: 202, headers: corsHeaders });

    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173';
    const verifyUrl = `${siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const unsubscribeToken = await supabase.rpc('issue_waitlist_email_token', { p_email: email, p_purpose: 'unsubscribe' });
    const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken.data ?? '')}`;
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') ?? 'Shah\'s Nutrition <hello@shahsnutrition.com>',
        to: [email],
        subject: 'Confirm your Shah\'s Nutrition launch updates',
        html: `<p>Thanks for joining Shah's Nutrition.</p><p><a href="${verifyUrl}">Confirm your launch updates</a></p><p>You can <a href="${unsubscribeUrl}">unsubscribe at any time</a>.</p>`,
      }),
    });

    return new Response(JSON.stringify({ sent: resendResponse.ok }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch {
    return new Response('ok', { status: 202, headers: corsHeaders });
  }
});
