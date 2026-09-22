import { createClient } from 'npm:@supabase/supabase-js@2';

const TIMESTAMP_TOLERANCE_SECONDS = 300;
const SECRET_PREFIX = 'whsec_';

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function verifySignature(request: Request, rawBody: string) {
  const secret = Deno.env.get('LOOPS_SIGNING_SECRET');
  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signatureHeader = request.headers.get('webhook-signature');

  if (!secret) throw new Error('Missing LOOPS_SIGNING_SECRET');
  if (!id || !timestamp || !signatureHeader) throw new Error('Missing webhook headers');

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS) {
    throw new Error('Invalid webhook timestamp');
  }

  const encodedSecret = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret;
  let key: Uint8Array;
  try {
    key = Uint8Array.from(atob(encodedSecret), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Invalid webhook secret');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  ));

  const valid = signatureHeader.split(/\s+/).some((entry) => {
    const separator = entry.indexOf(',');
    if (separator < 0 || entry.slice(0, separator) !== 'v1') return false;
    try {
      const received = Uint8Array.from(atob(entry.slice(separator + 1)), (character) => character.charCodeAt(0));
      return constantTimeEqual(received, expected);
    } catch {
      return false;
    }
  });

  if (!valid) throw new Error('Invalid webhook signature');
}

type WebhookEvent = {
  eventName?: unknown;
  contact?: { email?: unknown };
  contactIdentity?: { email?: unknown };
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const rawBody = await request.text();
  try {
    await verifySignature(request, rawBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid webhook';
    console.warn(`loops-webhook: ${message}`);
    return jsonResponse({ error: message }, message === 'Missing LOOPS_SIGNING_SECRET' ? 500 : 401);
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  // Test events and unknown events are intentionally acknowledged. Updates are
  // idempotent, so Loops retries and duplicate deliveries are safe.
  const eventName = typeof event.eventName === 'string' ? event.eventName : '';
  if (eventName === 'testing.testEvent') return jsonResponse({ ok: true, testing: true });

  const emailValue = event.contactIdentity?.email ?? event.contact?.email;
  const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';
  if (!email) return jsonResponse({ ok: true, ignored: true });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  let update: Record<string, string> | null = null;

  if (eventName === 'contact.created') {
    update = { verified_at: new Date().toISOString() };
  } else if (eventName === 'contact.mailingList.unsubscribed' || eventName === 'contact.unsubscribed' || eventName === 'email.unsubscribed') {
    // Do not downgrade a known bounce/spam status when Loops also emits
    // contact.unsubscribed for the same contact.
    const { error } = await supabase
      .from('waitlist_members')
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
      .eq('email', email)
      .in('status', ['active', 'unsubscribed']);
    if (error) throw error;
    return jsonResponse({ ok: true, updated: true });
  } else if (eventName === 'email.hardBounced') {
    update = { status: 'bounced', unsubscribed_at: new Date().toISOString() };
  } else if (eventName === 'email.spamReported') {
    update = { status: 'spam', unsubscribed_at: new Date().toISOString() };
  } else {
    return jsonResponse({ ok: true, ignored: true });
  }

  const { error } = await supabase.from('waitlist_members').update(update).eq('email', email);
  if (error) {
    console.error('loops-webhook: database update failed', error.message);
    return jsonResponse({ error: 'Database update failed' }, 500);
  }
  return jsonResponse({ ok: true, updated: true });
});
