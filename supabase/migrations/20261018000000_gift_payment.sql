-- Migration: 20261018000000_gift_payment.sql
--
-- Gift as a way an order was "paid": we gave it free. It settles the order
-- like any payment (orders.paid_method / order_payments.method = 'gift'), but
-- no money came in, so:
--   * came in / amount_in / paid_of_sales leave gift payments out;
--   * sales (admin_metrics_orders.amount) take gifted amounts off each order,
--     never below 0, so a ₹500 order paid ₹200 UPI + ₹300 Gift is a ₹200 sale;
--   * every by-method split gains a 'gift' key: how much was given away.
-- Stage totals and amount_due are unchanged: a gift settles what's owed.
-- Each function below is its latest body with only those edits.

-- 1. Allow 'gift'
alter table public.orders drop constraint orders_paid_method_check;
alter table public.orders add constraint orders_paid_method_check
  check (paid_method in ('cash', 'upi', 'bank', 'gift', 'other'));

alter table public.order_payments drop constraint order_payments_method_check;
alter table public.order_payments add constraint order_payments_method_check
  check (method in ('cash', 'upi', 'bank', 'gift', 'other'));

-- 'cash', 'upi', 'bank', 'gift' or 'other'; JSON null means no method.
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

  if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') not in ('cash', 'upi', 'bank', 'gift', 'other') then
    raise exception using message = 'Choose UPI, Cash, Bank transfer, Gift or Other.', errcode = '22023';
  end if;

  return p_value #>> '{}';
end;
$$;

revoke all on function public.order_check_paid_method(jsonb) from public, anon, authenticated;

-- 2. Home's metrics
create or replace function public.admin_metrics_orders(p_from timestamptz, p_to timestamptz)
returns table (id uuid, at timestamp, amount integer, packs bigint, grams bigint)
language sql
stable
set search_path = public
as $$
  select o.id, o.created_at at time zone 'Asia/Kolkata',
    -- Sales are what was sold, so a gifted part is taken off (never below 0).
    case when o.amount is null then null else greatest(o.amount - coalesce((
      select sum(g.amount) from public.order_payments g
      where g.order_id = o.id and g.method = 'gift'
    ), 0), 0)::integer end,
    coalesce(l.packs, 0), coalesce(l.grams, 0)
  from public.orders o
  left join lateral (
    select sum(x.quantity) as packs, sum(x.quantity * x.grams_each) as grams
    from public.order_lines x
    where x.order_id = o.id and x.size <> 'sample'
  ) l on true
  where o.status <> 'cancelled' and not o.free_sample
    and o.created_at >= p_from and o.created_at < p_to;
$$;

