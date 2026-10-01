-- Migration: 20261001000000_admin_metrics.sql
-- Home's metrics block: orders, packs, sales, money in and per-product packs
-- for Today, Week, Month, Year and Lifetime, each against the same moment in
-- the previous period, with a chart series per period. Admin only, read only,
-- add only: nothing existing changes. supabase/README.md has the shape and
-- the definitions; this file builds exactly that.
--
-- The definitions are get_admin_totals()'s weeks, so the two never disagree:
--   real order   not cancelled and not a free sample order, any stage, by
--                created_at (when it was placed).
--   packs/grams  its lines that aren't samples. grams = quantity × grams_each.
--   sales        orders.amount on real orders that have one (₹, per order,
--                never split by product).
--   samples      orders carrying a sample line and sample packs, on any order
--                that isn't cancelled; free_orders is the free sample orders
--                among them (the ones left out of orders and sales).
--   came in      every payment on an order that isn't cancelled, by its own
--                paid_at, split by method.
--   paid of sales payments on the window's real orders that have a total,
--                whenever they came in up to the window's "as of" moment
--                (now, or the same moment last period), at most each order's
--                total. Never mixed with came in: that's money by payment
--                date, this is how much of the period's sales is paid.
-- Profit is the browser's (sales × a constant), as are ratios and change %.
--
-- Everything is cut in India time. The previous period runs to the same
-- moment in it; when that day doesn't exist (31 March → February, 29 Feb →
-- last year), it runs to the end of that month. No comparison (previous is
-- null) until the first real order is before the previous period's start.
--
-- admin_metrics_json(p_now) does the work and has no grants, so the tests
-- can pin "now" to a month end or a leap day. get_admin_metrics() is the RPC.

-- ═══════════════════════════════════════════════════════
-- 1. The rows, in one place (internal)
-- ═══════════════════════════════════════════════════════

-- Real orders placed in [p_from, p_to), with their India time, total, packs
-- and grams (samples left out).
create or replace function public.admin_metrics_orders(p_from timestamptz, p_to timestamptz)
returns table (id uuid, at timestamp, amount integer, packs bigint, grams bigint)
language sql
stable
set search_path = public
as $$
  select o.id, o.created_at at time zone 'Asia/Kolkata', o.amount,
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

-- Payments that came in during [p_from, p_to) on orders that aren't
-- cancelled, with their India time. amount is null for "paid in full" on an
-- order with no total.
create or replace function public.admin_metrics_payments(p_from timestamptz, p_to timestamptz)
returns table (at timestamp, amount integer, method text)
language sql
stable
set search_path = public
as $$
  select p.paid_at at time zone 'Asia/Kolkata', p.amount, p.method
  from public.order_payments p
  join public.orders o on o.id = p.order_id
  where o.status <> 'cancelled'
    and p.paid_at >= p_from and p.paid_at < p_to;
$$;

revoke all on function public.admin_metrics_orders(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_metrics_payments(timestamptz, timestamptz) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Totals, products and chart series for a window (internal)
-- ═══════════════════════════════════════════════════════

-- p_as_of: the moment paid_of_sales is counted up to.
drop function if exists public.admin_metrics_totals(timestamptz, timestamptz);

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
        where p.order_id = ro.id and p.paid_at <= p_as_of
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
        'amount', coalesce(sum(pay.amount), 0),
        'payments', count(*),
        'without_amount', count(*) filter (where pay.amount is null),
        'by_method', jsonb_build_object(
          'upi', coalesce(sum(pay.amount) filter (where pay.method = 'upi'), 0),
          'cash', coalesce(sum(pay.amount) filter (where pay.method = 'cash'), 0),
          'bank', coalesce(sum(pay.amount) filter (where pay.method = 'bank'), 0),
          'other', coalesce(sum(pay.amount) filter (where pay.method = 'other'), 0),
          'not_recorded', coalesce(sum(pay.amount) filter (where pay.method is null), 0)
        )
      )
      from pay
    )
  );
