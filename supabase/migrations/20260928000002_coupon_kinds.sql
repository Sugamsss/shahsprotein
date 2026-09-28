-- Migration: 20260928000002_coupon_kinds.sql
-- Coupon kinds for the admin. Every coupon is Repeat (a standing offer) or
-- One-time (once per phone number). Admin only: nothing public changes.
-- check_coupon() still answers only valid + description, and the site never
-- learns a coupon's kind.
--
-- 1. coupons.kind: 'repeat' or 'one_time'. Existing coupons become One-time,
--    so nothing fills in by surprise.
-- 2. The admin coupon RPCs carry it. create_admin_coupon() and
--    update_admin_coupon() get a last p_kind argument with a default, so a
--    call without it works exactly as before (create: One-time; update: keeps
--    the kind). The old signatures are dropped, not overloaded: two versions
--    that both fit a call would make PostgREST refuse it.
-- 3. get_admin_coupon_uses(p_phone): the coupons one phone number used, one
--    row per order that isn't cancelled, newest first. Add order uses it to
--    fill in a returning customer's Repeat coupon and to warn (never block)
--    when a One-time coupon is used again. Website orders count too. Matched
--    on orders.coupon_code: codes are unique ignoring case and can't be
--    renamed, and it also covers an order saved before its code existed.
--
-- Validation errors use errcode 22023 with a plain message the admin screen
-- shows as-is.

-- ═══════════════════════════════════════════════════════
-- 1. Column
-- ═══════════════════════════════════════════════════════

alter table public.coupons
  add column if not exists kind text not null default 'one_time'
  constraint coupons_kind_check check (kind in ('repeat', 'one_time'));

-- ═══════════════════════════════════════════════════════
-- 2. Admin coupon RPCs
-- ═══════════════════════════════════════════════════════

-- Same shape as 20260925000002, plus kind. get_admin_coupons() (20260926000001)
-- builds on this, so the list carries kind with no change of its own.
create or replace function public.admin_coupon_json(p_coupon public.coupons)
returns json
language sql
immutable
set search_path = public
as $$
  select json_build_object(
    'id', p_coupon.id,
    'code', p_coupon.code,
    'description', p_coupon.description,
    'active', p_coupon.active,
    'kind', p_coupon.kind,
    'expires_at', p_coupon.expires_at,
    'minimum_note', p_coupon.minimum_note,
    'internal_note', p_coupon.internal_note,
    'created_at', p_coupon.created_at,
    'updated_at', p_coupon.updated_at
  );
$$;

revoke all on function public.admin_coupon_json(public.coupons) from public, anon, authenticated;

