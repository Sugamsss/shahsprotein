-- Migration: 20260926000001_admin_orders.sql
-- The order book admin: orders, customers, stock, the home overview, the
-- email list and who has access. Every RPC here is admin only: it starts
-- with the is_admin() check and is granted to authenticated, never anon.
-- get_admin_coupons() is replaced to add how often each code was used.
--
-- Validation errors use errcode 22023 with a plain sentence the admin shows
-- as is. Anything else is a real failure. All "day" and "week" maths runs in
-- Asia/Kolkata, and weeks start on Monday.
--
-- "Confirmed and later" means status in ('confirmed','sent','delivered'). It's
-- used for what's selling and coupon use, since New and stale orders may
-- never have arrived.

-- ═══════════════════════════════════════════════════════
-- 1. Shared helpers (internal, not callable from the API)
-- ═══════════════════════════════════════════════════════

-- Phone numbers are stored as digits with the country code.
--   10 digits                → 91 in front (an Indian mobile)
--   11 digits starting 0     → drop the 0, 91 in front
--   12 digits starting 91    → kept
--   any other 11 to 15 digits → kept (a foreign number)
-- A leading 00 (the international dialling prefix) is dropped first, and a
-- number can't start with 0 after that. Returns null for anything else.
create or replace function public.order_try_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if v_digits like '00%' then
    v_digits := substr(v_digits, 3);
  end if;

  if char_length(v_digits) = 10 then
    v_digits := '91' || v_digits;
  elsif char_length(v_digits) = 11 and v_digits like '0%' then
    v_digits := '91' || substr(v_digits, 2);
  end if;

  if v_digits ~ '^[1-9][0-9]{10,14}$' then
    return v_digits;
  end if;

  return null;
end;
$$;

revoke all on function public.order_try_normalize_phone(text) from public, anon, authenticated;

-- The field checks below take the raw JSON value of one key. SQL null (key
-- missing) and JSON null both mean "no value".

