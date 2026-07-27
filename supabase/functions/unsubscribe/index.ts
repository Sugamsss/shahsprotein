import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return new Response('Invalid unsubscribe link.', { status: 400 });
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data, error } = await supabase.rpc('consume_waitlist_email_token', { p_token: token, p_purpose: 'unsubscribe' });
  if (error || !data) return new Response('This unsubscribe link is invalid or expired.', { status: 400 });
  return new Response('You have been unsubscribed from Shah\'s Nutrition updates.', { status: 200 });
});
