-- Migration: 20260926000004_admin_order_extras.sql
-- Two small additions the admin Orders screens need. Admin only; nothing
-- public changes, and no existing key changes shape.
--
-- 1. The order JSON's coupon gains "description", the matched coupon's
--    description (null when no coupon row matched), so the order detail can
--    show "EXAMPLE10 · 10% off your order".
-- 2. get_admin_overview() gains done: { delivered_paid, cancelled }, all-time
--    counts with the same rules as get_admin_orders(p_view => 'done').
--
-- Both functions are otherwise the same as in 20260926000003.

-- ═══════════════════════════════════════════════════════
-- 1. Order JSON: coupon description
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
-- 2. Overview: done counts
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
    -- All time, the same rules as get_admin_orders' done view.
    'done', (
      select json_build_object(
        'delivered_paid', count(*) filter (where o.status = 'delivered' and o.paid_at is not null),
        'cancelled', count(*) filter (where o.status = 'cancelled')
      )
      from public.orders o
      where o.status in ('delivered', 'cancelled')
    ),
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
