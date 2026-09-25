-- Migration: 20260926000000_orders.sql
-- Saved orders and the stock switch.
--
-- The "Your order" popup still sends the order on WhatsApp. On the same tap
-- it now saves a copy through submit_order(), with a short code (SN-7KQ4M)
-- that also goes in the message, so the owners can match a chat to a row.
-- The site can only add an order and read which products are out of stock.
-- Nobody outside the database can read orders; the admin reads them through
-- the admin RPCs in 20260926000001.
--
-- Orders hold personal data (name, pincode, later a phone). They are kept
-- with no auto-delete (PM decision); the purge jobs never touch them.
-- The rate limit keeps a hashed IP in its own table for about an hour.

-- ═══════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  -- SN- plus 5 characters from an alphabet with no look-alikes. A suffix
  -- (-2, -3 …) only when two different orders arrive with the same code.
  code text not null unique check (
    code ~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}(-([2-9]|[1-9][0-9]{1,2}))?$'
  ),
  -- md5 of the cleaned order, so a repeat save of the same order is a no-op.
  fingerprint text,
  source text not null check (source in ('site', 'whatsapp', 'call', 'instagram', 'in_person')),
  status text not null default 'new'
    check (status in ('new', 'confirmed', 'sent', 'delivered', 'cancelled')),
  -- Null means not paid. Every order starts not paid.
  paid_at timestamptz,
  -- Set by "Keep" on a stale order; once set, the order is never stale again.
  kept_at timestamptz,
  name text check (name is null or char_length(name) between 2 and 60),
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  -- Digits only, with the country code (e.g. 919800000001).
  phone text check (phone is null or phone ~ '^[1-9][0-9]{10,14}$'),
  note text check (note is null or char_length(note) <= 1000),
  -- Whole rupees. Private to the admin; never shown on the public site.
  amount integer check (amount is null or amount between 0 and 1000000),
  coupon_code text check (coupon_code is null or coupon_code ~ '^[A-Z0-9-]{3,24}$'),
  coupon_id uuid references public.coupons(id) on delete set null,
  -- Whether the coupon was active and not expired when the order was saved.
  coupon_valid boolean,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  status_changed_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  constraint orders_site_needs_name_and_pincode
    check (source <> 'site' or (name is not null and pincode is not null)),
  constraint orders_needs_name_or_phone
    check (name is not null or phone is not null)
);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc, id desc);
create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);
create index if not exists orders_phone_idx
  on public.orders (phone) where phone is not null;
-- Code prefix search (SN-7KQ4M finds SN-7KQ4M-2) whatever the collation.
create index if not exists orders_code_prefix_idx
  on public.orders (code text_pattern_ops);

create table if not exists public.order_lines (
  order_id uuid not null references public.orders(id) on delete cascade,
  -- Shape only. Product names live in the frontend (src/data/products.ts),
  -- so adding a product never stops its orders from saving.
  product_id text not null check (product_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  size text not null check (size ~ '^[0-9]{1,5} ?(g|kg)$'),
  -- 1 to 10 from the site, 1 to 99 by hand.
  quantity integer not null check (quantity between 1 and 99),
  primary key (order_id, product_id, size)
);

-- History shown on the order. Written only by the trigger below.
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event text not null check (event in (
    'created', 'new', 'confirmed', 'sent', 'delivered', 'cancelled',
    'paid', 'unpaid', 'kept', 'unkept'
  )),
  at timestamptz not null default timezone('utc', now()),
  by uuid references auth.users(id) on delete set null
);

create index if not exists order_events_order_at_idx
  on public.order_events (order_id, at);

-- A missing row means in stock, so new products just work.
create table if not exists public.product_stock (
  product_id text not null check (product_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  size text not null check (size ~ '^[0-9]{1,5} ?(g|kg)$'),
  in_stock boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, size)
);

