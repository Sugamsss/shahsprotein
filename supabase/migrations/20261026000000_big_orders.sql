-- Big orders (Add order's "Big order?" and Advanced edit): up to 9,999 packs on a
-- line typed by hand, where it was 99. The site still sends at most 10 a line
-- (submit_order and the website request RPCs pass 10). A pack weight set by hand
-- is now checked: 1 g to 10 kg.
--
-- Prices typed on an order are not stored: they work out the order's total in the
-- admin, and the total is what's saved (orders.amount), as before.

-- ═══════════════════════════════════════════════════════
-- 1. Lines hold up to 9,999 packs
-- ═══════════════════════════════════════════════════════

alter table public.order_lines drop constraint if exists order_lines_quantity_check;
alter table public.order_lines add constraint order_lines_quantity_check
  check (quantity between 1 and 9999);

-- 20260929000001's function; a quantity may now have up to five digits, so
-- 10000 meets the caller's own limit and its message. The cap is
-- still the caller's p_max_quantity.
create or replace function public.order_clean_lines(
  p_lines jsonb,
  p_max_quantity integer,
  p_samples boolean default false
)
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
       or not (
         (v_line ->> 'size') ~ '^[0-9]{1,5} ?(g|kg)$'
         or (coalesce(p_samples, false) and (v_line ->> 'size') = 'sample')
       )
       or (v_line ->> 'quantity') !~ '^[0-9]{1,5}$' then
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

revoke all on function public.order_clean_lines(jsonb, integer, boolean) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. save_admin_order: 9,999 a line, and 1 g to 10 kg a pack
-- ═══════════════════════════════════════════════════════

-- 20261022000001's function, with the new limits.
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
  v_free_sample boolean;
  v_old_grams jsonb;
  v_name text;
  v_phone text;
  v_pincode text;
  v_address jsonb;
  v_note text;
  v_amount integer;
  v_coupon text;
  v_coupon_id uuid;
  v_coupon_valid boolean;
  v_source text;
  v_status text := 'cooking';
  v_priority boolean;
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
      'source', 'code', 'name', 'phone', 'pincode', 'delivery_address', 'note', 'amount',
      'coupon', 'lines', 'status', 'paid', 'paid_method', 'paid_note', 'created_at', 'priority'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  v_lines := public.order_clean_lines(v_input -> 'lines', 9999, true);
  -- A pack set by hand (Advanced edit) is 1 g to 10 kg; a typo past that would put
  -- tonnes on the cook's Home.
  if exists (
    select 1 from jsonb_array_elements(v_lines) line
    where line ->> 'size' <> 'sample'
      and public.order_size_grams(line ->> 'size') not between 1 and 10000
  ) then
    raise exception using message = 'A pack is 1 g to 10 kg.', errcode = '22023';
  end if;
  -- Only products we make (every one has a kitchen_products row, set up by
  -- the migration that adds it).
  if exists (
    select 1 from jsonb_array_elements(v_lines) line
    where not exists (select 1 from public.kitchen_products k where k.product_id = line ->> 'product_id')
  ) then
    raise exception using message = 'We don''t know one of those products.', errcode = '22023';
  end if;
  v_free_sample := not exists (
    select 1 from jsonb_array_elements(v_lines) line where line ->> 'size' <> 'sample'
  );
  v_name := public.order_check_name(v_input -> 'name');
  v_phone := public.order_check_phone(v_input -> 'phone');
  v_pincode := public.order_check_pincode(v_input -> 'pincode');
  if coalesce(jsonb_typeof(v_input -> 'delivery_address'), 'null') <> 'null' then
    v_address := public.website_clean_address(v_input -> 'delivery_address', true);
    if v_pincode is distinct from v_address ->> 'pincode' then
      raise exception using message = 'Pincode must match delivery address.', errcode = '22023';
    end if;
  end if;
  v_note := public.order_check_note(v_input -> 'note');
  v_amount := public.order_check_amount(v_input -> 'amount');
  v_coupon := public.order_check_coupon(v_input -> 'coupon');
  if coalesce(jsonb_typeof(v_input -> 'priority'), 'null') <> 'null' then
    v_priority := public.order_check_boolean(v_input -> 'priority', 'priority');
  end if;

  if p_id is not null then
    perform public.kitchen_lock();
    select * into v_order from public.orders where id = p_id for update;
    if v_order.id is null then
      raise exception using message = 'That order is gone.', errcode = '22023';
    end if;
  end if;

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
    -- Edit. Code, status, payments and created_at are left alone.
    select coalesce(jsonb_object_agg(l.product_id || '|' || l.size, l.grams_each), '{}'::jsonb)
    into v_old_grams
    from public.order_lines l
    where l.order_id = p_id;

    update public.orders
    set
      source = v_source,
      name = v_name,
      phone = v_phone,
      pincode = v_pincode,
      -- Left out keeps the saved address; an explicit null clears it.
      delivery_address = case when v_input ? 'delivery_address' then v_address else delivery_address end,
      note = v_note,
      amount = v_amount,
      coupon_code = v_coupon,
      coupon_id = v_coupon_id,
      coupon_valid = v_coupon_valid,
      free_sample = v_free_sample,
      priority = coalesce(v_priority, priority)
    where id = p_id
    returning * into v_order;

    delete from public.order_lines where order_id = p_id;

    -- A sample the order already had keeps the weight it was saved with.
    insert into public.order_lines (order_id, product_id, size, quantity, grams_each)
    select v_order.id, line ->> 'product_id', line ->> 'size', (line ->> 'quantity')::integer,
      case when line ->> 'size' = 'sample'
        then (v_old_grams ->> ((line ->> 'product_id') || '|sample'))::integer
      end
    from jsonb_array_elements(v_lines) line;

    perform public.kitchen_order_rebalance(v_order.id);
    -- A priority change only reorders food not yet given.
    perform public.kitchen_fill_all(public.kitchen_order_products(v_order.id));
  else
    if coalesce(jsonb_typeof(v_input -> 'status'), 'null') <> 'null' then
      v_status := public.order_check_status(v_input -> 'status');
    end if;

    if coalesce(jsonb_typeof(v_input -> 'paid'), 'null') <> 'null' then
      v_paid := public.order_check_boolean(v_input -> 'paid', 'paid');
    end if;

    v_paid_method := public.order_check_paid_method(v_input -> 'paid_method');
    v_paid_note := public.order_check_paid_note(v_input -> 'paid_note');
    if not v_paid and (v_paid_method is not null or v_paid_note is not null) then
      raise exception using message = 'Mark it paid to say how they paid.', errcode = '22023';
    end if;
    perform public.order_check_paid_pair(v_paid_method, v_paid_note);

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

    -- After the code lock, as in submit_order().
    perform public.kitchen_lock();

    insert into public.orders (
      code, source, status, name, pincode, delivery_address, phone, note, amount,
      coupon_code, coupon_id, coupon_valid, free_sample, priority, created_at, created_by
    ) values (
      v_code, v_source, v_status,
      v_name, v_pincode, v_address, v_phone, v_note, v_amount,
      v_coupon, v_coupon_id, v_coupon_valid, v_free_sample, coalesce(v_priority, false), v_created_at, auth.uid()
    ) returning * into v_order;

    insert into public.order_lines (order_id, product_id, size, quantity)
    select v_order.id, line ->> 'product_id', line ->> 'size', (line ->> 'quantity')::integer
    from jsonb_array_elements(v_lines) line;

    if v_paid then
      perform public.order_pay_rest(v_order.id, v_paid_method, v_paid_note, null);
    end if;

    if v_status = 'cooking' then
      perform public.kitchen_fill_all(public.kitchen_order_products(v_order.id));
    elsif v_status <> 'cancelled' then
      perform public.kitchen_cover_by_hand(v_order.id);
    end if;
  end if;

  select * into v_order from public.orders where id = v_order.id;
  return public.admin_order_json(v_order);
end;
$$;

revoke all on function public.save_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.save_admin_order(uuid, jsonb) to authenticated;
