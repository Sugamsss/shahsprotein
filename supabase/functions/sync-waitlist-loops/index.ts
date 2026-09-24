import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SignupPayload = {
  email?: unknown;
  source?: unknown;
};

type WaitlistMember = {
  id: string;
  email: string;
  source: string;
  signed_up_at: string;
  verified_at: string | null;
  unsubscribed_at: string | null;
  status: string;
  owner_notification_sent_at: string | null;
};

// This function is callable with the public anon key, so it only acts for a
// member who joined (or re-joined) moments ago. Anything else gets the same
// neutral reply as an unknown email, so callers cannot re-trigger Loops for an
// existing address or learn whether it is on the list.
const SYNC_WINDOW_MS = 10 * 60 * 1000;
const skippedResponse = () => jsonResponse({ accepted: true });

const jsonResponse = (body: Record<string, unknown>, status = 202) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let payload: SignupPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (!email) return jsonResponse({ error: 'Email is required' }, 400);

  // The RPC stores the signup before this function is invoked. Confirm that
  // fact server-side rather than trusting an email supplied by the browser.
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const { data: member, error: memberError } = await serviceClient
    .from('waitlist_members')
    .select('id, email, source, signed_up_at, verified_at, unsubscribed_at, status, owner_notification_sent_at')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (memberError) {
    console.error('sync-waitlist-loops: stored signup lookup failed');
    return jsonResponse({ synced: false, stored: false, retryable: true }, 500);
  }
  if (!member || !isRecentActiveJoin(member as WaitlistMember)) return skippedResponse();

  const ownerNotification = await notifyOwner(serviceClient, member as WaitlistMember);

  const endpoint = Deno.env.get('LOOPS_FORM_ENDPOINT');
  const mailingListId = Deno.env.get('LOOPS_WAITLIST_MAILING_LIST_ID');
  if (!endpoint || !mailingListId) {
    console.error('sync-waitlist-loops: Loops secrets are not configured');
    return jsonResponse({ synced: false, stored: true, owner_notified: ownerNotification, config_error: true });
  }

  const form = new URLSearchParams({
    email,
    mailingLists: mailingListId,
  });
  if (typeof payload.source === 'string' && payload.source.trim()) {
    form.set('source', payload.source.trim());
  }

  try {
    const loopsResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    const responseText = await loopsResponse.text();
    let responseBody: { success?: unknown; message?: unknown } = {};
    try {
      responseBody = JSON.parse(responseText) as typeof responseBody;
    } catch {
      // A successful endpoint response may have no JSON body.
    }

    if (!loopsResponse.ok || responseBody.success === false) {
      const details = responseText.slice(0, 500);
      console.error('sync-waitlist-loops: Loops API error', loopsResponse.status, details);
      // Supabase already stored the signup. Do not turn a provider failure into
      // a failed signup; this response is intentionally safe to retry/observe.
      return jsonResponse({
        synced: false,
        stored: true,
        owner_notified: ownerNotification,
        provider_status: loopsResponse.status,
        provider_message: typeof responseBody.message === 'string' ? responseBody.message : undefined,
        retryable: loopsResponse.status === 429 || loopsResponse.status >= 500,
      });
    }

    return jsonResponse({ synced: true, stored: true, owner_notified: ownerNotification });
  } catch (error) {
    console.error(
      'sync-waitlist-loops: request failed',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return jsonResponse({ synced: false, stored: true, owner_notified: ownerNotification, retryable: true });
  }
});

// A new signup has a fresh signed_up_at. A resubscribe keeps the old
// signed_up_at, but the RPC stamps verified_at with the current time.
function isRecentActiveJoin(member: WaitlistMember): boolean {
  if (member.status !== 'active' || member.unsubscribed_at) return false;
  const joinedAt = Math.max(
    Date.parse(member.signed_up_at),
    member.verified_at ? Date.parse(member.verified_at) : 0,
  );
  const age = Date.now() - joinedAt;
  return Number.isFinite(age) && age >= -60_000 && age <= SYNC_WINDOW_MS;
}

async function notifyOwner(
  serviceClient: ReturnType<typeof createClient>,
  member: WaitlistMember,
): Promise<boolean> {
  if (member.owner_notification_sent_at) return true;

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const ownerEmails = (Deno.env.get('WAITLIST_OWNER_EMAIL') ?? Deno.env.get('EMAIL_REPLY_TO') ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  if (!resendApiKey || ownerEmails.length === 0) {
    console.error('sync-waitlist-loops: owner notification is not configured');
    return false;
  }

  const from = Deno.env.get('EMAIL_FROM') ?? "Shah's Nutrition <hello@shahsnutrition.food>";
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        // Retries of this signup use the same key, so Resend does not deliver
        // duplicate owner alerts if the function times out after sending.
        'Idempotency-Key': `waitlist-owner-${member.id}`,
      },
      body: JSON.stringify({
        from,
        to: ownerEmails,
        subject: `New waitlist signup: ${member.email}`,
        text: `A new person joined the Shah's Nutrition waitlist.\n\nEmail: ${member.email}\nSource: ${member.source}\nSigned up: ${member.signed_up_at}`,
      }),
    });
  } catch {
    console.error('sync-waitlist-loops: owner notification request failed');
    return false;
  }

  if (!response.ok) {
    console.error('sync-waitlist-loops: owner notification failed', response.status);
    return false;
  }

  const { error } = await serviceClient
    .from('waitlist_members')
    .update({ owner_notification_sent_at: new Date().toISOString() })
    .eq('id', member.id)
    .is('owner_notification_sent_at', null);
  if (error) {
    // The idempotency key makes a later invocation safe to retry.
    console.error('sync-waitlist-loops: owner notification status update failed');
    return false;
  }
  return true;
}
