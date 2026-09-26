-- Migration: 20260926000007_paid_method.sql
-- How an order was paid: Cash, UPI or Other with a short note. Admin only;
-- nothing public changes, and no existing key changes shape.
--
-- 1. orders gains paid_method ('cash', 'upi', 'other') and paid_note (only
--    with 'other': trimmed, one line, 1 to 60 characters). A not-paid order
--    has neither. Orders marked paid before this have no method and stay
--    valid.
-- 2. The order JSON gains paid_method and paid_note.
-- 3. update_admin_order() takes paid_method and paid_note, only together
--    with paid: true. paid: true alone keeps the method; paid: false clears
--    both. paid_method: null clears the method (Undo on an old order).
-- 4. save_admin_order() takes them on create, the same way (sent as null
--    with paid off is fine, the way a form sends them). An edit ignores
--    them, like paid.
--
-- get_admin_totals(), get_admin_overview() and the history trigger don't
-- change: paid is still paid, whatever the method. Everything else in these
-- functions is the same as in 20260926000001, 000003 and 000004.

-- ═══════════════════════════════════════════════════════
-- 1. Table
-- ═══════════════════════════════════════════════════════

alter table public.orders
  add column paid_method text
    constraint orders_paid_method_check check (paid_method in ('cash', 'upi', 'other')),
  -- Trimmed, one line, 1 to 60 characters.
  add column paid_note text
    constraint orders_paid_note_check check (
      char_length(paid_note) between 1 and 60
      and paid_note = btrim(paid_note)
      and paid_note !~ '[[:cntrl:]]'
    ),
  -- A not-paid order has no method and no note.
  add constraint orders_paid_method_needs_paid
    check (paid_at is not null or (paid_method is null and paid_note is null)),
  -- Other always has a note; Cash, UPI and no method never do.
  add constraint orders_paid_note_only_with_other
    check ((paid_method is not distinct from 'other') = (paid_note is not null));

-- ═══════════════════════════════════════════════════════
-- 2. Shared checks (internal, not callable from the API)
-- ═══════════════════════════════════════════════════════

-- 'cash', 'upi' or 'other'; JSON null means no method.
create or replace function public.order_check_paid_method(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;

  if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') not in ('cash', 'upi', 'other') then
    raise exception using message = 'Choose Cash, UPI or Other.', errcode = '22023';
  end if;

  return p_value #>> '{}';
end;
$$;

revoke all on function public.order_check_paid_method(jsonb) from public, anon, authenticated;

-- Trimmed; an empty note is null. One line, up to 60 characters.
create or replace function public.order_check_paid_note(p_value jsonb)
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
  if v_note ~ '[[:cntrl:]]' then
    raise exception using message = 'Keep the note to one line.', errcode = '22023';
  end if;

  if char_length(v_note) > 60 then
    raise exception using message = 'Keep the note to 60 characters or fewer.', errcode = '22023';
  end if;

  return v_note;
end;
$$;

revoke all on function public.order_check_paid_note(jsonb) from public, anon, authenticated;

-- Other needs a note, and only Other has one.
create or replace function public.order_check_paid_pair(p_method text, p_note text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_method = 'other' and p_note is null then
    raise exception using message = 'Add a short note for Other.', errcode = '22023';
  end if;

  if p_method is distinct from 'other' and p_note is not null then
    raise exception using message = 'A note goes only with Other.', errcode = '22023';
  end if;
end;
$$;

revoke all on function public.order_check_paid_pair(text, text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. Order JSON: paid_method and paid_note
-- ═══════════════════════════════════════════════════════

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
    -- 'cash', 'upi', 'other', or null (not paid, or paid before methods).
    'paid_method', p_order.paid_method,
    'paid_note', p_order.paid_note,
    'kept', p_order.kept_at is not null,
    'stale', public.order_is_stale(p_order),
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
        'known', p_order.coupon_id is not null,
        -- The matched coupon's current description, for "EXAMPLE10 · 10% off".
        'description', (select c.description from public.coupons c where c.id = p_order.coupon_id)
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

-- ═══════════════════════════════════════════════════════
-- 4. update_admin_order: paid_method and paid_note
-- ═══════════════════════════════════════════════════════

create or replace function public.update_admin_order(p_id uuid, p_changes jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_paid boolean;
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception using message = 'Nothing to change.', errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in (
      'status', 'paid', 'paid_method', 'paid_note', 'kept', 'phone', 'amount', 'note', 'name', 'pincode'
    ) then
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
    v_paid := public.order_check_boolean(p_changes -> 'paid', 'paid');
    v_order.paid_at := case when v_paid then coalesce(v_order.paid_at, timezone('utc', now())) end;

    -- Not paid has no method. paid: true alone keeps the method it had.
    if not v_paid then
      v_order.paid_method := null;
      v_order.paid_note := null;
    end if;
  end if;

  -- How they paid is set only together with paid: true. A method replaces
  -- the old method and note; a note alone keeps the method.
  if p_changes ? 'paid_method' or p_changes ? 'paid_note' then
    if v_paid is not true then
      raise exception using message = 'Mark it paid to say how they paid.', errcode = '22023';
    end if;

    if p_changes ? 'paid_method' then
      v_order.paid_method := public.order_check_paid_method(p_changes -> 'paid_method');
      v_order.paid_note := null;
    end if;

    if p_changes ? 'paid_note' then
      v_order.paid_note := public.order_check_paid_note(p_changes -> 'paid_note');
    end if;

    perform public.order_check_paid_pair(v_order.paid_method, v_order.paid_note);
  end if;

  -- "Keep" / "Still waiting" restarts the 48 h clock on every tap, so
  -- kept_at moves to now even when it's already set. false clears it (Undo).
  if p_changes ? 'kept' then
    v_order.kept_at := case
      when public.order_check_boolean(p_changes -> 'kept', 'kept')
        then timezone('utc', now())
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
    paid_method = v_order.paid_method,
    paid_note = v_order.paid_note,
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

revoke all on function public.update_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.update_admin_order(uuid, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 5. save_admin_order: paid_method and paid_note on create
-- ═══════════════════════════════════════════════════════

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
  v_paid_method text;
  v_paid_note text;
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
      'coupon', 'lines', 'status', 'paid', 'paid_method', 'paid_note', 'created_at'
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
    -- paid (with its method and note) and created_at are left alone (status
    -- and paid go through update_admin_order()).
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

    -- How they paid, only with paid: true. A form may send them empty
    -- (null) when not paid; that's the same as leaving them out.
    v_paid_method := public.order_check_paid_method(v_input -> 'paid_method');
    v_paid_note := public.order_check_paid_note(v_input -> 'paid_note');
    if not v_paid and (v_paid_method is not null or v_paid_note is not null) then
      raise exception using message = 'Mark it paid to say how they paid.', errcode = '22023';
    end if;
    perform public.order_check_paid_pair(v_paid_method, v_paid_note);

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
      code, source, status, paid_at, paid_method, paid_note, name, pincode, phone, note, amount,
      coupon_code, coupon_id, coupon_valid, created_at, created_by
    ) values (
      v_code, v_source, v_status,
      case when v_paid then timezone('utc', now()) end, v_paid_method, v_paid_note,
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

revoke all on function public.save_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.save_admin_order(uuid, jsonb) to authenticated;
