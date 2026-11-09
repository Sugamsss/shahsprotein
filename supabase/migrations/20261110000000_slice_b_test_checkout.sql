-- Slice B prepaid checkout: TEST SCAFFOLD ONLY.
--
-- Apply this to an isolated test Supabase project. Do not `supabase db push`
-- it to production: launch needs the finaliser (one locked transaction that
-- creates the site order + kitchen allocation), the refund ledger, and
-- reconciliation (docs/slice-b-test.md, "What live needs").
--
-- One intent per quote is deliberate: a double tap, a retry or a second tab
-- cannot create a second payable Razorpay order for the same quote.
create table public.test_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.website_quotes(id) on delete restrict,
  environment text not null default 'test' check (environment = 'test'),
  -- The browser's capability for this intent; a UUID from crypto.randomUUID().
  retry_key text not null check (retry_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  status text not null default 'created'
    check (status in ('created', 'paid', 'failed', 'refunded', 'cancelled')),
  amount_paise integer not null check (amount_paise between 100 and 50000000),
  currency text not null default 'INR' check (currency = 'INR'),
  -- Razorpay receipt, max 40 characters, stable across retries.
  receipt text not null unique check (receipt ~ '^[A-Za-z0-9_-]{1,40}$'),
  provider_order_id text unique,
  provider_payment_id text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index test_checkout_intents_payment_idx on public.test_checkout_intents(provider_payment_id);

-- Every delivery attempt is kept, including ones that changed nothing, so a
-- missing payment can be explained from the database alone.
create table public.test_payment_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  intent_id uuid references public.test_checkout_intents(id) on delete restrict,
  event_type text not null check (length(event_type) between 1 and 80),
  provider_order_id text,
  provider_payment_id text,
  amount_paise integer,
  result text not null check (result in ('applied', 'ignored', 'amount_mismatch', 'unknown_intent')),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default clock_timestamp()
);
create index test_payment_events_intent_idx on public.test_payment_events(intent_id);

alter table public.test_checkout_intents enable row level security;
alter table public.test_payment_events enable row level security;

-- Closed to every browser role. The Edge Functions reach these tables with the
-- service-role key; no RPC or policy exposes them.
revoke all on public.test_checkout_intents from public, anon, authenticated;
revoke all on public.test_payment_events from public, anon, authenticated;
