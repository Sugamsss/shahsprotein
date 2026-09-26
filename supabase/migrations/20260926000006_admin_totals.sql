-- Migration: 20260926000006_admin_totals.sql
-- The per-product Home, and the Orders view filtered to one product.
-- Admin only; nothing public changes.
--
-- 1. get_admin_totals(): every product's packs and weight in each stage, the
--    same stages across all products with money, and this week against last.
--    One call; the Home picks what to show per person.
-- 2. get_admin_orders() gains p_product: only orders that contain that
--    product (any size). The old 10-argument signature is dropped first, so
--    PostgREST never sees two overloads. Everything else is as in
--    20260926000001.
--
-- The stages are the only definitions, and every order is in at most one:
--   to_confirm   New and not stale
--   to_send      Confirmed
--   on_the_way   Sent
--   to_collect   Delivered and not paid
--   stale        order_is_stale() (never re-derived here)
-- Cancelled and done (delivered and paid) orders are in none.
--
-- Weight comes from the size string ('250 g' is 250, '1 kg' is 1000). Sizes
-- group by weight, so '250g' and '250 g' are one row, sorted lightest first;
-- the label is '<n> g', or '<n> kg' for whole kilos. Sizes with no packs are
-- left out. Money exists per order, so it's only in "overall", never per
-- product, and never on stale orders (they never came through). Overall
-- to_collect and on_the_way also name up to 3 people (first names, oldest
-- order first) with no total yet / not paid yet. Everything is zeros and
-- empty arrays, never null, except first_order_at (null with no real order).
--
-- Weeks start on Monday, India time. A week's orders and packs are real
-- orders (confirmed, sent or delivered) by created_at; its money is the amount
-- on not-cancelled orders by paid_at. "this" runs from Monday 00:00 IST to
-- now; "last" is the whole of last week; "last_so_far" is last week up to the
-- same moment 7 days ago, for a fair comparison. Starts are inclusive and
-- ends exclusive. "this" and "last" have days: always 7, Monday to Sunday,
-- same rule, so they add up to the week. "this" and "last_so_far" have
-- by_product: each product's packs and orders, for a fair comparison.
--
-- 3. admin_users.home_view ('cook' or 'admin', default 'admin') picks which
--    Home someone sees, and get_admin_me() returns it. Nobody is set to
--    'cook' here; that's done in production by user id.

-- ═══════════════════════════════════════════════════════
-- 1. get_admin_totals()
-- ═══════════════════════════════════════════════════════

-- The first draft of this migration (never shipped) had the same signature,
-- so create or replace also covers a local database that ran it.
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
      select o.id, o.amount, o.paid_at, o.name, o.created_at,
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
    -- Stale orders never came through, so they carry no money. Two stages
    -- also name who they're waiting on: first names, at most 3, oldest
    -- first; an order with no name is counted but not named.
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
        || case st.stage
          when 'to_collect' then jsonb_build_object('without_amount_names', (
            select coalesce(jsonb_agg(n.first_name order by n.created_at, n.id), '[]'::jsonb)
            from (
              select split_part(btrim(x.name), ' ', 1) as first_name, x.created_at, x.id
              from staged x
              where x.stage = st.stage and x.amount is null and nullif(btrim(x.name), '') is not null
              order by x.created_at, x.id
              limit 3
            ) n
          ))
          when 'on_the_way' then jsonb_build_object('unpaid_names', (
            select coalesce(jsonb_agg(n.first_name order by n.created_at, n.id), '[]'::jsonb)
            from (
              select split_part(btrim(x.name), ' ', 1) as first_name, x.created_at, x.id
              from staged x
              where x.stage = st.stage and x.paid_at is null and nullif(btrim(x.name), '') is not null
              order by x.created_at, x.id
              limit 3
            ) n
          ))
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
      select o.paid_at, o.amount
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
        ) order by w.position)
        from weeks w
      )
    )
  );
end;
$$;

revoke all on function public.get_admin_totals() from public, anon;
grant execute on function public.get_admin_totals() to authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. get_admin_orders(): p_product
-- ═══════════════════════════════════════════════════════

-- Nothing else in the database calls these two (only get_admin_orders calls
-- admin_filter_orders), so both are dropped and made again with p_product.
drop function if exists public.get_admin_orders(
  text, text[], boolean, text, text, text, timestamptz, timestamptz, timestamptz, integer
);
drop function if exists public.admin_filter_orders(
  text, text[], boolean, text, timestamptz, timestamptz, timestamptz, boolean, text, text, text, text
);

-- The filters behind get_admin_orders(), written once so the page, the tie
-- boundary and "is there more?" can't disagree. Search terms arrive already
-- turned into LIKE patterns (null means "not searching on this").
-- p_product keeps orders with at least one line of that product, any size.
create function public.admin_filter_orders(
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
  p_digits_like text,
  p_product text
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
    )
    and (p_product is null or exists (
      select 1 from public.order_lines l
      where l.order_id = o.id and l.product_id = p_product
    ));
$$;

revoke all on function public.admin_filter_orders(text, text[], boolean, text, timestamptz, timestamptz, timestamptz, boolean, text, text, text, text, text)
  from public, anon, authenticated;

-- Newest first. p_before pages strictly older than a created_at. A page is
-- never cut inside a group of orders with the same created_at (hand-added
-- orders back-dated to the same moment would otherwise be skipped), so a
-- page can be a little longer than p_limit.
-- p_from is inclusive and p_to exclusive (send the start of the next day).
-- p_product (e.g. 'raggi-jaggi') keeps orders containing that product; an
-- unknown product matches nothing, and blank means no filter.
create function public.get_admin_orders(
  p_view text default 'todo',
  p_status text[] default null,
  p_paid boolean default null,
  p_search text default null,
  p_phone text default null,
  p_source text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before timestamptz default null,
  p_limit integer default 50,
  p_product text default null
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
  v_product text := nullif(btrim(p_product), '');
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
    v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like, v_product
  ) f
  order by f.created_at desc, f.id desc
  offset v_limit - 1
  limit 1;

  select coalesce(json_agg(public.admin_order_json(f) order by f.created_at desc, f.id desc), '[]'::json)
  into v_orders
  from public.admin_filter_orders(
    v_view, v_status, p_paid, p_source, p_from, p_to, p_before,
    v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like, v_product
  ) f
  where v_boundary is null or f.created_at >= v_boundary;

  if v_boundary is not null and exists (
    select 1
    from public.admin_filter_orders(
      v_view, v_status, p_paid, p_source, p_from, p_to, v_boundary,
      v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like, v_product
    )
  ) then
    v_next_before := v_boundary;
  end if;

  return json_build_object('orders', v_orders, 'next_before', v_next_before);
end;
$$;

revoke all on function public.get_admin_orders(text, text[], boolean, text, text, text, timestamptz, timestamptz, timestamptz, integer, text) from public, anon;
grant execute on function public.get_admin_orders(text, text[], boolean, text, text, text, timestamptz, timestamptz, timestamptz, integer, text) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. admin_users.home_view, returned by get_admin_me()
-- ═══════════════════════════════════════════════════════

alter table public.admin_users
  add column if not exists home_view text not null default 'admin'
    constraint admin_users_home_view_check check (home_view in ('cook', 'admin'));

-- The admin's auth gate. Raises for anyone who isn't an admin. The same as
-- in 20260926000001, plus home_view.
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
    'display_name', v_admin.display_name,
    'home_view', v_admin.home_view
  );
end;
$$;

revoke all on function public.get_admin_me() from public, anon;
grant execute on function public.get_admin_me() to authenticated;