create table if not exists public.order_rate_limits (
  request_key text not null,
  attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists order_rate_limits_lookup_idx
  on public.order_rate_limits (request_key, attempted_at desc);

alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_events enable row level security;
alter table public.product_stock enable row level security;
alter table public.order_rate_limits enable row level security;

-- No policies: anon and authenticated can't read, change or delete rows.
-- The only ways in are the security definer functions below and in
-- 20260926000001.
revoke all on public.orders from anon, authenticated;
revoke all on public.order_lines from anon, authenticated;
revoke all on public.order_events from anon, authenticated;
revoke all on public.product_stock from anon, authenticated;
revoke all on public.order_rate_limits from anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Triggers: updated_at, status_changed_at, history
-- ═══════════════════════════════════════════════════════

-- Reuses the shared updated_at trigger function from 20260727000003.
drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.update_waitlist_member_timestamp();

-- The stale rule reads status_changed_at, so undoing a Confirm back to New
-- restarts the 48 h clock instead of making the order stale at once.
create or replace function public.set_order_status_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

revoke all on function public.set_order_status_changed_at() from public, anon, authenticated;

drop trigger if exists trg_orders_status_changed_at on public.orders;
create trigger trg_orders_status_changed_at
  before update on public.orders
  for each row execute function public.set_order_status_changed_at();

-- One trigger writes all history, so every write path gets it for free.
-- by = auth.uid(): null for the public site, the admin's id otherwise.
create or replace function public.log_order_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, event, by)
    values (new.id, 'created', v_by);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events (order_id, event, by)
    values (new.id, new.status, v_by);
  end if;

  if old.paid_at is null and new.paid_at is not null then
    insert into public.order_events (order_id, event, by) values (new.id, 'paid', v_by);
  elsif old.paid_at is not null and new.paid_at is null then
    insert into public.order_events (order_id, event, by) values (new.id, 'unpaid', v_by);
  end if;

  if old.kept_at is null and new.kept_at is not null then
    insert into public.order_events (order_id, event, by) values (new.id, 'kept', v_by);
  elsif old.kept_at is not null and new.kept_at is null then
    insert into public.order_events (order_id, event, by) values (new.id, 'unkept', v_by);
  end if;

  return null;
end;
$$;

revoke all on function public.log_order_events() from public, anon, authenticated;

drop trigger if exists trg_orders_events on public.orders;
create trigger trg_orders_events
  after insert or update on public.orders
  for each row execute function public.log_order_events();

-- ═══════════════════════════════════════════════════════
-- 3. Shared checks (internal, not callable from the API)
-- ═══════════════════════════════════════════════════════

-- Control characters (including U+2028 and U+2029, which break some
-- WhatsApp and CSV readers) become spaces, runs of spaces collapse, and the
-- ends are trimmed. The caller checks the length.
create or replace function public.order_clean_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(
    regexp_replace(p_name, '[\x01-\x1F\x7F-\x9F\u2028\u2029]', ' ', 'g'),
    '\s+', ' ', 'g'
  ));
$$;

revoke all on function public.order_clean_name(text) from public, anon, authenticated;

-- Checks the lines' shape and returns them merged (same product and size
-- summed, then capped) and sorted, as [{product_id, size, quantity}].
-- p_max_quantity is 10 from the site and 99 by hand.
create or replace function public.order_clean_lines(p_lines jsonb, p_max_quantity integer)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_line jsonb;
  v_quantity integer;
  v_result jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using message = 'Add at least one item.', errcode = '22023';
  end if;

  if jsonb_array_length(p_lines) > 20 then
    raise exception using message = 'Keep it to 20 items or fewer.', errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object'
       or jsonb_typeof(v_line -> 'product_id') is distinct from 'string'
       or jsonb_typeof(v_line -> 'size') is distinct from 'string'
       or jsonb_typeof(v_line -> 'quantity') is distinct from 'number'
       or (v_line ->> 'product_id') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
       or (v_line ->> 'size') !~ '^[0-9]{1,5} ?(g|kg)$'
       or (v_line ->> 'quantity') !~ '^[0-9]{1,3}$' then
      raise exception using message = 'One of the items doesn''t look right.', errcode = '22023';
    end if;

    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > p_max_quantity then
      raise exception using
        message = format('Each item''s quantity is 1 to %s.', p_max_quantity),
        errcode = '22023';
    end if;
  end loop;

  select jsonb_agg(
    jsonb_build_object('product_id', merged.product_id, 'size', merged.size, 'quantity', merged.quantity)
    order by merged.product_id collate "C", merged.size collate "C"
  ) into v_result
  from (
    select
      line ->> 'product_id' as product_id,
      line ->> 'size' as size,
      least(sum((line ->> 'quantity')::integer), p_max_quantity)::integer as quantity
    from jsonb_array_elements(p_lines) line
    group by 1, 2
  ) merged;

  return v_result;