-- Null is "not given". Internal.
create or replace function public.coupon_check_kind(p_kind text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_kind is not null and p_kind not in ('repeat', 'one_time') then
    raise exception using message = 'Choose Repeat or One-time.', errcode = '22023';
  end if;
end;
$$;

revoke all on function public.coupon_check_kind(text) from public, anon, authenticated;

drop function if exists public.create_admin_coupon(text, text, timestamptz, text, text);

-- As in 20260925000002, plus p_kind (null or left out: One-time).
create or replace function public.create_admin_coupon(
  p_code text,
  p_description text,
  p_expires_at timestamptz default null,
  p_minimum_note text default null,
  p_internal_note text default null,
  p_kind text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(p_code, E' \t\r\n'));
  v_description text := btrim(p_description, E' \t\r\n');
  v_minimum_note text := nullif(btrim(p_minimum_note, E' \t\r\n'), '');
  v_internal_note text := nullif(btrim(p_internal_note, E' \t\r\n'), '');
  new_coupon public.coupons;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if v_code is null or v_code !~ '^[A-Z0-9-]{3,24}$' then
    raise exception using message = 'Codes are 3 to 24 letters, numbers or hyphens.', errcode = '22023';
  end if;

  perform public.validate_admin_coupon_fields(v_description, v_minimum_note, v_internal_note);
  perform public.coupon_check_kind(p_kind);

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception using message = 'That expiry date has already passed. Pick a later date, or leave it empty.', errcode = '22023';
  end if;

  if exists (select 1 from public.coupons c where upper(c.code) = v_code) then
    raise exception using message = 'That code already exists. Turn it back on instead of adding it again.', errcode = '22023';
  end if;

  begin
    insert into public.coupons (code, description, expires_at, minimum_note, internal_note, kind)
    values (v_code, v_description, p_expires_at, v_minimum_note, v_internal_note, coalesce(p_kind, 'one_time'))
    returning * into new_coupon;
  exception
    when unique_violation then
      raise exception using message = 'That code already exists. Turn it back on instead of adding it again.', errcode = '22023';
  end;

  return public.admin_coupon_json(new_coupon);
end;
$$;

drop function if exists public.update_admin_coupon(uuid, text, boolean, timestamptz, text, text);

-- As in 20260925000002, plus p_kind (null or left out: keep the kind it has).
create or replace function public.update_admin_coupon(
  p_id uuid,
  p_description text,
  p_active boolean,
  p_expires_at timestamptz,
  p_minimum_note text,
  p_internal_note text,
  p_kind text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_description text := btrim(p_description, E' \t\r\n');
  v_minimum_note text := nullif(btrim(p_minimum_note, E' \t\r\n'), '');
  v_internal_note text := nullif(btrim(p_internal_note, E' \t\r\n'), '');
  updated_coupon public.coupons;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  perform public.validate_admin_coupon_fields(v_description, v_minimum_note, v_internal_note);
  perform public.coupon_check_kind(p_kind);

  if p_active is null then
    raise exception using message = 'Choose whether the code is on or off.', errcode = '22023';
  end if;

  update public.coupons
  set
    description = v_description,
    active = p_active,
    expires_at = p_expires_at,
    minimum_note = v_minimum_note,
    internal_note = v_internal_note,
    kind = coalesce(p_kind, kind)
  where id = p_id
  returning * into updated_coupon;

  if updated_coupon.id is null then
    raise exception using message = 'We couldn''t find that code. Refresh the list and try again.', errcode = '22023';
  end if;

  return public.admin_coupon_json(updated_coupon);
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 3. One number's coupons
-- ═══════════════════════════════════════════════════════

-- [{order_id, order_code, coupon_code, created_at}], newest first, at most
-- 50 (a number with more coupon orders than that is only missing old ones).
-- p_phone is cleaned like the order form's phone (10 digits get 91 in
-- front); anything that isn't a phone number is [], not an error.
create or replace function public.get_admin_coupon_uses(p_phone text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text := public.order_try_normalize_phone(p_phone);
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if v_phone is null then
    return '[]'::json;
  end if;

  return coalesce((
    select json_agg(
      json_build_object(
        'order_id', u.id,
        'order_code', u.code,
        'coupon_code', u.coupon_code,
        'created_at', u.created_at
      )
      order by u.created_at desc, u.id desc
    )
    from (
      select o.id, o.code, o.coupon_code, o.created_at
      from public.orders o
      where o.phone = v_phone
        and o.coupon_code is not null
        and o.status <> 'cancelled'
      order by o.created_at desc, o.id desc
      limit 50
    ) u
  ), '[]'::json);
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 4. Grants
-- ═══════════════════════════════════════════════════════

-- Supabase grants execute on new functions to anon and authenticated by
-- default; admin RPCs are for signed-in admins only (is_admin() inside).
revoke all on function public.create_admin_coupon(text, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.create_admin_coupon(text, text, timestamptz, text, text, text) to authenticated;

revoke all on function public.update_admin_coupon(uuid, text, boolean, timestamptz, text, text, text) from public, anon;
grant execute on function public.update_admin_coupon(uuid, text, boolean, timestamptz, text, text, text) to authenticated;

revoke all on function public.get_admin_coupon_uses(text) from public, anon;
grant execute on function public.get_admin_coupon_uses(text) to authenticated;