create or replace function public.order_check_phone(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text;
  v_phone text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_value) not in ('string', 'number') then
    raise exception using message = 'That phone number doesn''t look right.', errcode = '22023';
  end if;

  v_text := btrim(p_value #>> '{}');
  if v_text = '' then
    return null;
  end if;

  v_phone := public.order_try_normalize_phone(v_text);
  if v_phone is null then
    raise exception using message = 'That phone number doesn''t look right.', errcode = '22023';
  end if;

  return v_phone;
end;
$$;

revoke all on function public.order_check_phone(jsonb) from public, anon, authenticated;

-- Empty clears the name. Otherwise cleaned like submit_order(), 2 to 60.
create or replace function public.order_check_name(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_name text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_value) <> 'string' then
    raise exception using message = 'A name is 2 to 60 characters.', errcode = '22023';
  end if;

  v_name := public.order_clean_name(p_value #>> '{}');
  if v_name = '' then
    return null;
  end if;

  if char_length(v_name) not between 2 and 60 then
    raise exception using message = 'A name is 2 to 60 characters.', errcode = '22023';
  end if;

  return v_name;
end;
$$;

revoke all on function public.order_check_name(jsonb) from public, anon, authenticated;

create or replace function public.order_check_pincode(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_pincode text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_value) not in ('string', 'number') then
    raise exception using message = 'A pincode is 6 digits.', errcode = '22023';
  end if;

  v_pincode := btrim(p_value #>> '{}');
  if v_pincode = '' then
    return null;
  end if;

  if v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception using message = 'A pincode is 6 digits.', errcode = '22023';
  end if;

  return v_pincode;
end;
$$;

revoke all on function public.order_check_pincode(jsonb) from public, anon, authenticated;

-- Trimmed; an empty note is stored as null.
create or replace function public.order_check_note(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_note text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_value) <> 'string' then
    raise exception using message = 'That note doesn''t look right.', errcode = '22023';
  end if;

  v_note := nullif(btrim(p_value #>> '{}', E' \t\r\n'), '');
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception using message = 'Keep the note to 1,000 characters or fewer.', errcode = '22023';
  end if;

  return v_note;
end;
$$;

revoke all on function public.order_check_note(jsonb) from public, anon, authenticated;

-- Whole rupees, 0 to 10,00,000. A JSON number or a string of digits.
create or replace function public.order_check_amount(p_value jsonb)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  v_text := case when jsonb_typeof(p_value) in ('string', 'number') then btrim(p_value #>> '{}') end;
  if v_text = '' and jsonb_typeof(p_value) = 'string' then
    return null;
  end if;

  if v_text is null or v_text !~ '^[0-9]{1,7}$' or v_text::integer > 1000000 then
    raise exception using message = 'Keep the amount between 0 and 10,00,000.', errcode = '22023';
  end if;

  return v_text::integer;
end;
$$;

revoke all on function public.order_check_amount(jsonb) from public, anon, authenticated;

-- Unlike submit_order(), a malformed coupon is an error here: a person
-- typed it and can fix it.
create or replace function public.order_check_coupon(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_coupon text;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_value) <> 'string' then
    raise exception using message = 'That coupon code doesn''t look right.', errcode = '22023';
  end if;

  v_coupon := upper(btrim(p_value #>> '{}', E' \t\r\n'));
  if v_coupon = '' then
    return null;
  end if;

  if v_coupon !~ '^[A-Z0-9-]{3,24}$' then
    raise exception using message = 'That coupon code doesn''t look right.', errcode = '22023';
  end if;

  return v_coupon;
end;
$$;

revoke all on function public.order_check_coupon(jsonb) from public, anon, authenticated;

create or replace function public.order_check_status(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_value is null
     or jsonb_typeof(p_value) <> 'string'
     or (p_value #>> '{}') not in ('new', 'confirmed', 'sent', 'delivered', 'cancelled') then
    raise exception using message = 'Unknown status.', errcode = '22023';
  end if;

  return p_value #>> '{}';
end;
$$;

revoke all on function public.order_check_status(jsonb) from public, anon, authenticated;

create or replace function public.order_check_boolean(p_value jsonb, p_key text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'boolean' then
    raise exception using message = format('%s must be true or false.', initcap(p_key)), errcode = '22023';
  end if;

  return (p_value #>> '{}')::boolean;
end;
$$;

revoke all on function public.order_check_boolean(jsonb, text) from public, anon, authenticated;

-- A fresh, unused code, made like the site makes one (rejection sampling, so
-- no letter is more likely than another). Returns holding the code's
-- advisory lock, so nobody else can take it before the insert.
create or replace function public.order_new_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea;
  v_byte integer;
  v_code text;
  v_tries integer := 0;
begin
  loop
    v_tries := v_tries + 1;
    if v_tries > 50 then
      raise exception 'Could not make an unused order code.';
    end if;

    v_bytes := gen_random_bytes(16);
    v_code := 'SN-';
    for i in 0..15 loop
      v_byte := get_byte(v_bytes, i);
      -- 240 = 8 * 30: dropping higher bytes keeps every letter equally likely.
      if v_byte < 240 then
        v_code := v_code || substr(v_alphabet, (v_byte % 30) + 1, 1);
      end if;
      exit when char_length(v_code) = 8;
    end loop;

    continue when char_length(v_code) < 8;

    perform pg_advisory_xact_lock(hashtext('order_code:' || v_code));
    if not public.order_code_taken(v_code) then
      return v_code;
    end if;
  end loop;
end;
$$;

revoke all on function public.order_new_code() from public, anon, authenticated;

-- The one order shape every admin RPC returns.
create or replace function public.admin_order_json(p_order public.orders)
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'id', p_order.id,
    'code', p_order.code,
    'message_code', substring(p_order.code from '^SN-[A-Z0-9]{5}'),
    'source', p_order.source,
    'status', p_order.status,
    'paid', p_order.paid_at is not null,
    'paid_at', p_order.paid_at,
    'kept', p_order.kept_at is not null,
    'stale', p_order.status = 'new'
      and p_order.kept_at is null
      and p_order.status_changed_at < now() - interval '48 hours',
    'name', p_order.name,
    'pincode', p_order.pincode,
    'phone', p_order.phone,
    'note', p_order.note,
    'amount', p_order.amount,
    'coupon', case
      when p_order.coupon_code is null then null
      else json_build_object(
        'code', p_order.coupon_code,
        'valid', coalesce(p_order.coupon_valid, false),
        'known', p_order.coupon_id is not null
      )
    end,
    'lines', coalesce((
      select json_agg(
        json_build_object('product_id', l.product_id, 'size', l.size, 'quantity', l.quantity)
        order by l.product_id, l.size
      )
      from public.order_lines l
      where l.order_id = p_order.id
    ), '[]'::json),
    'packs', coalesce((
      select sum(l.quantity) from public.order_lines l where l.order_id = p_order.id
    ), 0),
    'customer', case
      when p_order.phone is null then null
      else (
        -- This order's place among the phone's not-cancelled orders, and
        -- how many that phone has.
        select json_build_object(
          'order_number', count(*) filter (
            where (o.created_at, o.id) < (p_order.created_at, p_order.id)
          ) + 1,
          'orders', count(*)
        )
        from public.orders o
        where o.phone = p_order.phone
          and o.status <> 'cancelled'
      )
    end,
    'created_at', p_order.created_at,
    'updated_at', p_order.updated_at,
    'status_changed_at', p_order.status_changed_at
  );
$$;

revoke all on function public.admin_order_json(public.orders) from public, anon, authenticated;

-- The filters behind get_admin_orders(), written once so the page, the tie
-- boundary and "is there more?" can't disagree. Search terms arrive already
-- turned into LIKE patterns (null means "not searching on this").
create or replace function public.admin_filter_orders(
  p_view text,
  p_status text[],
  p_paid boolean,
  p_source text,
  p_from timestamptz,
  p_to timestamptz,
  p_before timestamptz,
  p_phone_given boolean,
  p_phone text,
  p_code_like text,
  p_name_like text,
  p_digits_like text
)
returns setof public.orders
language sql
stable
set search_path = public
as $$
  select o.*
  from public.orders o
  where (
      p_view = 'all'
      or (p_view = 'todo' and (
        o.status in ('new', 'confirmed', 'sent')
        or (o.status = 'delivered' and o.paid_at is null)
      ))
      or (p_view = 'done' and (
        (o.status = 'delivered' and o.paid_at is not null)
        or o.status = 'cancelled'
      ))
    )
    and (p_status is null or o.status = any (p_status))
    and (p_paid is null or (o.paid_at is not null) = p_paid)
    and (p_source is null or o.source = p_source)
    and (p_from is null or o.created_at >= p_from)
    and (p_to is null or o.created_at < p_to)
    and (p_before is null or o.created_at < p_before)
    -- A phone that can't be normalised matches nothing.
    and (not p_phone_given or o.phone = p_phone)
    and (
      (p_code_like is null and p_name_like is null and p_digits_like is null)
      or o.code like p_code_like
      or o.name ilike p_name_like
      or o.phone like p_digits_like
    );
$$;

revoke all on function public.admin_filter_orders(text, text[], boolean, text, timestamptz, timestamptz, timestamptz, boolean, text, text, text, text)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Who am I, who has access
-- ═══════════════════════════════════════════════════════

-- The admin's auth gate. Raises for anyone who isn't an admin.
create or replace function public.get_admin_me()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin public.admin_users;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select * into v_admin from public.admin_users where id = auth.uid();

  return json_build_object(
    'id', v_admin.id,
    'email', v_admin.email,
    'display_name', v_admin.display_name
  );
end;
$$;

create or replace function public.get_admin_users()
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

  select coalesce(json_agg(
    json_build_object(
      'email', a.email,
      'display_name', a.display_name,
      'created_at', a.created_at,
      'is_me', a.id = auth.uid()
    )
    order by a.created_at, a.email
  ), '[]'::json) into result
  from public.admin_users a;

  return result;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 3. Orders: list and detail
-- ═══════════════════════════════════════════════════════

-- Newest first. p_before pages strictly older than a created_at. A page is
-- never cut inside a group of orders with the same created_at (hand-added
-- orders back-dated to the same moment would otherwise be skipped), so a
-- page can be a little longer than p_limit.
-- p_from is inclusive and p_to exclusive (send the start of the next day).
create or replace function public.get_admin_orders(
  p_view text default 'todo',
  p_status text[] default null,
  p_paid boolean default null,
  p_search text default null,
  p_phone text default null,
  p_source text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_view text := coalesce(p_view, 'todo');
  v_status text[] := nullif(p_status, '{}'::text[]);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_search text;
  v_upper text;
  v_digits text;
  v_code_like text;
  v_name_like text;
  v_digits_like text;
  v_phone_given boolean := nullif(btrim(p_phone), '') is not null;
  v_phone text;
  v_boundary timestamptz;
  v_next_before timestamptz;
  v_orders json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if v_view not in ('todo', 'done', 'all') then
    raise exception using message = 'Unknown view.', errcode = '22023';
  end if;

  if v_status is not null and exists (
    select 1 from unnest(v_status) s
    where s is null or s not in ('new', 'confirmed', 'sent', 'delivered', 'cancelled')
  ) then
    raise exception using message = 'Unknown status.', errcode = '22023';
  end if;

  if p_source is not null and p_source not in ('site', 'whatsapp', 'call', 'instagram', 'in_person') then
    raise exception using message = 'Unknown source.', errcode = '22023';
  end if;

  if v_phone_given then
    v_phone := public.order_try_normalize_phone(p_phone);
  end if;

  -- Search: trimmed, a leading # dropped, then code OR name OR phone digits.
  v_search := btrim(regexp_replace(btrim(coalesce(p_search, '')), '^#+', ''));
  if v_search <> '' then
    v_upper := upper(v_search);
    -- "7kq4m" and "SN-7KQ4M" both find SN-7KQ4M and SN-7KQ4M-2.
    if v_upper ~ '^[A-Z0-9-]+$' then
      v_code_like := case when v_upper like 'SN-%' then v_upper else 'SN-' || v_upper end || '%';
    end if;

    v_name_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';

    v_digits := regexp_replace(v_search, '[^0-9]', '', 'g');
    if char_length(v_digits) >= 4 then
      v_digits_like := '%' || v_digits || '%';
    end if;
  end if;

  -- The created_at of the p_limit-th row, if there are that many.
  select f.created_at into v_boundary
  from public.admin_filter_orders(
    v_view, v_status, p_paid, p_source, p_from, p_to, p_before,
    v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like
  ) f
  order by f.created_at desc, f.id desc
  offset v_limit - 1
  limit 1;

  select coalesce(json_agg(public.admin_order_json(f) order by f.created_at desc, f.id desc), '[]'::json)
  into v_orders
  from public.admin_filter_orders(
    v_view, v_status, p_paid, p_source, p_from, p_to, p_before,
    v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like
  ) f
  where v_boundary is null or f.created_at >= v_boundary;

  if v_boundary is not null and exists (
    select 1
    from public.admin_filter_orders(
      v_view, v_status, p_paid, p_source, p_from, p_to, v_boundary,
      v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like
    )
  ) then
    v_next_before := v_boundary;
  end if;

  return json_build_object('orders', v_orders, 'next_before', v_next_before);
end;
$$;

-- One order by code (with or without SN- or #, any case), with its history
-- and a phone suggestion. Null when there's no such order.
create or replace function public.get_admin_order(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(regexp_replace(btrim(coalesce(p_code, '')), '^#+', '')));
  v_order public.orders;
  v_history json;
  v_suggestion json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if v_code not like 'SN-%' then
    v_code := 'SN-' || v_code;
  end if;

  select * into v_order from public.orders o where o.code = v_code;
  if v_order.id is null then
    return null;
  end if;

  select coalesce(json_agg(
    json_build_object(
      'event', e.event,
      'at', e.at,
      'by_name', coalesce(a.display_name, a.email)
    )
    order by e.at, e.id
  ), '[]'::json) into v_history
  from public.order_events e
  left join public.admin_users a on a.id = e.by
  where e.order_id = v_order.id;

  -- Only a suggestion: the latest other order with the same name and
  -- pincode that has a phone. Nothing is linked automatically.
  if v_order.phone is null and v_order.name is not null and v_order.pincode is not null then
    select json_build_object('phone', o.phone, 'code', o.code, 'created_at', o.created_at)
    into v_suggestion
    from public.orders o
    where o.id <> v_order.id
      and o.phone is not null
      and lower(o.name) = lower(v_order.name)
      and o.pincode = v_order.pincode
    order by o.created_at desc, o.id desc
    limit 1;
  end if;

  return (
    public.admin_order_json(v_order)::jsonb
    || jsonb_build_object('history', v_history, 'phone_suggestion', v_suggestion)
  )::json;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 4. Orders: change, add, edit, delete
-- ═══════════════════════════════════════════════════════

-- Only the keys present change; a key present with null clears the field
-- where that's allowed. One call covers the row button, Paid, Keep, the
-- Confirm sheet (status + phone + amount together) and Undo.
create or replace function public.update_admin_order(p_id uuid, p_changes jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception using message = 'Nothing to change.', errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('status', 'paid', 'kept', 'phone', 'amount', 'note', 'name', 'pincode') then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  select * into v_order from public.orders where id = p_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;

  if p_changes ? 'status' then
    v_order.status := public.order_check_status(p_changes -> 'status');
  end if;

  if p_changes ? 'paid' then
    v_order.paid_at := case
      when public.order_check_boolean(p_changes -> 'paid', 'paid')
        then coalesce(v_order.paid_at, timezone('utc', now()))
    end;
  end if;

  if p_changes ? 'kept' then
    v_order.kept_at := case
      when public.order_check_boolean(p_changes -> 'kept', 'kept')
        then coalesce(v_order.kept_at, timezone('utc', now()))
    end;
  end if;

  if p_changes ? 'phone' then
    v_order.phone := public.order_check_phone(p_changes -> 'phone');
  end if;

  if p_changes ? 'amount' then
    v_order.amount := public.order_check_amount(p_changes -> 'amount');
  end if;

  if p_changes ? 'note' then
    v_order.note := public.order_check_note(p_changes -> 'note');
  end if;

  if p_changes ? 'name' then
    v_order.name := public.order_check_name(p_changes -> 'name');
  end if;

  if p_changes ? 'pincode' then
    v_order.pincode := public.order_check_pincode(p_changes -> 'pincode');
  end if;

  if v_order.source = 'site' and (v_order.name is null or v_order.pincode is null) then
    raise exception using message = 'An order from the site keeps its name and pincode.', errcode = '22023';
  end if;

  if v_order.name is null and v_order.phone is null then
    raise exception using message = 'Add a name or a phone number.', errcode = '22023';
  end if;

  update public.orders
  set
    status = v_order.status,
    paid_at = v_order.paid_at,
    kept_at = v_order.kept_at,
    phone = v_order.phone,
    amount = v_order.amount,
    note = v_order.note,
    name = v_order.name,
    pincode = v_order.pincode
  where id = p_id
  returning * into v_order;

  return public.admin_order_json(v_order);
end;
$$;

-- Add by hand (p_id null) or a full edit. See the contract for the keys.
-- p_order has a default only because SQL needs one after p_id's; it's
-- required in practice (no lines means "Add at least one item.").
create or replace function public.save_admin_order(p_id uuid default null, p_order jsonb default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input jsonb := coalesce(p_order, '{}'::jsonb);
  v_key text;
  v_lines jsonb;
  v_name text;
  v_phone text;
  v_pincode text;
  v_note text;
  v_amount integer;
  v_coupon text;
  v_coupon_id uuid;
  v_coupon_valid boolean;
  v_source text;
  v_status text := 'confirmed';
  v_paid boolean := false;
  v_created_at timestamptz := timezone('utc', now());
  v_code text;
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if jsonb_typeof(v_input) <> 'object' then
    raise exception using message = 'Add at least one item.', errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(v_input) loop
    if v_key not in (
      'source', 'code', 'name', 'phone', 'pincode', 'note', 'amount',
      'coupon', 'lines', 'status', 'paid', 'created_at'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  v_lines := public.order_clean_lines(v_input -> 'lines', 99);
  v_name := public.order_check_name(v_input -> 'name');
  v_phone := public.order_check_phone(v_input -> 'phone');
  v_pincode := public.order_check_pincode(v_input -> 'pincode');
  v_note := public.order_check_note(v_input -> 'note');
  v_amount := public.order_check_amount(v_input -> 'amount');
  v_coupon := public.order_check_coupon(v_input -> 'coupon');

  if p_id is not null then
    select * into v_order from public.orders where id = p_id for update;
    if v_order.id is null then
      raise exception using message = 'That order is gone.', errcode = '22023';
    end if;
  end if;

  -- Source: required on create; on edit it may move between the four hand
  -- sources, and a site order stays a site order.
  if p_id is not null and v_order.source = 'site' then
    v_source := 'site';
  elsif p_id is not null and coalesce(jsonb_typeof(v_input -> 'source'), 'null') = 'null' then
    v_source := v_order.source;
  else
    v_source := v_input ->> 'source';
    if v_source is null or v_source not in ('whatsapp', 'call', 'instagram', 'in_person') then
      raise exception using message = 'Choose where the order came from.', errcode = '22023';
    end if;
  end if;

  if v_source = 'site' and (v_name is null or v_pincode is null) then
    raise exception using message = 'An order from the site keeps its name and pincode.', errcode = '22023';
  end if;

  if v_name is null and v_phone is null then
    raise exception using message = 'Add a name or a phone number.', errcode = '22023';
  end if;

  -- The coupon is worked out against the coupons table when it's new or
  -- changed. An unchanged code keeps what it had when the order was saved.
  if v_coupon is not null and (p_id is null or v_coupon is distinct from v_order.coupon_code) then
    select c.id, (c.active and (c.expires_at is null or c.expires_at > now()))
    into v_coupon_id, v_coupon_valid
    from public.coupons c
    where upper(c.code) = v_coupon;

    v_coupon_valid := coalesce(v_coupon_valid, false);
  elsif v_coupon is not null then
    v_coupon_id := v_order.coupon_id;
    v_coupon_valid := v_order.coupon_valid;
  end if;

  if p_id is not null then
    -- Edit: a full replace of the editable fields and lines. Code, status,
    -- paid and created_at are left alone (status and paid go through
    -- update_admin_order()).
    update public.orders
    set
      source = v_source,
      name = v_name,
      phone = v_phone,
      pincode = v_pincode,
      note = v_note,
      amount = v_amount,
      coupon_code = v_coupon,
      coupon_id = v_coupon_id,
      coupon_valid = v_coupon_valid
    where id = p_id
    returning * into v_order;

    delete from public.order_lines where order_id = p_id;
  else
    if coalesce(jsonb_typeof(v_input -> 'status'), 'null') <> 'null' then
      v_status := public.order_check_status(v_input -> 'status');
    end if;

    if coalesce(jsonb_typeof(v_input -> 'paid'), 'null') <> 'null' then
      v_paid := public.order_check_boolean(v_input -> 'paid', 'paid');
    end if;

    -- Back-dating a notebook entry is fine; the future isn't. Five minutes
    -- of slack covers a phone clock that runs a little fast.
    if coalesce(jsonb_typeof(v_input -> 'created_at'), 'null') <> 'null' then
      begin
        v_created_at := (v_input ->> 'created_at')::timestamptz;
      exception
        when others then
          raise exception using message = 'That date doesn''t look right.', errcode = '22023';
      end;

      if v_created_at > now() + interval '5 minutes' then
        raise exception using message = 'An order can''t be dated in the future.', errcode = '22023';
      end if;
      v_created_at := least(v_created_at, timezone('utc', now()));
    end if;

    -- A code typed from a WhatsApp message, or a fresh one.
    v_code := upper(btrim(regexp_replace(btrim(coalesce(v_input ->> 'code', '')), '^#+', '')));
    if v_code = '' then
      v_code := public.order_new_code();
    else
      if v_code not like 'SN-%' then
        v_code := 'SN-' || v_code;
      end if;

      if v_code !~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$' then
        raise exception using message = 'That order code doesn''t look right.', errcode = '22023';
      end if;

      perform pg_advisory_xact_lock(hashtext('order_code:' || v_code));
      if public.order_code_taken(v_code) then
        raise exception using
          message = format('%s is already an order. Open that one, or leave the code empty and we''ll make one.', v_code),
          errcode = '22023';
      end if;
    end if;

    insert into public.orders (
      code, source, status, paid_at, name, pincode, phone, note, amount,
      coupon_code, coupon_id, coupon_valid, created_at, created_by
    ) values (
      v_code, v_source, v_status,
      case when v_paid then timezone('utc', now()) end,
      v_name, v_pincode, v_phone, v_note, v_amount,
      v_coupon, v_coupon_id, v_coupon_valid, v_created_at, auth.uid()
    ) returning * into v_order;
  end if;

  insert into public.order_lines (order_id, product_id, size, quantity)
  select v_order.id, line ->> 'product_id', line ->> 'size', (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) line;

  return public.admin_order_json(v_order);
end;
$$;

-- Hard delete of one order, with its lines and history. A missing id does
-- nothing.
create or replace function public.delete_admin_order(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  delete from public.orders where id = p_id;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 5. Home overview
-- ═══════════════════════════════════════════════════════

create or replace function public.get_admin_overview()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_week_start_date date := date_trunc('week', v_today)::date;
  v_week_start timestamptz := v_week_start_date::timestamp at time zone 'Asia/Kolkata';
  v_week_end timestamptz := (v_week_start_date + 7)::timestamp at time zone 'Asia/Kolkata';
  v_last_week_start timestamptz := (v_week_start_date - 7)::timestamp at time zone 'Asia/Kolkata';
  v_stale_before timestamptz := now() - interval '48 hours';
  v_since_30 timestamptz := now() - interval '30 days';
  v_queue json;
  v_week json;
  v_selling json;
  v_coupons json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  -- The five to-do groups. For a delivered order, status_changed_at is when
  -- it became delivered (the same moment as its latest "delivered" event).
  select json_build_object(
    'to_confirm', count(*) filter (
      where o.status = 'new' and (o.kept_at is not null or o.status_changed_at >= v_stale_before)
    ),
    'to_send', json_build_object(
      'count', count(*) filter (where o.status = 'confirmed'),
      'paid', count(*) filter (where o.status = 'confirmed' and o.paid_at is not null)
    ),
    'to_collect', json_build_object(
      'count', count(*) filter (where o.status = 'delivered' and o.paid_at is null),
      'amount', coalesce(sum(o.amount) filter (where o.status = 'delivered' and o.paid_at is null), 0),
      'without_amount', count(*) filter (
        where o.status = 'delivered' and o.paid_at is null and o.amount is null
      ),
      'oldest', (
        select json_build_object('code', d.code, 'name', d.name, 'since', d.status_changed_at)
        from public.orders d
        where d.status = 'delivered' and d.paid_at is null
        order by d.status_changed_at, d.created_at
        limit 1
      )
    ),
    'on_the_way', json_build_object(
      'count', count(*) filter (where o.status = 'sent'),
      'not_paid', count(*) filter (where o.status = 'sent' and o.paid_at is null)
    ),
    'stale', count(*) filter (
      where o.status = 'new' and o.kept_at is null and o.status_changed_at < v_stale_before
    )
  ) into v_queue
  from public.orders o
  where o.status in ('new', 'confirmed', 'sent', 'delivered');

  -- This week (Monday to Sunday, India time) and last week.
  with order_packs as (
    select
      o.id,
      o.phone,
      o.status,
      o.created_at,
      o.status_changed_at,
      (o.created_at at time zone 'Asia/Kolkata')::date as day,
      coalesce((select sum(l.quantity) from public.order_lines l where l.order_id = o.id), 0) as packs
    from public.orders o
    where o.created_at >= v_last_week_start and o.created_at < v_week_end
  ),
  this_week as (
    select * from order_packs
    where created_at >= v_week_start and status <> 'cancelled'
  )
  select json_build_object(
    'starts_on', v_week_start_date,
    'days', (
      select json_agg(
        json_build_object(
          'date', v_week_start_date + d.i,
          'orders', (select count(*) from this_week t where t.day = v_week_start_date + d.i),
          'packs', (select coalesce(sum(t.packs), 0) from this_week t where t.day = v_week_start_date + d.i)
        )
        order by d.i
      )
      from generate_series(0, 6) as d(i)
    ),
    'orders', (select count(*) from this_week),
    'packs', (select coalesce(sum(packs), 0) from this_week),
    -- Orders that became delivered or cancelled this week and still are, so
    -- an undone mis-tap isn't counted.
    'delivered', (
      select count(*) from public.orders o
      where o.status = 'delivered'
        and o.status_changed_at >= v_week_start and o.status_changed_at < v_week_end
    ),
    'cancelled', (
      select count(*) from public.orders o
      where o.status = 'cancelled'
        and o.status_changed_at >= v_week_start and o.status_changed_at < v_week_end
    ),
    -- Customers (by phone) with an order this week and an earlier
    -- not-cancelled order.
    'repeat_customers', (
      select count(distinct t.phone)
      from this_week t
      where t.phone is not null
        and exists (
          select 1 from public.orders p
          where p.phone = t.phone
            and p.status <> 'cancelled'
            and (p.created_at, p.id) < (t.created_at, t.id)
        )
    ),
    'last_week', (
      select json_build_object('orders', count(*), 'packs', coalesce(sum(packs), 0))
      from order_packs
      where created_at < v_week_start and status <> 'cancelled'
    )
  ) into v_week;

  -- Last 30 days, confirmed and later.
  select coalesce(json_agg(
    json_build_object('product_id', s.product_id, 'size', s.size, 'packs', s.packs, 'orders', s.orders)
    order by s.packs desc, s.orders desc, s.product_id, s.size
  ), '[]'::json) into v_selling
  from (
    select l.product_id, l.size, sum(l.quantity) as packs, count(distinct o.id) as orders
    from public.orders o
    join public.order_lines l on l.order_id = o.id
    where o.status in ('confirmed', 'sent', 'delivered')
      and o.created_at >= v_since_30
    group by l.product_id, l.size
  ) s;

  select coalesce(json_agg(
    json_build_object('code', c.code, 'orders', c.orders, 'last_used_at', c.last_used_at)
    order by c.orders desc, c.last_used_at desc, c.code
  ), '[]'::json) into v_coupons
  from (
    select o.coupon_code as code, count(*) as orders, max(o.created_at) as last_used_at
    from public.orders o
    where o.status in ('confirmed', 'sent', 'delivered')
      and o.created_at >= v_since_30
      and o.coupon_code is not null
    group by o.coupon_code
  ) c;

  return json_build_object(
    'queue', v_queue,
    'week', v_week,
    'selling', v_selling,
    'coupons', v_coupons,
    'email', json_build_object(
      -- Same rule as get_waitlist_count_stats() 'active'.
      'active', (
        select count(*) from public.waitlist_members m
        where m.unsubscribed_at is null and m.status = 'active'
      )
    )
  );
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 6. Customers
-- ═══════════════════════════════════════════════════════

-- Grouped by phone over not-cancelled orders. "open" uses the to-do rule
-- (new, confirmed, sent, or delivered and not paid). Search matches any of
-- the customer's order names, or 3+ digits of the phone.
create or replace function public.get_admin_customers(p_search text default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_name_like text;
  v_digits text;
  v_customers json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if v_search <> '' then
    v_name_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := regexp_replace(v_search, '[^0-9]', '', 'g');
    if char_length(v_digits) < 3 then
      v_digits := null;
    end if;
  end if;

  select coalesce(json_agg(
    json_build_object(
      'phone', c.phone,
      'name', c.name,
      'orders', c.orders,
      'delivered', c.delivered,
      'open', c.open,
      'first_order_at', c.first_order_at,
      'last_order_at', c.last_order_at,
      'amount_total', c.amount_total
    )
    order by c.last_order_at desc, c.phone
  ), '[]'::json) into v_customers
  from (
    select
      o.phone,
      (array_agg(o.name order by o.created_at desc, o.id desc) filter (where o.name is not null))[1] as name,
      count(*) as orders,
      count(*) filter (where o.status = 'delivered') as delivered,
      count(*) filter (
        where o.status in ('new', 'confirmed', 'sent') or (o.status = 'delivered' and o.paid_at is null)
      ) as open,
      min(o.created_at) as first_order_at,
      max(o.created_at) as last_order_at,
      coalesce(sum(o.amount), 0) as amount_total,
      coalesce(bool_or(o.name ilike v_name_like), false) as name_hit
    from public.orders o
    where o.phone is not null
      and o.status <> 'cancelled'
    group by o.phone
  ) c
  where v_search = ''
    or c.name_hit
    or (v_digits is not null and c.phone like '%' || v_digits || '%');

  return json_build_object(
    'customers', v_customers,
    'without_phone', (
      select count(*) from public.orders o
      where o.phone is null and o.status <> 'cancelled'
    )
  );
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 7. Stock switch
-- ═══════════════════════════════════════════════════════

-- Upserts one product and size, then returns the same list as
-- get_product_stock(). "since" only moves when the switch actually flips.
create or replace function public.set_admin_stock(p_product_id text, p_size text, p_in_stock boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_product_id is null or p_product_id !~ '^[a-z0-9][a-z0-9-]{0,39}$'
     or p_size is null or p_size !~ '^[0-9]{1,5} ?(g|kg)$'
     or p_in_stock is null then
    raise exception using message = 'That product or size doesn''t look right.', errcode = '22023';
  end if;

  insert into public.product_stock as s (product_id, size, in_stock)
  values (p_product_id, p_size, p_in_stock)
  on conflict (product_id, size) do update
  set
    in_stock = excluded.in_stock,
    updated_at = case
      when s.in_stock is distinct from excluded.in_stock then timezone('utc', now())
      else s.updated_at
    end;

  return public.get_product_stock();
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 8. Coupons (list replaced to add use), email list
-- ═══════════════════════════════════════════════════════

-- Same as 20260925000002, plus order_count and last_used_at over all time,
-- confirmed and later, matched on orders.coupon_id.
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
    json_agg(
      (
        public.admin_coupon_json(c)::jsonb
        || jsonb_build_object(
          'order_count', coalesce(u.order_count, 0),
          'last_used_at', u.last_used_at
        )
      )::json
      order by c.created_at desc, c.code
    ),
    '[]'::json
  ) into result
  from public.coupons c
  left join (
    select o.coupon_id, count(*) as order_count, max(o.created_at) as last_used_at
    from public.orders o
    where o.coupon_id is not null
      and o.status in ('confirmed', 'sent', 'delivered')
    group by o.coupon_id
  ) u on u.coupon_id = c.id;

  return result;
end;
$$;

-- Every member, newest first, plus the counts. Only a handful of rows, so
-- the admin filters and makes the CSV itself.
create or replace function public.get_admin_email_list()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_members json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select coalesce(json_agg(
    json_build_object(
      'id', m.id,
      'email', m.email,
      'source', m.source,
      'status', m.status,
      'marketing_consent', m.marketing_consent,
      'signed_up_at', m.signed_up_at,
      'verified_at', m.verified_at,
      'unsubscribed_at', m.unsubscribed_at
    )
    order by m.signed_up_at desc, m.id
  ), '[]'::json) into v_members
  from public.waitlist_members m;

  return json_build_object('members', v_members, 'stats', public.get_waitlist_count_stats());
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 9. Grants
-- ═══════════════════════════════════════════════════════

-- Supabase grants execute on new functions to anon and authenticated by
-- default, so revoking from public alone isn't enough (see 000006).
revoke all on function public.get_admin_me() from public, anon;
grant execute on function public.get_admin_me() to authenticated;

revoke all on function public.get_admin_users() from public, anon;
grant execute on function public.get_admin_users() to authenticated;

revoke all on function public.get_admin_orders(text, text[], boolean, text, text, text, timestamptz, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.get_admin_orders(text, text[], boolean, text, text, text, timestamptz, timestamptz, timestamptz, integer) to authenticated;

revoke all on function public.get_admin_order(text) from public, anon;
grant execute on function public.get_admin_order(text) to authenticated;

revoke all on function public.update_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.update_admin_order(uuid, jsonb) to authenticated;

revoke all on function public.save_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.save_admin_order(uuid, jsonb) to authenticated;

revoke all on function public.delete_admin_order(uuid) from public, anon;
grant execute on function public.delete_admin_order(uuid) to authenticated;

revoke all on function public.get_admin_overview() from public, anon;
grant execute on function public.get_admin_overview() to authenticated;

revoke all on function public.get_admin_customers(text) from public, anon;
grant execute on function public.get_admin_customers(text) to authenticated;

revoke all on function public.set_admin_stock(text, text, boolean) from public, anon;
grant execute on function public.set_admin_stock(text, text, boolean) to authenticated;

revoke all on function public.get_admin_coupons() from public, anon;
grant execute on function public.get_admin_coupons() to authenticated;

revoke all on function public.get_admin_email_list() from public, anon;
grant execute on function public.get_admin_email_list() to authenticated;