revoke all on function public.admin_metrics_orders(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.admin_metrics_totals(p_from timestamptz, p_to timestamptz, p_as_of timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
  with ro as (
    select * from public.admin_metrics_orders(p_from, p_to)
  ),
  pay as (
    select * from public.admin_metrics_payments(p_from, p_to)
  )
  select jsonb_build_object(
    'orders', (select count(*) from ro),
    'packs', (select coalesce(sum(ro.packs), 0) from ro),
    'grams', (select coalesce(sum(ro.grams), 0) from ro),
    'sales', (select coalesce(sum(ro.amount), 0) from ro),
    'with_total', (select count(*) from ro where ro.amount is not null),
    'without_total', (select count(*) from ro where ro.amount is null),
    'paid_of_sales', (
      select coalesce(sum(least(ro.amount, (
        select coalesce(sum(p.amount), 0) from public.order_payments p
        where p.order_id = ro.id and p.paid_at <= p_as_of and p.method is distinct from 'gift'
      ))), 0)
      from ro
      where ro.amount is not null
    ),
    'samples', (
      select jsonb_build_object('orders', count(distinct o.id), 'packs', coalesce(sum(l.quantity), 0),
        'free_orders', count(distinct o.id) filter (where o.free_sample))
      from public.orders o
      join public.order_lines l on l.order_id = o.id and l.size = 'sample'
      where o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to
    ),
    'came_in', (
      select jsonb_build_object(
        'amount', coalesce(sum(pay.amount) filter (where pay.method is distinct from 'gift'), 0),
        'payments', count(*) filter (where pay.method is distinct from 'gift'),
        'without_amount', count(*) filter (where pay.amount is null and pay.method is distinct from 'gift'),
        'by_method', jsonb_build_object(
          'upi', coalesce(sum(pay.amount) filter (where pay.method = 'upi'), 0),
          'cash', coalesce(sum(pay.amount) filter (where pay.method = 'cash'), 0),
          'bank', coalesce(sum(pay.amount) filter (where pay.method = 'bank'), 0),
          'gift', coalesce(sum(pay.amount) filter (where pay.method = 'gift'), 0),
          'other', coalesce(sum(pay.amount) filter (where pay.method = 'other'), 0),
          'not_recorded', coalesce(sum(pay.amount) filter (where pay.method is null), 0)
        )
      )
      from pay
    )
  );
$$;

revoke all on function public.admin_metrics_totals(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.admin_metrics_series(
  p_from timestamp, p_to timestamp, p_step interval, p_hours boolean
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with b as (
    select s.starts, s.n
    from generate_series(p_from, p_to - p_step, p_step) with ordinality as s(starts, n)
  ),
  ro as (
    select * from public.admin_metrics_orders(p_from at time zone 'Asia/Kolkata', p_to at time zone 'Asia/Kolkata')
  ),
  rl as (
    select ro.at, l.product_id, l.quantity
    from ro
    join public.order_lines l on l.order_id = ro.id and l.size <> 'sample'
  ),
  pay as (
    select * from public.admin_metrics_payments(p_from at time zone 'Asia/Kolkata', p_to at time zone 'Asia/Kolkata')
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('date', b.starts::date)
    || case when p_hours then jsonb_build_object('hour', extract(hour from b.starts)::integer) else '{}'::jsonb end
    || (
      select jsonb_build_object(
        'orders', count(*),
        'with_total', count(*) filter (where ro.amount is not null),
        'packs', coalesce(sum(ro.packs), 0),
        'sales', coalesce(sum(ro.amount), 0)
      )
      from ro
      where ro.at >= b.starts and ro.at < b.starts + p_step
    )
    || (
      select jsonb_build_object(
        'came_in', coalesce(sum(pay.amount) filter (where pay.method is distinct from 'gift'), 0),
        'came_in_by_method', jsonb_build_object(
          'upi', coalesce(sum(pay.amount) filter (where pay.method = 'upi'), 0),
          'cash', coalesce(sum(pay.amount) filter (where pay.method = 'cash'), 0),
          'bank', coalesce(sum(pay.amount) filter (where pay.method = 'bank'), 0),
          'gift', coalesce(sum(pay.amount) filter (where pay.method = 'gift'), 0),
          'other', coalesce(sum(pay.amount) filter (where pay.method = 'other'), 0),
          'not_recorded', coalesce(sum(pay.amount) filter (where pay.method is null), 0)
        )
      )
      from pay
      where pay.at >= b.starts and pay.at < b.starts + p_step
    )
    || jsonb_build_object('products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'packs', x.packs) order by x.product_id), '[]'::jsonb)
      from (
        select rl.product_id, sum(rl.quantity) as packs
        from rl
        where rl.at >= b.starts and rl.at < b.starts + p_step
        group by rl.product_id
      ) x
    ))
    order by b.n
  ), '[]'::jsonb)
  from b;
$$;

revoke all on function public.admin_metrics_series(timestamp, timestamp, interval, boolean)
  from public, anon, authenticated;

-- 3. Home's weekly totals
create or replace function public.get_admin_totals()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.kitchen_today();
  v_this_monday date := date_trunc('week', (now() at time zone 'Asia/Kolkata')::date)::date;
  v_this_start timestamptz := v_this_monday::timestamp at time zone 'Asia/Kolkata';
  v_last_start timestamptz := (v_this_monday - 7)::timestamp at time zone 'Asia/Kolkata';
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return (
    with stages (stage, position) as (
      values ('cooking', 1), ('packing', 2), ('ready', 3), ('to_collect', 4)
    ),
    staged as (
      select o.id, o.amount, o.paid_at, o.name, o.created_at, o.status_changed_at, o.free_sample,
        pay.count as payments, pay.total as amount_paid,
        case
          when o.status in ('cooking', 'packing', 'ready') then o.status
          when o.status = 'delivered' and o.paid_at is null and not o.free_sample then 'to_collect'
        end as stage
      from public.orders o
      cross join lateral (
        select count(*) as count, coalesce(sum(p.amount), 0) as total
        from public.order_payments p
        where p.order_id = o.id
      ) pay
      where o.status in ('cooking', 'packing', 'ready', 'delivered')
    ),
    staged_lines as (
      select s.id, s.stage, l.product_id, l.quantity, l.grams_each, l.size = 'sample' as sample,
        public.order_size_label(l.size, l.grams_each) as size
      from staged s
      join public.order_lines l on l.order_id = s.id
      where s.stage is not null
    ),
    cells as (
      select p.product_id, st.stage, st.position,
        json_build_object(
          'orders', a.orders,
          'packs', a.packs,
          'samples', a.samples,
          'grams', a.grams,
          'by_size', (
            select coalesce(json_agg(
              json_build_object('size', b.size, 'grams_each', b.grams_each, 'packs', b.packs)
              order by b.sample, b.grams_each
            ), '[]'::json)
            from (
              select sl.size, sl.grams_each, sl.sample, sum(sl.quantity) as packs
              from staged_lines sl
              where sl.product_id = p.product_id and sl.stage = st.stage
              group by sl.size, sl.grams_each, sl.sample
            ) b
          )
        ) as cell
      from (select distinct product_id from staged_lines) p
      cross join stages st
      cross join lateral (
        select count(distinct sl.id) as orders,
          coalesce(sum(sl.quantity) filter (where not sl.sample), 0) as packs,
          coalesce(sum(sl.quantity) filter (where sl.sample), 0) as samples,
          coalesce(sum(sl.quantity * sl.grams_each), 0) as grams
        from staged_lines sl
        where sl.product_id = p.product_id and sl.stage = st.stage
      ) a
    ),
    -- First names, each once, oldest first. to_collect by when it was
    -- delivered, ready by when it was ordered. Free samples are never named.
    waiting_names as (
      select n.list, (array_agg(n.first_name order by n.rn))[1] as first_name, min(n.rn) as rn
      from (
        select 'to_collect' as list, split_part(btrim(x.name), ' ', 1) as first_name,
          row_number() over (order by x.status_changed_at, x.created_at, x.id) as rn
        from staged x
        where x.stage = 'to_collect' and x.amount is null and nullif(btrim(x.name), '') is not null
        union all
        select 'ready', split_part(btrim(x.name), ' ', 1),
          row_number() over (order by x.created_at, x.id)
        from staged x
        where x.stage = 'ready' and x.paid_at is null and not x.free_sample
          and nullif(btrim(x.name), '') is not null
        union all
        select 'to_collect:part', split_part(btrim(x.name), ' ', 1),
          row_number() over (order by x.status_changed_at, x.created_at, x.id)
        from staged x
        where x.stage = 'to_collect' and x.payments > 0 and nullif(btrim(x.name), '') is not null
        union all
        select 'ready:part', split_part(btrim(x.name), ' ', 1),
          row_number() over (order by x.created_at, x.id)
        from staged x
        where x.stage = 'ready' and x.paid_at is null and x.payments > 0 and nullif(btrim(x.name), '') is not null
      ) n
      group by n.list, lower(n.first_name)
    ),
    overall as (
      select st.stage, st.position,
        jsonb_build_object(
          'orders', count(s.id),
          'packs', coalesce((
            select sum(sl.quantity) from staged_lines sl where sl.stage = st.stage and not sl.sample
          ), 0),
          'samples', coalesce((
            select sum(sl.quantity) from staged_lines sl where sl.stage = st.stage and sl.sample
          ), 0),
          'free_samples', count(s.id) filter (where s.free_sample),
          'amount', coalesce(sum(s.amount) filter (where not s.free_sample), 0),
          'without_amount', count(s.id) filter (where s.amount is null and not s.free_sample),
          'paid', count(s.id) filter (where s.paid_at is not null),
          'unpaid_amount', coalesce(sum(s.amount) filter (where s.paid_at is null and not s.free_sample), 0),
          'amount_due', coalesce(sum(greatest(s.amount - s.amount_paid, 0)) filter (where s.amount is not null), 0),
          'part_paid', count(s.id) filter (where s.paid_at is null and s.payments > 0)
        )
        || case
          when st.stage in ('to_collect', 'ready') then (
            select jsonb_build_object(
              case st.stage when 'to_collect' then 'without_amount_names' else 'unpaid_names' end,
              coalesce(jsonb_agg(w.first_name order by w.rn), '[]'::jsonb)
            )
            from (
              select wn.first_name, wn.rn
              from waiting_names wn
              where wn.list = st.stage
              order by wn.rn
              limit 3
            ) w
          )
          else '{}'::jsonb
        end
        || case
          when st.stage in ('to_collect', 'ready') then (
            select jsonb_build_object('part_paid_names', coalesce(jsonb_agg(w.first_name order by w.rn), '[]'::jsonb))
            from (
              select wn.first_name, wn.rn
              from waiting_names wn
              where wn.list = st.stage || ':part'
              order by wn.rn
              limit 3
            ) w
          )
          else '{}'::jsonb
        end as totals
      from stages st
      left join staged s on s.stage = st.stage
      group by st.stage, st.position
    ),
    -- Real orders: not cancelled, not a free sample.
    real_orders as (
      select o.id, o.created_at,
        (o.created_at at time zone 'Asia/Kolkata')::date as day,
        coalesce((
          select sum(l.quantity) from public.order_lines l where l.order_id = o.id and l.size <> 'sample'
        ), 0) as packs
      from public.orders o
      where o.status <> 'cancelled' and not o.free_sample
    ),
    real_lines as (
      select r.id, r.created_at, l.product_id, l.quantity
      from real_orders r
      join public.order_lines l on l.order_id = r.id and l.size <> 'sample'
    ),
    -- Samples: orders carrying a sample (free sample orders and paid orders
    -- with a taster), and sample packs on any order.
    sample_orders as (
      select o.created_at from public.orders o
      where o.status <> 'cancelled'
        and exists (select 1 from public.order_lines l where l.order_id = o.id and l.size = 'sample')
    ),
    sample_lines as (
      select o.created_at, l.quantity
      from public.orders o
      join public.order_lines l on l.order_id = o.id and l.size = 'sample'
      where o.status <> 'cancelled'
    ),
    paid as (
      select o.paid_at, o.amount
      from public.orders o
      where o.status <> 'cancelled' and o.paid_at is not null
    ),
    payments_in as (
      select p.paid_at, coalesce(p.amount, 0) as amount, p.method,
        (o.paid_at is null or exists (
          select 1 from public.order_payments q where q.order_id = p.order_id and q.id <> p.id
        )) as part
      from public.order_payments p
      join public.orders o on o.id = p.order_id
      where o.status <> 'cancelled' and p.method is distinct from 'gift'
    ),
    -- Gifts: settled but no money came in. Only for the by-method split.
    gifts_in as (
      select p.paid_at, coalesce(p.amount, 0) as amount
      from public.order_payments p
      join public.orders o on o.id = p.order_id
      where o.status <> 'cancelled' and p.method = 'gift'
    ),
    -- made_from / made_to: the India dates a week's batches count on
    -- (inclusive). last_so_far runs to the date 7 days ago.
    weeks (key, position, monday, starts_at, ends_at, made_from, made_to) as (
      values
        ('this', 1, v_this_monday, v_this_start, null::timestamptz, v_this_monday, v_today),
        ('last', 2, v_this_monday - 7, v_last_start, v_this_start, v_this_monday - 7, v_this_monday - 1),
        ('last_so_far', 3, v_this_monday - 7, v_last_start, now() - interval '7 days',
          v_this_monday - 7, ((now() - interval '7 days') at time zone 'Asia/Kolkata')::date)
    )
    select json_build_object(
      'as_of', now(),
      'first_order_at', (select min(r.created_at) from real_orders r),
      'products', (
        select coalesce(json_agg(
          json_build_object(
            'product_id', p.product_id,
            'stages', (
              select json_object_agg(c.stage, c.cell order by c.position)
              from cells c where c.product_id = p.product_id
            )
          )
          order by p.product_id
        ), '[]'::json)
        from (select distinct product_id from cells) p
      ),
      'overall', (
        select json_object_agg(ov.stage, ov.totals order by ov.position) from overall ov
      ),
      'weeks', (
        select json_object_agg(w.key, (
          jsonb_build_object(
            'starts_at', w.starts_at,
            'ends_at', coalesce(w.ends_at, now()),
            'orders', (
              select count(*) from real_orders r
              where r.created_at >= w.starts_at and (w.ends_at is null or r.created_at < w.ends_at)
            ),
            'packs', (
              select coalesce(sum(r.packs), 0) from real_orders r
              where r.created_at >= w.starts_at and (w.ends_at is null or r.created_at < w.ends_at)
            ),
            'amount_in', (
              select coalesce(sum(pi.amount), 0) from payments_in pi
              where pi.paid_at >= w.starts_at and (w.ends_at is null or pi.paid_at < w.ends_at)
            ),
            'paid_orders', (
              select count(*) from paid pd
              where pd.paid_at >= w.starts_at and (w.ends_at is null or pd.paid_at < w.ends_at)
            ),
            'paid_without_amount', (
              select count(*) from paid pd
              where pd.amount is null
                and pd.paid_at >= w.starts_at and (w.ends_at is null or pd.paid_at < w.ends_at)
            ),
            'part_payments', (
              select count(*) from payments_in pi
              where pi.part
                and pi.paid_at >= w.starts_at and (w.ends_at is null or pi.paid_at < w.ends_at)
            ),
            'grams_made', (
              select coalesce(sum(b.grams), 0) from public.kitchen_batches b
              where b.made_on between w.made_from and w.made_to
            ),
            'samples', jsonb_build_object(
              'orders', (
                select count(*) from sample_orders so
                where so.created_at >= w.starts_at and (w.ends_at is null or so.created_at < w.ends_at)
              ),
              'packs', (
                select coalesce(sum(sl.quantity), 0) from sample_lines sl
                where sl.created_at >= w.starts_at and (w.ends_at is null or sl.created_at < w.ends_at)
              )
            )
          )
          || case when w.key in ('this', 'last') then jsonb_build_object('days', (
            select jsonb_agg(
              jsonb_build_object(
                'date', w.monday + d.i,
                'orders', (select count(*) from real_orders r where r.day = w.monday + d.i),
                'packs', (select coalesce(sum(r.packs), 0) from real_orders r where r.day = w.monday + d.i)
              )
              order by d.i
            )
            from generate_series(0, 6) as d(i)
          )) else '{}'::jsonb end
          || case when w.key in ('this', 'last_so_far') then jsonb_build_object('by_product', (
            select coalesce(jsonb_agg(
              jsonb_build_object('product_id', b.product_id, 'packs', b.packs, 'orders', b.orders)
              order by b.product_id
            ), '[]'::jsonb)
            from (
              select rl.product_id, sum(rl.quantity) as packs, count(distinct rl.id) as orders
              from real_lines rl
              where rl.created_at >= w.starts_at and (w.ends_at is null or rl.created_at < w.ends_at)
              group by rl.product_id
            ) b
          )) else '{}'::jsonb end
          || case when w.key = 'this' then jsonb_build_object('amount_by_method', (
            select jsonb_build_object(
              'upi', coalesce(sum(pi.amount) filter (where pi.method = 'upi'), 0),
              'cash', coalesce(sum(pi.amount) filter (where pi.method = 'cash'), 0),
              'bank', coalesce(sum(pi.amount) filter (where pi.method = 'bank'), 0),
              'gift', (
                select coalesce(sum(g.amount), 0) from gifts_in g
                where g.paid_at >= w.starts_at and (w.ends_at is null or g.paid_at < w.ends_at)
              ),
              'other', coalesce(sum(pi.amount) filter (where pi.method = 'other'), 0),
              'not_recorded', coalesce(sum(pi.amount) filter (where pi.method is null), 0)
            )
            from payments_in pi
            where pi.paid_at >= w.starts_at and (w.ends_at is null or pi.paid_at < w.ends_at)
          )) else '{}'::jsonb end
        ) order by w.position)
        from weeks w
      ),
      'kitchen', public.kitchen_state_json()
    )
  );
end;
$$;

revoke all on function public.get_admin_totals() from public, anon;
grant execute on function public.get_admin_totals() to authenticated;