end;
$$;

revoke all on function public.order_clean_lines(jsonb, integer) from public, anon, authenticated;

-- True when the code, or any suffixed copy of it, is already an order.
create or replace function public.order_code_taken(p_code text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.code = p_code or o.code like p_code || '-%'
  );
$$;

revoke all on function public.order_code_taken(text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 4. Public save RPC
-- ═══════════════════════════════════════════════════════

-- Called from the popup's Send with fetch(keepalive). The client ignores the
-- answer, so a failed save never blocks the WhatsApp message. Bad input
-- raises 22023 (a 400 in the network tab); too many saves raise PT429.
create or replace function public.submit_order(
  p_code text,
  p_lines jsonb,
  p_name text,
  p_pincode text,
  p_coupon text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_headers text := current_setting('request.headers', true);
  v_request_ip text := 'unknown';
  v_request_hash text;
  attempts integer;
  recent_orders integer;
  v_code text;
  v_lines jsonb;
  v_name text;
  v_pincode text;
  v_coupon text;
  v_coupon_id uuid;
  v_coupon_valid boolean;
  v_fingerprint text;
  v_taken_count integer;
  v_top_suffix integer;
  v_order_id uuid;
begin
  -- Rate limit first, copied from check_coupon(): cf-connecting-ip is set by
  -- Cloudflare and can't be supplied by the caller, so it goes first. Like
  -- track_site_event(), an unknown IP skips the per-IP check and relies on
  -- the backstop below.
  if request_headers is not null and request_headers <> '' then
    v_request_ip := coalesce(
      nullif(trim(request_headers::jsonb ->> 'cf-connecting-ip'), ''),
      nullif(trim(split_part(request_headers::jsonb ->> 'x-forwarded-for', ',', 1)), ''),
      'unknown'
    );
  end if;

  if v_request_ip <> 'unknown' then
    v_request_hash := left(encode(digest(v_request_ip, 'sha256'), 'hex'), 64);

    -- Parallel saves from one IP wait their turn, so a burst can't slip past
    -- the count.
    perform pg_advisory_xact_lock(hashtext('submit_order:' || v_request_hash));

    delete from public.order_rate_limits
    where attempted_at < timezone('utc', now()) - interval '1 hour';

    select count(*) into attempts
    from public.order_rate_limits limits
    where limits.request_key = v_request_hash
      and limits.attempted_at > timezone('utc', now()) - interval '1 hour';

    if attempts >= 10 then
      raise exception using message = 'Too many orders. Try again later.', errcode = 'PT429';
    end if;

    insert into public.order_rate_limits (request_key)
    values (v_request_hash);
  end if;

  -- Backstop in case the per-IP limit is dodged: far above real traffic for
  -- a small shop, low enough that a flood can't fill the order book.
  select count(*) into recent_orders
  from public.orders o
  where o.source = 'site'
    and o.created_at > now() - interval '1 hour';

  if recent_orders >= 300 then
    raise exception using message = 'Too many orders. Try again later.', errcode = 'PT429';
  end if;

  -- Validate. The client never sends a suffix.
  v_code := upper(btrim(p_code, E' \t\r\n'));
  if v_code is null or v_code !~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$' then
    raise exception using message = 'That order code doesn''t look right.', errcode = '22023';
  end if;

  v_lines := public.order_clean_lines(p_lines, 10);

  v_name := public.order_clean_name(p_name);
  if v_name is null or char_length(v_name) not between 2 and 60 then
    raise exception using message = 'A name is 2 to 60 characters.', errcode = '22023';
  end if;

  v_pincode := btrim(p_pincode, E' \t\r\n');
  if v_pincode is null or v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception using message = 'A pincode is 6 digits.', errcode = '22023';
  end if;

  -- A malformed coupon is dropped, not an error, so a bad code never loses
  -- the order.
  v_coupon := upper(btrim(p_coupon, E' \t\r\n'));
  if v_coupon is not null and v_coupon !~ '^[A-Z0-9-]{3,24}$' then
    v_coupon := null;
  end if;

  v_fingerprint := md5(
    lower(v_name) || '|' || v_pincode || '|' ||
    (
      select string_agg(
        (line ->> 'product_id') || ':' || (line ->> 'size') || ':' || (line ->> 'quantity'),
        ',' order by line ->> 'product_id' collate "C", line ->> 'size' collate "C"
      )
      from jsonb_array_elements(v_lines) line
    ) || '|' || coalesce(v_coupon, '')
  );

  -- Two saves racing for the same code wait here, so they can't both take it.
  perform pg_advisory_xact_lock(hashtext('order_code:' || v_code));

  if exists (
    select 1 from public.orders o
    where (o.code = v_code or o.code like v_code || '-%')
      and o.fingerprint = v_fingerprint
  ) then
    -- A repeat save (double tap, "Try again"): nothing to do.
    return;
  end if;

  -- Max suffix + 1 rather than count + 1, so a deleted -2 can't make the
  -- next save collide with an existing -3. The plain code counts as 1.
  select
    count(*),
    max(coalesce(nullif(substring(o.code from '^SN-[A-Z0-9]{5}-([0-9]+)$'), '')::integer, 1))
  into v_taken_count, v_top_suffix
  from public.orders o
  where o.code = v_code or o.code like v_code || '-%';

  if v_taken_count > 0 then
    v_code := v_code || '-' || (v_top_suffix + 1);
  end if;

  if v_coupon is not null then
    select c.id, (c.active and (c.expires_at is null or c.expires_at > now()))
    into v_coupon_id, v_coupon_valid
    from public.coupons c
    where upper(c.code) = v_coupon;

    v_coupon_valid := coalesce(v_coupon_valid, false);
  end if;

  insert into public.orders (
    code, fingerprint, source, status, name, pincode,
    coupon_code, coupon_id, coupon_valid
  ) values (
    v_code, v_fingerprint, 'site', 'new', v_name, v_pincode,
    v_coupon, v_coupon_id, v_coupon_valid
  ) returning id into v_order_id;

  insert into public.order_lines (order_id, product_id, size, quantity)
  select v_order_id, line ->> 'product_id', line ->> 'size', (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) line;
end;
$$;

-- Supabase grants execute on new functions to anon and authenticated by
-- default; revoke, then grant only what the site needs.
revoke all on function public.submit_order(text, jsonb, text, text, text) from public, anon;
grant execute on function public.submit_order(text, jsonb, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 5. Public stock read
-- ═══════════════════════════════════════════════════════

-- Stable, so PostgREST allows a plain GET:
--   /rest/v1/rpc/get_product_stock?apikey=<anon key>
-- (a simple request: no custom headers, no CORS preflight).
-- Returns only what's out: [{product_id, size, since}]. [] means all in.
--
-- The apikey parameter is ignored. It's there because PostgREST reads every
-- query-string key as a function argument, and a gateway that passes
-- ?apikey= through (local Kong does) would otherwise give a 404. With it,
-- the same GET works whether or not the gateway strips the key.
create or replace function public.get_product_stock(apikey text default null)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object('product_id', s.product_id, 'size', s.size, 'since', s.updated_at)
      order by s.product_id, s.size
    ),
    '[]'::json
  )
  from public.product_stock s
  where not s.in_stock;
$$;

revoke all on function public.get_product_stock(text) from public, anon;
grant execute on function public.get_product_stock(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 6. Retention
-- ═══════════════════════════════════════════════════════

-- Same body as 20260924000000, plus the order rate-limit rows. Orders
-- themselves are never purged (PM decision).
create or replace function public.purge_site_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.site_events
  where created_at < timezone('utc', now()) - interval '13 months';

  delete from public.site_event_rate_limits
  where attempted_at < timezone('utc', now()) - interval '1 hour';

  delete from public.order_rate_limits
  where attempted_at < timezone('utc', now()) - interval '1 hour';
end;
$$;

revoke all on function public.purge_site_events() from public, anon, authenticated;
grant execute on function public.purge_site_events() to service_role;
