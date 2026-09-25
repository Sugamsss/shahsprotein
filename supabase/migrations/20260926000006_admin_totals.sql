-- Migration: 20260926000006_admin_totals.sql
-- Totals at a glance for the top of the admin Home.
--
-- get_admin_totals() returns, in one call, the "right now" numbers and four
-- periods (today, this week, this month, all time), so the period switch on
-- Home never has to fetch again. Admin only. Nothing else changes.
--
-- The rules, all India time:
--   * Right now: pending = to confirm (New, not stale) + to send (Confirmed)
--     + on the way (Sent). Stale is order_is_stale(), never re-derived here.
--     Packs to send are the packs in Confirmed orders. To collect is
--     Delivered and not paid, the same as the overview's to_collect.
--   * Periods: today from IST midnight, the week from Monday IST (the
--     overview's maths), the month from the 1st IST, all time with no lower
--     bound. Each runs up to now; created_at and paid_at are never in the
--     future (save_admin_order clamps a hand-typed date to now).
--   * A period's orders and packs are real orders: Confirmed, Sent or
--     Delivered, by created_at (the "what's selling" rule). New, stale and
--     cancelled orders are left out.
--   * Earned is the sum of amount on not-cancelled orders paid in the period
--     (by paid_at). Paid orders with no amount typed are counted in
--     paid_without_amount, so the app can say the total is a floor.
--   * Sizes group by weight, so '250g' and '250 g' are one row and '1 kg'
--     sorts after '500 g'. Labels are '<n> g', or '<n> kg' for whole kilos.
--     Sizes with no packs are left out.
--   * The week also has days: always 7, Monday to Sunday, with the same rule
--     as the week's orders and packs, so the bars add up to the week total.
--
-- Empty tables give zeros and empty arrays, never nulls (starts_on is null
-- only for all time).

create or replace function public.get_admin_totals()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_week_start_date date := date_trunc('week', v_today)::date;
  v_month_start_date date := date_trunc('month', v_today)::date;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return (
    with periods (key, starts_on, since) as (
      values
        ('today', v_today,            v_today::timestamp at time zone 'Asia/Kolkata'),
        ('week',  v_week_start_date,  v_week_start_date::timestamp at time zone 'Asia/Kolkata'),
        ('month', v_month_start_date, v_month_start_date::timestamp at time zone 'Asia/Kolkata'),
        ('all',   null::date,         null::timestamptz)
    ),
    -- Every line of a real order (Confirmed, Sent or Delivered), with its
    -- weight in grams for grouping and sorting.
    real_lines as (
      select
        o.status,
        o.created_at,
        l.quantity,
        w.grams,
        case
          when w.grams >= 1000 and w.grams % 1000 = 0 then (w.grams / 1000) || ' kg'
          else w.grams || ' g'
        end as size
      from public.orders o
      join public.order_lines l on l.order_id = o.id
      cross join lateral (
        select (substring(l.size from '^[0-9]+'))::integer
          * case when l.size ~ 'kg$' then 1000 else 1 end as grams
      ) w
      where o.status in ('confirmed', 'sent', 'delivered')
    ),
    real_orders as (
      select
        o.created_at,
        (o.created_at at time zone 'Asia/Kolkata')::date as day,
        coalesce((select sum(l.quantity) from public.order_lines l where l.order_id = o.id), 0) as packs
      from public.orders o
      where o.status in ('confirmed', 'sent', 'delivered')
    )
    select json_build_object(
      'as_of', now(),
      'now', (
        select json_build_object(
          'pending', count(*) filter (
            where (o.status = 'new' and not public.order_is_stale(o))
               or o.status in ('confirmed', 'sent')
          ),
          'to_confirm', count(*) filter (where o.status = 'new' and not public.order_is_stale(o)),
          'to_send', count(*) filter (where o.status = 'confirmed'),
          'on_the_way', count(*) filter (where o.status = 'sent'),
          'packs_to_send', (
            select coalesce(sum(r.quantity), 0) from real_lines r where r.status = 'confirmed'
          ),
          'packs_to_send_by_size', (
            select coalesce(json_agg(
              json_build_object('size', s.size, 'packs', s.packs)
              order by s.grams
            ), '[]'::json)
            from (
              select r.grams, r.size, sum(r.quantity) as packs
              from real_lines r
              where r.status = 'confirmed'
              group by r.grams, r.size
            ) s
          ),
          'to_collect', json_build_object(
            'amount', coalesce(sum(o.amount) filter (where o.status = 'delivered' and o.paid_at is null), 0),
            'orders', count(*) filter (where o.status = 'delivered' and o.paid_at is null),
            'without_amount', count(*) filter (
              where o.status = 'delivered' and o.paid_at is null and o.amount is null
            )
          )
        )
        from public.orders o
        where o.status in ('new', 'confirmed', 'sent', 'delivered')
      ),
      'periods', (
        select json_object_agg(p.key, json_build_object(
          'starts_on', p.starts_on,
          'orders', (
            select count(*) from real_orders r
            where p.since is null or r.created_at >= p.since
          ),
          'packs', (
            select coalesce(sum(r.packs), 0) from real_orders r
            where p.since is null or r.created_at >= p.since
          ),
          'packs_by_size', (
            select coalesce(json_agg(
              json_build_object('size', s.size, 'packs', s.packs)
              order by s.grams
            ), '[]'::json)
            from (
              select r.grams, r.size, sum(r.quantity) as packs
              from real_lines r
              where p.since is null or r.created_at >= p.since
              group by r.grams, r.size
            ) s
          ),
          'earned', (
            select coalesce(sum(o.amount), 0) from public.orders o
            where o.status <> 'cancelled' and o.paid_at is not null
              and (p.since is null or o.paid_at >= p.since)
          ),
          'paid_orders', (
            select count(*) from public.orders o
            where o.status <> 'cancelled' and o.paid_at is not null
              and (p.since is null or o.paid_at >= p.since)
          ),
          'paid_without_amount', (
            select count(*) from public.orders o
            where o.status <> 'cancelled' and o.paid_at is not null and o.amount is null
              and (p.since is null or o.paid_at >= p.since)
          )
        )::jsonb
        -- Only the week has day-by-day bars, Monday to Sunday.
        || case when p.key = 'week' then jsonb_build_object('days', (
          select json_agg(
            json_build_object(
              'date', p.starts_on + d.i,
              'orders', (select count(*) from real_orders r where r.day = p.starts_on + d.i),
              'packs', (select coalesce(sum(r.packs), 0) from real_orders r where r.day = p.starts_on + d.i)
            )
            order by d.i
          )
          from generate_series(0, 6) as d(i)
        )) else '{}'::jsonb end)
        from periods p
      )
    )
  );
end;
$$;

revoke all on function public.get_admin_totals() from public, anon;
grant execute on function public.get_admin_totals() to authenticated;
