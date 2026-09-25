-- Migration: 20260925000000_coupons.sql
-- Coupon codes for the "Your order" popup. The founder adds codes from the
-- SQL editor. The site can only ask "is this code good?" through
-- check_coupon(), which answers valid + a public description, or not valid.
-- Nobody outside the database can list codes or read the private notes.
--
-- The rate limit keeps a hashed IP in its own table for about an hour, so
-- codes can't be guessed by brute force.

-- ═══════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Za-z0-9-]{3,24}$'),
  -- Shown to the customer, e.g. "10% off your order". No prices on the site,
  -- so no rupee sign, "Rs" or "INR" (any case, including "Rs.50").
  description text not null check (
    char_length(btrim(description)) between 1 and 60
    and description !~* '(₹|(^|[^a-z])rs([^a-z]|$)|(^|[^a-z])inr([^a-z]|$))'
  ),
  active boolean not null default true,
  expires_at timestamptz,
  -- Private reminders for the founder. Never returned by check_coupon().
  minimum_note text check (minimum_note is null or char_length(minimum_note) <= 120),
  internal_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Codes are matched ignoring case, so they must be unique ignoring case.
create unique index if not exists coupons_code_upper_key
  on public.coupons (upper(code));

-- Reuses the shared updated_at trigger function from 000003.
drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at
  before update on public.coupons
  for each row execute function public.update_waitlist_member_timestamp();

create table if not exists public.coupon_check_rate_limits (
  request_key text not null,
  attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists coupon_check_rate_limits_lookup_idx
  on public.coupon_check_rate_limits (request_key, attempted_at desc);

alter table public.coupons enable row level security;
alter table public.coupon_check_rate_limits enable row level security;

-- No policies: anon and authenticated can't list, read, change or delete
-- rows. The only way in is check_coupon() below.
revoke all on public.coupons from anon, authenticated;
revoke all on public.coupon_check_rate_limits from anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Public check RPC
-- ═══════════════════════════════════════════════════════

-- Returns {"valid": true, "description": "..."} or {"valid": false}, nothing
-- else. Too many checks raise an error (HTTP 429) instead of answering, so
-- the site says "couldn't check" and never marks a real code as not valid.
create or replace function public.check_coupon(p_code text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_headers text := current_setting('request.headers', true);
  v_request_ip text := 'unknown';
  v_request_hash text;
  v_code text;
  v_description text;
  attempts integer;
begin
  -- Rate limit first, before looking at the code. Same IP order as
  -- track_site_event(): cf-connecting-ip is set by Cloudflare and can't be
  -- supplied by the caller. Unlike click tracking, an unknown IP is not
  -- skipped: all such calls share one 'unknown' bucket.
  if request_headers is not null and request_headers <> '' then
    v_request_ip := coalesce(
      nullif(trim(request_headers::jsonb ->> 'cf-connecting-ip'), ''),
      nullif(trim(split_part(request_headers::jsonb ->> 'x-forwarded-for', ',', 1)), ''),
      'unknown'
    );
  end if;

  v_request_hash := left(encode(digest(v_request_ip, 'sha256'), 'hex'), 64);

  -- Parallel calls from one IP wait their turn, so a burst can't slip past
  -- the count.
  perform pg_advisory_xact_lock(hashtext('check_coupon:' || v_request_hash));

  delete from public.coupon_check_rate_limits
  where attempted_at < timezone('utc', now()) - interval '1 hour';

  select count(*) into attempts
  from public.coupon_check_rate_limits limits
  where limits.request_key = v_request_hash
    and limits.attempted_at > timezone('utc', now()) - interval '1 hour';

  if attempts >= 30 then
    raise exception using message = 'Too many coupon checks. Try again later.', errcode = 'PT429';
  end if;

  insert into public.coupon_check_rate_limits (request_key)
  values (v_request_hash);

  -- Anything that can't be a code is not valid, without a lookup.
  v_code := btrim(p_code, E' \t\r\n');
  if v_code is null or v_code !~ '^[A-Za-z0-9-]{3,24}$' then
    return json_build_object('valid', false);
  end if;

  select c.description into v_description
  from public.coupons c
  where upper(c.code) = upper(v_code)
    and c.active
    and (c.expires_at is null or c.expires_at > now());

  if v_description is null then
    return json_build_object('valid', false);
  end if;

  return json_build_object('valid', true, 'description', v_description);
end;
$$;

-- Supabase grants execute on new functions to anon and authenticated by
-- default; revoke from public, then grant only what the site needs.
revoke all on function public.check_coupon(text) from public;
grant execute on function public.check_coupon(text) to anon, authenticated;
