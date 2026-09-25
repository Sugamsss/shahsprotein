-- Migration: 20260925000002_admin_coupons.sql
-- Lets the founder manage coupon codes from the admin area: list, add,
-- edit, and turn codes on or off. Admin only; the public side is unchanged
-- (still only check_coupon(), still no read of public.coupons).
--
-- There is no delete. Turning a code off retires it and keeps its history,
-- and a code can't be edited after it's made, so an old code can't quietly
-- come back with a different meaning.
--
-- Validation errors use errcode 22023 with a plain message the admin screen
-- shows as-is. Anything else is a real failure.

-- ═══════════════════════════════════════════════════════
-- 1. Shared checks (internal, not callable from the API)
-- ═══════════════════════════════════════════════════════

-- Takes values that are already trimmed (empty notes already null).
-- Mirrors the table's checks so the founder gets a friendly message instead
-- of a raw constraint error, and caps internal_note, which the table doesn't.
create or replace function public.validate_admin_coupon_fields(
  p_description text,
  p_minimum_note text,
  p_internal_note text
)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_description is null or p_description = '' then
    raise exception using message = 'Add a short description, like "10% off your order".', errcode = '22023';
  end if;

  if char_length(p_description) > 60 then
    raise exception using message = 'Keep the description to 60 characters or fewer.', errcode = '22023';
  end if;

  -- Same pattern as the coupons.description check in 20260925000000.
  if p_description ~* '(₹|(^|[^a-z])rs([^a-z]|$)|(^|[^a-z])inr([^a-z]|$))' then
    raise exception using
      message = 'The description can''t mention an amount in rupees (₹, Rs or INR). Try "Flat discount on your order" and share the amount in the chat.',
      errcode = '22023';
  end if;

  if p_minimum_note is not null and char_length(p_minimum_note) > 120 then
    raise exception using message = 'Keep the minimum note to 120 characters or fewer.', errcode = '22023';
  end if;

  if p_internal_note is not null and char_length(p_internal_note) > 500 then
    raise exception using message = 'Keep the private note to 500 characters or fewer.', errcode = '22023';
  end if;
end;
$$;

revoke all on function public.validate_admin_coupon_fields(text, text, text) from public, anon, authenticated;

-- One place for the row shape every admin coupon RPC returns.
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
    'expires_at', p_coupon.expires_at,
    'minimum_note', p_coupon.minimum_note,
    'internal_note', p_coupon.internal_note,
    'created_at', p_coupon.created_at,
    'updated_at', p_coupon.updated_at
  );
$$;

revoke all on function public.admin_coupon_json(public.coupons) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. List
-- ═══════════════════════════════════════════════════════

-- All codes, newest first. "Expired" is worked out by the UI from expires_at.
create or replace function public.get_admin_coupons()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select coalesce(
    json_agg(public.admin_coupon_json(c) order by c.created_at desc, c.code),
    '[]'::json
  ) into result
  from public.coupons c;

  return result;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 3. Create
-- ═══════════════════════════════════════════════════════

create or replace function public.create_admin_coupon(
  p_code text,
  p_description text,
  p_expires_at timestamptz default null,
  p_minimum_note text default null,
  p_internal_note text default null
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

  -- A past expiry on a new code would make a code that never works. On
  -- update it's allowed, since that's how to end a code right now.
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception using message = 'That expiry date has already passed. Pick a later date, or leave it empty.', errcode = '22023';
  end if;

  if exists (select 1 from public.coupons c where upper(c.code) = v_code) then
    raise exception using message = 'That code already exists. Turn it back on instead of adding it again.', errcode = '22023';
  end if;

  begin
    insert into public.coupons (code, description, expires_at, minimum_note, internal_note)
    values (v_code, v_description, p_expires_at, v_minimum_note, v_internal_note)
    returning * into new_coupon;
  exception
    -- Two saves racing past the check above.
    when unique_violation then
      raise exception using message = 'That code already exists. Turn it back on instead of adding it again.', errcode = '22023';
  end;

  return public.admin_coupon_json(new_coupon);
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 4. Update (full replace of the editable fields; code is fixed)
-- ═══════════════════════════════════════════════════════

-- p_expires_at = null means no expiry. A past date is allowed (ends it now).
create or replace function public.update_admin_coupon(
  p_id uuid,
  p_description text,
  p_active boolean,
  p_expires_at timestamptz,
  p_minimum_note text,
  p_internal_note text
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

  if p_active is null then
    raise exception using message = 'Choose whether the code is on or off.', errcode = '22023';
  end if;

  update public.coupons
  set
    description = v_description,
    active = p_active,
    expires_at = p_expires_at,
    minimum_note = v_minimum_note,
    internal_note = v_internal_note
  where id = p_id
  returning * into updated_coupon;

  if updated_coupon.id is null then
    raise exception using message = 'We couldn''t find that code. Refresh the list and try again.', errcode = '22023';
  end if;

  return public.admin_coupon_json(updated_coupon);
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 5. On/off toggle
-- ═══════════════════════════════════════════════════════

create or replace function public.set_admin_coupon_active(p_id uuid, p_active boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_coupon public.coupons;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_active is null then
    raise exception using message = 'Choose whether the code is on or off.', errcode = '22023';
  end if;

  update public.coupons
  set active = p_active
  where id = p_id
  returning * into updated_coupon;

  if updated_coupon.id is null then
    raise exception using message = 'We couldn''t find that code. Refresh the list and try again.', errcode = '22023';
  end if;

  return public.admin_coupon_json(updated_coupon);
end;
$$;

-- Supabase grants execute on new functions to anon and authenticated by
-- default, so revoking from public alone isn't enough (see 000006).
revoke all on function public.get_admin_coupons() from public, anon;
grant execute on function public.get_admin_coupons() to authenticated;

revoke all on function public.create_admin_coupon(text, text, timestamptz, text, text) from public, anon;
grant execute on function public.create_admin_coupon(text, text, timestamptz, text, text) to authenticated;

revoke all on function public.update_admin_coupon(uuid, text, boolean, timestamptz, text, text) from public, anon;
grant execute on function public.update_admin_coupon(uuid, text, boolean, timestamptz, text, text) to authenticated;

revoke all on function public.set_admin_coupon_active(uuid, boolean) from public, anon;
grant execute on function public.set_admin_coupon_active(uuid, boolean) to authenticated;