$$;

-- Per product: real orders carrying it, packs and grams (no samples, no ₹).
-- Every product with packs in either window, by product_id. A null
-- p_prev_from means no comparison: previous is null on every row.
create or replace function public.admin_metrics_products(
  p_from timestamptz, p_to timestamptz, p_prev_from timestamptz, p_prev_to timestamptz
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with cur as (
    select l.product_id, count(distinct o.id) as orders, sum(l.quantity) as packs,
      sum(l.quantity * l.grams_each) as grams
    from public.admin_metrics_orders(p_from, p_to) o
    join public.order_lines l on l.order_id = o.id and l.size <> 'sample'
    group by l.product_id
  ),
  prev as (
    select l.product_id, count(distinct o.id) as orders, sum(l.quantity) as packs,
      sum(l.quantity * l.grams_each) as grams
    from public.admin_metrics_orders(p_prev_from, p_prev_to) o
    join public.order_lines l on l.order_id = o.id and l.size <> 'sample'
    where p_prev_from is not null
    group by l.product_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', ids.product_id,
      'orders', coalesce(c.orders, 0),
      'packs', coalesce(c.packs, 0),
      'grams', coalesce(c.grams, 0),
      'previous', case when p_prev_from is not null then jsonb_build_object(
        'orders', coalesce(p.orders, 0),
        'packs', coalesce(p.packs, 0),
        'grams', coalesce(p.grams, 0)
      ) end
    )
    order by ids.product_id
  ), '[]'::jsonb)
  from (select product_id from cur union select product_id from prev) ids
  left join cur c on c.product_id = ids.product_id
  left join prev p on p.product_id = ids.product_id;
$$;

