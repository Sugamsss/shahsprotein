-- Migration: 20260926000008_money_by_method.sql
-- Home: this week's money in, split by how it was paid. Admin only; nothing
-- public changes.
--
-- get_admin_totals() gains one key, weeks.this.amount_by_method:
--   { "upi": 0, "cash": 0, "bank": 0, "other": 0, "not_recorded": 0 }
-- ₹ paid this week (Monday 00:00 IST to now, by paid_at, not cancelled), the
-- same orders as weeks.this.amount_in, grouped by orders.paid_method. Orders
-- marked paid before 20260926000007 have no method and count as
-- not_recorded. Paid orders with no amount add nothing (they're still in
-- paid_without_amount), so the five always add up to amount_in. All five keys
-- are always there, zeros included; the app hides the zeros.
--
-- Only a key is added: every existing key keeps its shape and meaning, so the
-- live app works before and after. The stages don't change, and money stays
-- per order. Everything else in the function is the same as in
-- 20260926000006 (20260926000007 didn't change it).

create or replace function public.get_admin_totals()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_this_monday date := date_trunc('week', (now() at time zone 'Asia/Kolkata')::date)::date;
  v_this_start timestamptz := v_this_monday::timestamp at time zone 'Asia/Kolkata';
  v_last_start timestamptz := (v_this_monday - 7)::timestamp at time zone 'Asia/Kolkata';
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return (
    with stages (stage, position) as (
      values ('to_confirm', 1), ('to_send', 2), ('on_the_way', 3), ('to_collect', 4), ('stale', 5)
    ),
    staged as (
      select o.id, o.amount, o.paid_at, o.name, o.created_at, o.status_changed_at,
        case
          when public.order_is_stale(o) then 'stale'
          when o.status = 'new' then 'to_confirm'
          when o.status = 'confirmed' then 'to_send'
          when o.status = 'sent' then 'on_the_way'
          when o.status = 'delivered' and o.paid_at is null then 'to_collect'
        end as stage
      from public.orders o
      where o.status in ('new', 'confirmed', 'sent', 'delivered')
    ),
    staged_lines as (
      select s.id, s.stage, l.product_id, l.quantity, w.grams_each,
        case
          when w.grams_each >= 1000 and w.grams_each % 1000 = 0 then (w.grams_each / 1000) || ' kg'
          else w.grams_each || ' g'
        end as size
      from staged s
      join public.order_lines l on l.order_id = s.id
      cross join lateral (
        select (substring(l.size from '^([0-9]+) ?(?:g|kg)$'))::integer
          * case when l.size ~ 'kg$' then 1000 else 1 end as grams_each
      ) w
      where s.stage is not null
    ),
    -- One cell per product and stage, zeros where the product has nothing.
    cells as (
      select p.product_id, st.stage, st.position,
        json_build_object(
          'orders', a.orders,
          'packs', a.packs,
          'grams', a.grams,
          'by_size', (
            select coalesce(json_agg(
              json_build_object('size', b.size, 'grams_each', b.grams_each, 'packs', b.packs)
              order by b.grams_each
            ), '[]'::json)
            from (
              select sl.size, sl.grams_each, sum(sl.quantity) as packs
              from staged_lines sl
              where sl.product_id = p.product_id and sl.stage = st.stage
              group by sl.grams_each, sl.size
            ) b
          )
        ) as cell
      from (select distinct product_id from staged_lines) p
      cross join stages st
      cross join lateral (
        select count(distinct sl.id) as orders,
          coalesce(sum(sl.quantity), 0) as packs,
          coalesce(sum(sl.quantity * sl.grams_each), 0) as grams
        from staged_lines sl
        where sl.product_id = p.product_id and sl.stage = st.stage
      ) a
    ),
    -- Who two stages are waiting on, as first names. A name shows once, where
    -- it first appears (ignoring case); an order with no name is counted in
    -- the totals but not named. to_collect goes by when it was delivered
    -- (status_changed_at, as the overview's oldest owed order), on_the_way by
    -- when it was ordered.
    waiting_names as (
      select n.list, (array_agg(n.first_name order by n.rn))[1] as first_name, min(n.rn) as rn
      from (
        select 'without_amount_names' as list, split_part(btrim(x.name), ' ', 1) as first_name,
          row_number() over (order by x.status_changed_at, x.created_at, x.id) as rn
        from staged x
        where x.stage = 'to_collect' and x.amount is null and nullif(btrim(x.name), '') is not null
        union all
        select 'unpaid_names', split_part(btrim(x.name), ' ', 1),
          row_number() over (order by x.created_at, x.id)
        from staged x
        where x.stage = 'on_the_way' and x.paid_at is null and nullif(btrim(x.name), '') is not null
      ) n
      group by n.list, lower(n.first_name)
    ),
    -- Stale orders never came through, so they carry no money. to_collect
    -- and on_the_way add up to 3 waiting names.
    overall as (
      select st.stage, st.position,
        jsonb_build_object(
          'orders', count(s.id),
          'packs', coalesce((
            select sum(sl.quantity) from staged_lines sl where sl.stage = st.stage
          ), 0)
        )
        || case when st.stage = 'stale' then '{}'::jsonb else jsonb_build_object(
          'amount', coalesce(sum(s.amount), 0),
          'without_amount', count(s.id) filter (where s.amount is null),
          'paid', count(s.id) filter (where s.paid_at is not null),
          'unpaid_amount', coalesce(sum(s.amount) filter (where s.paid_at is null), 0)
        ) end
        || case
          when st.stage in ('to_collect', 'on_the_way') then (
            select jsonb_build_object(
              case st.stage when 'to_collect' then 'without_amount_names' else 'unpaid_names' end,
              coalesce(jsonb_agg(w.first_name order by w.rn), '[]'::jsonb)
            )
            from (
              select wn.first_name, wn.rn
              from waiting_names wn
              where wn.list = case st.stage when 'to_collect' then 'without_amount_names' else 'unpaid_names' end
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
    real_orders as (
      select o.created_at,
        (o.created_at at time zone 'Asia/Kolkata')::date as day,
        coalesce((select sum(l.quantity) from public.order_lines l where l.order_id = o.id), 0) as packs
      from public.orders o
      where o.status in ('confirmed', 'sent', 'delivered')
    ),
    real_lines as (
      select o.id, o.created_at, l.product_id, l.quantity
      from public.orders o
      join public.order_lines l on l.order_id = o.id
      where o.status in ('confirmed', 'sent', 'delivered')
    ),
    paid as (
      select o.paid_at, o.amount, o.paid_method
      from public.orders o
      where o.status <> 'cancelled' and o.paid_at is not null
    ),
    -- A null ends_at means "up to now", with no upper bound. monday is the
    -- India date the week starts, for its days.
    weeks (key, position, monday, starts_at, ends_at) as (
      values
        ('this', 1, v_this_monday, v_this_start, null::timestamptz),
        ('last', 2, v_this_monday - 7, v_last_start, v_this_start),
        ('last_so_far', 3, v_this_monday - 7, v_last_start, now() - interval '7 days')
    )
    select json_build_object(
      'as_of', now(),
      -- The earliest real order, so the app knows when there's no last week yet.
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
              select coalesce(sum(pd.amount), 0) from paid pd
              where pd.paid_at >= w.starts_at and (w.ends_at is null or pd.paid_at < w.ends_at)
            ),
            'paid_orders', (
              select count(*) from paid pd
              where pd.paid_at >= w.starts_at and (w.ends_at is null or pd.paid_at < w.ends_at)
            ),
            'paid_without_amount', (
              select count(*) from paid pd
              where pd.amount is null
                and pd.paid_at >= w.starts_at and (w.ends_at is null or pd.paid_at < w.ends_at)
            )
          )
          -- This week and last: the 7 days, Monday to Sunday, same rule.
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
          -- This week and last week so far: each product's packs and orders.
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
          -- This week: the money in by how it was paid. Only orders with an
          -- amount add anything, so the five add up to amount_in. A paid order
          -- with no method (marked paid before 20260926000007) is not_recorded.
          || case when w.key = 'this' then jsonb_build_object('amount_by_method', (
            select jsonb_build_object(
              'upi', coalesce(sum(pd.amount) filter (where pd.paid_method = 'upi'), 0),
              'cash', coalesce(sum(pd.amount) filter (where pd.paid_method = 'cash'), 0),
              'bank', coalesce(sum(pd.amount) filter (where pd.paid_method = 'bank'), 0),
              'other', coalesce(sum(pd.amount) filter (where pd.paid_method = 'other'), 0),
              'not_recorded', coalesce(sum(pd.amount) filter (where pd.paid_method is null), 0)
            )
            from paid pd
            where pd.paid_at >= w.starts_at and (w.ends_at is null or pd.paid_at < w.ends_at)
          )) else '{}'::jsonb end
        ) order by w.position)
        from weeks w
      )
    )
  );
end;
$$;

revoke all on function public.get_admin_totals() from public, anon;
grant execute on function public.get_admin_totals() to authenticated;
