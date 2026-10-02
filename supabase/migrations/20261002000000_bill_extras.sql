-- Additional discount and advance are optional whole-rupee figures shown on the admin bill.
alter table public.orders add column extra_discount integer check (extra_discount is null or extra_discount between 0 and 1000000);
alter table public.orders add column advance integer check (advance is null or advance between 0 and 1000000);

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
  v_note text;
  v_amount integer;
  v_extra_discount integer;
  v_advance integer;
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
      'source', 'code', 'name', 'phone', 'pincode', 'note', 'amount',
      'coupon', 'lines', 'status', 'paid', 'paid_method', 'paid_note', 'created_at', 'priority', 'extra_discount', 'advance'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  v_lines := public.order_clean_lines(v_input -> 'lines', 99, true);
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
  v_note := public.order_check_note(v_input -> 'note');
  v_amount := public.order_check_amount(v_input -> 'amount');
  v_coupon := public.order_check_coupon(v_input -> 'coupon');
  v_extra_discount := public.order_check_amount(v_input -> 'extra_discount');
  v_advance := public.order_check_amount(v_input -> 'advance');
  if v_free_sample then
    v_amount := null;
    v_coupon := null;
    v_extra_discount := null;
    v_advance := null;
  end if;
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
      note = v_note,
      amount = v_amount,
      extra_discount = v_extra_discount,
      advance = v_advance,
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
      code, source, status, name, pincode, phone, note, amount,
      coupon_code, coupon_id, coupon_valid, free_sample, priority, created_at, created_by, extra_discount, advance
    ) values (
      v_code, v_source, v_status,
      v_name, v_pincode, v_phone, v_note, v_amount,
      v_coupon, v_coupon_id, v_coupon_valid, v_free_sample, coalesce(v_priority, false), v_created_at, auth.uid(), v_extra_discount, v_advance
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
    'free_sample', p_order.free_sample,
    'priority', p_order.priority,
    'held', p_order.kitchen_hold,
    'paid', p_order.paid_at is not null,
    'paid_at', p_order.paid_at,
    'paid_method', p_order.paid_method,
    'paid_note', p_order.paid_note,
    'payment_state', case
      when p_order.paid_at is not null then 'paid'
      when pay.count > 0 then 'part_paid'
      else 'not_paid'
    end,
    'payments', pay.list,
    'amount_paid', pay.total,
    'amount_due', case when p_order.amount is not null then greatest(p_order.amount - pay.total, 0) end,
    'amount_extra', case when p_order.amount is not null then greatest(pay.total - p_order.amount, 0) end,
    'name', p_order.name,
    'pincode', p_order.pincode,
    'phone', p_order.phone,
    'note', p_order.note,
    'amount', p_order.amount,
    'extra_discount', p_order.extra_discount,
    'advance', p_order.advance,
    'coupon', case
      when p_order.coupon_code is null then null
      else json_build_object(
        'code', p_order.coupon_code,
        'valid', coalesce(p_order.coupon_valid, false),
        'known', p_order.coupon_id is not null,
        'description', (select c.description from public.coupons c where c.id = p_order.coupon_id)
      )
    end,
    'lines', coalesce((
      select json_agg(
        json_build_object('product_id', l.product_id, 'size', l.size, 'quantity', l.quantity, 'grams_each', l.grams_each)
        order by l.product_id, l.size
      )
      from public.order_lines l
      where l.order_id = p_order.id
    ), '[]'::json),
    'packs', coalesce((
      select sum(l.quantity) from public.order_lines l where l.order_id = p_order.id and l.size <> 'sample'
    ), 0),
    'samples', coalesce((
      select sum(l.quantity) from public.order_lines l where l.order_id = p_order.id and l.size = 'sample'
    ), 0),
    'kitchen', coalesce((
      select json_agg(
        json_build_object(
          'product_id', c.product_id, 'need', c.need, 'covered', c.covered, 'by_hand', c.by_hand,
          'waiting', p_order.status = 'cooking' and c.covered < c.need,
          -- Where its food came from: each batch's made-on day and grams, oldest first.
          'batches', coalesce((
            select json_agg(json_build_object('made_on', b.made_on, 'grams', a.grams)
              order by b.made_on, b.created_at, b.id)
            from public.kitchen_allocations a
            join public.kitchen_batches b on b.id = a.batch_id
            where a.order_id = p_order.id and a.product_id = c.product_id
          ), '[]'::json)
        )
        order by c.product_id
      )
      from public.kitchen_order_cover(p_order.id) c
    ), '[]'::json),
    'customer', case
      when p_order.phone is null then null
      else (
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
  )
  from (
    select
      count(*) as count,
      coalesce(sum(p.amount), 0) as total,
      coalesce(json_agg(
        json_build_object(
          'id', p.id,
          'amount', p.amount,
          'method', p.method,
          'note', p.note,
          'paid_at', p.paid_at,
          'created_at', p.created_at,
          'by_name', coalesce(a.display_name, a.email)
        )
        order by p.paid_at, p.created_at, p.id
      ) filter (where p.id is not null), '[]'::json) as list
    from public.order_payments p
    left join public.admin_users a on a.id = p.created_by
    where p.order_id = p_order.id
  ) pay;
$$;

revoke all on function public.admin_order_json(public.orders) from public, anon, authenticated;

create or replace function public.update_admin_order(p_id uuid, p_changes jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_paid boolean;
  v_method text;
  v_note text;
  v_cover public.order_payments;
  v_order public.orders;
  v_from text;
  v_priority boolean;
  v_changed_at timestamptz;
  v_action uuid;
  v_effects jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception using message = 'Nothing to change.', errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in (
      'status', 'status_changed_at', 'paid', 'paid_method', 'paid_note', 'phone', 'amount', 'note', 'name', 'pincode', 'priority', 'extra_discount', 'advance'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  if p_changes ? 'status' or p_changes ? 'priority' then
    perform public.kitchen_lock();
  end if;

  select * into v_order from public.orders where id = p_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;
  v_from := v_order.status;

  if p_changes ? 'status' then
    v_order.status := public.order_check_status(p_changes -> 'status');
  end if;

  -- Undo of a status tap sends back when the order entered the old status.
  if p_changes ? 'status_changed_at' then
    if not p_changes ? 'status' then
      raise exception using message = 'status_changed_at goes only with status.', errcode = '22023';
    end if;
    v_changed_at := public.order_check_payment_date(p_changes -> 'status_changed_at');
  end if;

  if p_changes ? 'paid' then
    v_paid := public.order_check_boolean(p_changes -> 'paid', 'paid');
  end if;

  v_priority := v_order.priority;
  if p_changes ? 'priority' then
    v_order.priority := public.order_check_boolean(p_changes -> 'priority', 'priority');
  end if;

  if (p_changes ? 'paid_method' or p_changes ? 'paid_note') and v_paid is not true then
    raise exception using message = 'Mark it paid to say how they paid.', errcode = '22023';
  end if;

  if p_changes ? 'phone' then
    v_order.phone := public.order_check_phone(p_changes -> 'phone');
  end if;

  if p_changes ? 'amount' then
    v_order.amount := public.order_check_amount(p_changes -> 'amount');
  end if;

  if p_changes ? 'extra_discount' then
    v_order.extra_discount := public.order_check_amount(p_changes -> 'extra_discount');
  end if;

  if p_changes ? 'advance' then
    v_order.advance := public.order_check_amount(p_changes -> 'advance');
  end if;

  if v_order.free_sample then
    v_order.extra_discount := null;
    v_order.advance := null;
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

  if v_paid is false then
    delete from public.order_payments where order_id = p_id;
  end if;

  if v_order.status <> v_from or v_order.priority <> v_priority then
    v_action := public.kitchen_action_start(case when v_order.status <> v_from then 'order_status' else 'priority' end);
  end if;

  update public.orders
  set
    status = v_order.status,
    kitchen_hold = case when v_from in ('packing', 'ready') and v_order.status = 'cooking' then true else kitchen_hold end,
    status_changed_at = coalesce(v_changed_at, status_changed_at),
    priority = v_order.priority,
    phone = v_order.phone,
    amount = v_order.amount,
    extra_discount = v_order.extra_discount,
    advance = v_order.advance,
    note = v_order.note,
    name = v_order.name,
    pincode = v_order.pincode
  where id = p_id
  returning * into v_order;

  if v_action is not null then
    perform public.kitchen_order_moved(p_id, v_from, v_order.status);
    if v_order.priority <> v_priority then
      perform public.kitchen_fill_all(public.kitchen_order_products(p_id));
    end if;

    -- Every status or priority move is undone through undo_admin_kitchen(),
    -- which puts it back exactly (status, when it began, priority) and removes
    -- the history it wrote, so an undone tap leaves no trace.
    v_effects := public.kitchen_effects_json(v_action, false);
    perform public.kitchen_action_finish(v_action);
  end if;

  if v_paid then
    v_cover := public.order_covering_payment(p_id, v_order.amount);

    v_method := case
      when p_changes ? 'paid_method' then public.order_check_paid_method(p_changes -> 'paid_method')
      else v_cover.method
    end;
    v_note := case
      when p_changes ? 'paid_note' then public.order_check_paid_note(p_changes -> 'paid_note')
      when p_changes ? 'paid_method' then null
      else v_cover.note
    end;
    perform public.order_check_paid_pair(v_method, v_note);

    if v_order.paid_at is null then
      perform public.order_pay_rest(p_id, v_method, v_note, null);
    elsif p_changes ? 'paid_method' or p_changes ? 'paid_note' then
      update public.order_payments
      set method = v_method, note = v_note
      where id = v_cover.id;
    end if;
  end if;

  select * into v_order from public.orders where id = p_id;
  return (
    public.admin_order_json(v_order)::jsonb || jsonb_build_object('kitchen_effects', v_effects)
  )::json;
end;
$$;

revoke all on function public.update_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.update_admin_order(uuid, jsonb) to authenticated;