-- Buckets of p_step from p_from (India time) up to p_to: the date each
-- starts on (and the hour, for hours), orders, with_total, packs, sales,
-- came in and its split by method (the five keys, zeros included), and packs
-- per product (only products with packs in the bucket, by product_id).
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
        'came_in', coalesce(sum(pay.amount), 0),
        'came_in_by_method', jsonb_build_object(
          'upi', coalesce(sum(pay.amount) filter (where pay.method = 'upi'), 0),
          'cash', coalesce(sum(pay.amount) filter (where pay.method = 'cash'), 0),
          'bank', coalesce(sum(pay.amount) filter (where pay.method = 'bank'), 0),
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

revoke all on function public.admin_metrics_totals(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_metrics_products(timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_metrics_series(timestamp, timestamp, interval, boolean)
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. The five periods (internal; p_now is pinned in tests)
-- ═══════════════════════════════════════════════════════

-- Bounds are India local timestamps. cur_to and prev_to are the periods'
-- ends; prev_cut is the same moment in the previous period. Lifetime counts
-- everything (-infinity to infinity) and charts from the first order's week
-- (26 weeks or fewer) or month.
create or replace function public.admin_metrics_json(p_now timestamptz)
returns json
language plpgsql
stable
set search_path = public
as $$
declare
  v_local timestamp := p_now at time zone 'Asia/Kolkata';
  v_day timestamp := date_trunc('day', v_local);
  v_week timestamp := date_trunc('week', v_local);
  v_month timestamp := date_trunc('month', v_local);
  v_year timestamp := date_trunc('year', v_local);
  v_first timestamptz;
  v_life_step interval;
  v_life_from timestamp;
begin
  select min(o.created_at) into v_first
  from public.orders o
  where o.status <> 'cancelled' and not o.free_sample;

  if v_first is null
     or date_trunc('week', v_first at time zone 'Asia/Kolkata') >= v_week - interval '25 weeks' then
    v_life_step := interval '1 week';
    v_life_from := date_trunc('week', coalesce(v_first at time zone 'Asia/Kolkata', v_local));
  else
    v_life_step := interval '1 month';
    v_life_from := date_trunc('month', v_first at time zone 'Asia/Kolkata');
  end if;

  return (
    with p (key, position, grain, step, cur_from, cur_to, chart_from, chart_to, prev_from, prev_cut, prev_to) as (
      values
        ('today', 1, 'hour', interval '1 hour',
          v_day, v_day + interval '1 day', v_day, v_day + interval '1 day',
          v_day - interval '1 day', v_local - interval '1 day', v_day),
        ('week', 2, 'day', interval '1 day',
          v_week, v_week + interval '7 days', v_week, v_week + interval '7 days',
          v_week - interval '7 days', v_local - interval '7 days', v_week),
        -- Same day and time last month, or the whole of last month when
        -- this day doesn't exist there.
        ('month', 3, 'day', interval '1 day',
          v_month, v_month + interval '1 month', v_month, v_month + interval '1 month',
          v_month - interval '1 month',
          least(v_month - interval '1 month' + (v_local - v_month), v_month),
          v_month),
        -- Same date and time last year; 29 Feb runs to the end of February.
        ('year', 4, 'month', interval '1 month',
          v_year, v_year + interval '1 year', v_year, v_year + interval '1 year',
          v_year - interval '1 year',
          least(v_month - interval '1 year' + (v_local - v_month), v_month - interval '1 year' + interval '1 month'),
          v_year),
        ('lifetime', 5, case when v_life_step = interval '1 week' then 'week' else 'month' end, v_life_step,
          '-infinity'::timestamp, 'infinity'::timestamp,
          v_life_from, date_trunc(case when v_life_step = interval '1 week' then 'week' else 'month' end, v_local) + v_life_step,
          null::timestamp, null::timestamp, null::timestamp)
    ),
    q as (
      select p.*,
        v_first is not null and p.prev_from is not null
          and v_first < p.prev_from at time zone 'Asia/Kolkata' as compare
      from p
    )
    select json_build_object(
      'as_of', p_now,
      'first_order_at', v_first,
      'periods', (
        select json_object_agg(q.key, json_build_object(
          'starts_at', case when q.key = 'lifetime' then v_first else q.cur_from at time zone 'Asia/Kolkata' end,
          'ends_at', p_now,
          'totals', public.admin_metrics_totals(q.cur_from at time zone 'Asia/Kolkata', q.cur_to at time zone 'Asia/Kolkata', p_now),
          'previous', case when q.compare then json_build_object(
            'starts_at', q.prev_from at time zone 'Asia/Kolkata',
            'ends_at', q.prev_cut at time zone 'Asia/Kolkata',
            'totals', public.admin_metrics_totals(q.prev_from at time zone 'Asia/Kolkata', q.prev_cut at time zone 'Asia/Kolkata',
              q.prev_cut at time zone 'Asia/Kolkata')
          ) end,
          'products', public.admin_metrics_products(
            q.cur_from at time zone 'Asia/Kolkata', q.cur_to at time zone 'Asia/Kolkata',
            case when q.compare then q.prev_from at time zone 'Asia/Kolkata' end,
            case when q.compare then q.prev_cut at time zone 'Asia/Kolkata' end
          ),
          'chart', json_build_object(
            'grain', q.grain,
            'now_index', (select count(*) - 1 from generate_series(q.chart_from, v_local, q.step)),
            'current', public.admin_metrics_series(q.chart_from, q.chart_to, q.step, q.grain = 'hour'),
            'previous', case when q.compare then
              public.admin_metrics_series(q.prev_from, q.prev_to, q.step, q.grain = 'hour') end
          )
        ) order by q.position)
        from q
      )
    )
  );
end;
$$;

revoke all on function public.admin_metrics_json(timestamptz) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 4. The RPC
-- ═══════════════════════════════════════════════════════

create or replace function public.get_admin_metrics()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  return public.admin_metrics_json(now());
end;
$$;

revoke all on function public.get_admin_metrics() from public, anon;
grant execute on function public.get_admin_metrics() to authenticated;
