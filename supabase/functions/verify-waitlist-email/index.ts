import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return new Response('Invalid verification link.', { status: 400 });
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data, error } = await supabase.rpc('consume_waitlist_email_token', { p_token: token, p_purpose: 'verify' });
  if (error || !data) return new Response('This verification link is invalid or expired.', { status: 400 });
  return Response.redirect(`${Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173'}/?verified=1`, 303);
});
