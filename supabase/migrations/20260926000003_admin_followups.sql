-- Migration: 20260926000003_admin_followups.sql
-- Follow-ups from the admin design spec (Part 2: 2.4, 2.10, 2.15).
--
-- 1. "Still waiting" restarts the 48 h clock instead of keeping an order off
--    the "Didn't come through?" list forever. Stale is now:
--      status = 'new' and status_changed_at < now() - 48 h
--      and (kept_at is null or kept_at < now() - 48 h)
--    Every Keep tap moves kept_at to now and logs a "kept" event; kept: false
--    still clears it (Undo). The rule lives in one helper, order_is_stale(),
--    used by the order JSON and the overview, so they can't drift apart.
-- 2. get_admin_overview() gains queue.to_confirm_oldest, queue.stale_oldest
--    and queue.to_collect.people. Existing keys are unchanged.
-- 3. get_admin_customers() gains each customer's latest pincode.
--
-- Everything else in these functions is the same as in 20260926000000 and
-- 20260926000001.

-- ═══════════════════════════════════════════════════════
-- 1. The stale rule (internal, not callable from the API)
-- ═══════════════════════════════════════════════════════

create or replace function public.order_is_stale(p_order public.orders)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_order.status = 'new'
    and p_order.status_changed_at < now() - interval '48 hours'
    and (p_order.kept_at is null or p_order.kept_at < now() - interval '48 hours');
$$;

revoke all on function public.order_is_stale(public.orders) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. History: a "kept" event on every Keep tap
-- ═══════════════════════════════════════════════════════

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

  -- Every Keep / Still waiting tap moves kept_at, and each one is logged.
  if new.kept_at is not null and new.kept_at is distinct from old.kept_at then
    insert into public.order_events (order_id, event, by) values (new.id, 'kept', v_by);
  elsif old.kept_at is not null and new.kept_at is null then
    insert into public.order_events (order_id, event, by) values (new.id, 'unkept', v_by);
  end if;

  return null;
end;
$$;

revoke all on function public.log_order_events() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. The order JSON uses the shared rule
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

-- ═══════════════════════════════════════════════════════
-- 4. Keep refreshes kept_at
-- ═══════════════════════════════════════════════════════

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
-- 5. Overview: oldest New, oldest stale, people to collect from
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
    'to_confirm', count(*) filter (where o.status = 'new' and not public.order_is_stale(o)),
    'to_confirm_oldest', min(o.created_at) filter (where o.status = 'new' and not public.order_is_stale(o)),
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
      -- Distinct people: by phone where there is one, else by name.
      'people', count(distinct coalesce(o.phone, 'name:' || lower(o.name))) filter (
        where o.status = 'delivered' and o.paid_at is null
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
    'stale', count(*) filter (where public.order_is_stale(o)),
    'stale_oldest', min(o.created_at) filter (where public.order_is_stale(o))
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

revoke all on function public.get_admin_overview() from public, anon;
grant execute on function public.get_admin_overview() to authenticated;

-- ═══════════════════════════════════════════════════════
-- 6. Customers: latest pincode
-- ═══════════════════════════════════════════════════════

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
      'pincode', c.pincode,
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
      (array_agg(o.pincode order by o.created_at desc, o.id desc) filter (where o.pincode is not null))[1] as pincode,
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

revoke all on function public.get_admin_customers(text) from public, anon;
grant execute on function public.get_admin_customers(text) to authenticated;
