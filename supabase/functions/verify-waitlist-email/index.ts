import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (request) => {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (!token) {
      console.warn('verify-waitlist-email: missing token parameter');
      return new Response('Invalid verification link.', { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data, error } = await supabase.rpc('consume_waitlist_email_token', {
      p_token: token,
      p_purpose: 'verify',
    });

    if (error) {
      console.error('verify-waitlist-email: RPC error', error.message);
      return new Response('This verification link is invalid or expired.', { status: 400 });
    }

    if (!data) {
      console.warn('verify-waitlist-email: token consumption returned false (expired/used/invalid)');
      return new Response('This verification link is invalid or expired.', { status: 400 });
    }

    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173';
    return Response.redirect(`${siteUrl}/?verified=1`, 303);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('verify-waitlist-email: unexpected error', msg);
    return new Response('This verification link is invalid or expired.', { status: 400 });
  }
});
