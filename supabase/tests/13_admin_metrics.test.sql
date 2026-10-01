-- 20261001000000: get_admin_metrics() for Home's metrics block. Who can call
-- it, zeros on an empty database, every number for each period against the
-- same moment last time, India time, the month end and leap day cuts, when
-- there's no comparison, and that the chart adds up to the totals.
-- temp/home-metrics/contract.md has the definitions.
--
-- "Now" is pinned through admin_metrics_json(p_now) (internal, no grants), so
-- nothing here depends on today's date. Test data is fake (example names, no
-- phones) and everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

delete from public.orders;
delete from public.kitchen_writeoffs;
delete from public.kitchen_allocations;
delete from public.kitchen_batches;
delete from public.kitchen_actions;
delete from public.admin_users;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

-- A wall-clock time in India.
create function pg_temp.ist(p text) returns timestamptz language sql as $$
  select p::timestamp at time zone 'Asia/Kolkata';
$$;

-- The metrics at a pinned India time.
create function pg_temp.m(p text) returns jsonb language sql as $$
  select public.admin_metrics_json(pg_temp.ist(p))::jsonb;
$$;

-- Buckets with something in them, keyed by index, so the zeros don't swamp the test.
create function pg_temp.busy(p_series jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg((b.i - 1)::text, b.v - 'date' - 'hour' order by b.i), '{}'::jsonb)
  from jsonb_array_elements(p_series) with ordinality as b(v, i)
  where (b.v ->> 'orders')::int > 0 or (b.v ->> 'came_in')::int > 0
$$;

-- ─── 1. Who can call it ─────────────────────────────────

set local role anon;
select throws_ok('select public.get_admin_metrics()', '42501', null, 'anon cannot call get_admin_metrics');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok('select public.get_admin_metrics()', 'P0001', 'Unauthorized', 'non-admin: get_admin_metrics');
reset role;

select ok(
  has_function_privilege('authenticated', 'public.get_admin_metrics()', 'execute')
  and not has_function_privilege('anon', 'public.get_admin_metrics()', 'execute')
  and not has_function_privilege('public', 'public.get_admin_metrics()', 'execute')
  and not exists (
    select 1 from pg_proc p
    cross join (values ('anon'), ('authenticated')) r(role)
    where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_metrics\_%'
      and has_function_privilege(r.role, p.oid, 'execute')
  ),
  'grants: only authenticated can run get_admin_metrics; the admin_metrics_* helpers have no grants'
);

-- ─── 2. An empty database ───────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.empty', public.get_admin_metrics()::text, true);
reset role;

select is(
  (select jsonb_object_agg(p.key, jsonb_build_object(
      'totals', p.value -> 'totals', 'previous', p.value -> 'previous', 'products', p.value -> 'products',
      'chart_previous', p.value #> '{chart,previous}'))
   from jsonb_each(current_setting('test.empty')::jsonb -> 'periods') p),
  (select jsonb_object_agg(k, jsonb_build_object(
      'totals', '{"orders":0,"packs":0,"grams":0,"sales":0,"with_total":0,"without_total":0,
                  "samples":{"orders":0,"packs":0},
                  "came_in":{"amount":0,"payments":0,"without_amount":0,
                             "by_method":{"upi":0,"cash":0,"bank":0,"other":0,"not_recorded":0}}}'::jsonb,
      'previous', null, 'products', '[]'::jsonb, 'chart_previous', null))
   from unnest(array['today', 'week', 'month', 'year', 'lifetime']) k),
  'empty: every period is zeros, with no comparison and no products'
);

select is(
  jsonb_build_object(
    'first_order_at', current_setting('test.empty')::jsonb -> 'first_order_at',
    'lifetime_starts_at', current_setting('test.empty')::jsonb #> '{periods,lifetime,starts_at}',
    'lifetime_chart', current_setting('test.empty')::jsonb #> '{periods,lifetime,chart}'),
  jsonb_build_object(
    'first_order_at', null, 'lifetime_starts_at', null,
    'lifetime_chart', jsonb_build_object('grain', 'week', 'now_index', 0, 'previous', null, 'current', jsonb_build_array(
      jsonb_build_object('date', date_trunc('week', now() at time zone 'Asia/Kolkata')::date,
        'orders', 0, 'packs', 0, 'sales', 0, 'came_in', 0)))),
  'empty: no first order; lifetime is this week, one zero bucket'
);

select is(
  (select jsonb_object_agg(p.key, jsonb_build_object(
      'grain', p.value #> '{chart,grain}', 'buckets', jsonb_array_length(p.value #> '{chart,current}')))
   from jsonb_each(current_setting('test.empty')::jsonb -> 'periods') p
   where p.key <> 'lifetime'),
  jsonb_build_object(
    'today', '{"grain":"hour","buckets":24}'::jsonb,
    'week', '{"grain":"day","buckets":7}'::jsonb,
    'month', jsonb_build_object('grain', 'day', 'buckets',
      extract(day from date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month - 1 day')::int),
    'year', '{"grain":"month","buckets":12}'::jsonb),
  'empty: the charts have the whole period: 24 hours, 7 days, every day of the month, 12 months'
);

-- ─── 3. Fixtures ────────────────────────────────────────

-- "Now" is mostly Wednesday 31 March 2027, 14:00 India time. Each order says
-- which window it's meant for.
insert into public.orders (code, source, status, name, amount, free_sample, created_at)
select f.code, 'whatsapp', f.status, 'Test Example', f.amount, f.free_sample, pg_temp.ist(f.at)
from (values
  -- today
  ('SN-TDA22', 'delivered', 500,  false, '2027-03-31 09:30'),
  ('SN-TDB22', 'delivered', null, false, '2027-03-31 00:30'),   -- still 30 March in UTC
  ('SN-TDC22', 'delivered', 900,  false, '2027-03-31 11:00'),   -- cancelled below, after its payment
  ('SN-TDD22', 'ready',     null, true,  '2027-03-31 12:00'),   -- a free sample order
  -- yesterday: before and after 14:00
  ('SN-YDA22', 'delivered', 400,  false, '2027-03-30 10:00'),
  ('SN-YDB22', 'delivered', 250,  false, '2027-03-30 15:00'),
  -- last week before the same moment, and this Monday at 00:00
  ('SN-WKA22', 'delivered', 300,  false, '2027-03-24 13:00'),
  ('SN-WKB22', 'delivered', 350,  false, '2027-03-29 00:00'),
  -- February: after 28 Feb 14:00, and the 1st at 00:00
  ('SN-FBA22', 'delivered', 1000, false, '2027-02-28 20:00'),
  ('SN-FBB22', 'delivered', 100,  false, '2027-02-01 00:00'),
  -- January's last second
  ('SN-JNA22', 'delivered', 700,  false, '2027-01-31 23:59:59'),
  -- a year ago: before and after 14:00 on 31 March
  ('SN-PYA22', 'delivered', 600,  false, '2026-03-31 13:00'),
  ('SN-PYB22', 'delivered', 50,   false, '2026-03-31 15:00'),
  -- the first real order
  ('SN-FST22', 'delivered', 200,  false, '2025-12-15 10:00')
) as f(code, status, amount, free_sample, at);

insert into public.order_lines (order_id, product_id, size, quantity)
select o.id, l.product_id, l.size, l.quantity
from (values
  ('SN-TDA22', 'raggi-jaggi', '500 g',  1),
  ('SN-TDA22', 'muesli',      'sample', 1),
  ('SN-TDB22', 'bites',       '250 g',  2),
  ('SN-TDC22', 'raggi-jaggi', '500 g',  2),
  ('SN-TDD22', 'raggi-jaggi', 'sample', 2),
  ('SN-YDA22', 'muesli',      '250 g',  2),
  ('SN-YDB22', 'muesli',      '250 g',  1),
  ('SN-WKA22', 'bites',       '250 g',  1),
  ('SN-WKB22', 'raggi-jaggi', '250 g',  1),
  ('SN-FBA22', 'raggi-jaggi', '250 g',  4),
  ('SN-FBB22', 'bites',       '250 g',  1),
  ('SN-JNA22', 'muesli',      '500 g',  1),
  ('SN-PYA22', 'raggi-jaggi', '500 g',  1),
  ('SN-PYB22', 'bites',       '250 g',  1),
  ('SN-FST22', 'muesli',      '250 g',  1)
) as l(code, product_id, size, quantity)
join public.orders o on o.code = l.code;

insert into public.order_payments (order_id, amount, method, note, paid_at)
select o.id, p.amount, p.method, p.note, pg_temp.ist(p.at)
from (values
  -- two parts today
  ('SN-TDA22', 300,  'upi',   null, '2027-03-31 10:00'),
  ('SN-TDA22', 200,  'cash',  null, '2027-03-31 13:00'),
  -- paid in full with no total
  ('SN-TDB22', null, 'cash',  null, '2027-03-31 00:45'),
  -- on the order that gets cancelled
  ('SN-TDC22', 900,  'upi',   null, '2027-03-31 11:00'),
  -- yesterday after 14:00
  ('SN-YDA22', 400,  'bank',  null, '2027-03-30 15:00'),
  -- February's order, paid on 1 March at 09:00
  ('SN-FBA22', 1000, 'other', 'By a friend', '2027-03-01 09:00')
) as p(code, amount, method, note, at)
join public.orders o on o.code = p.code;

update public.orders set status = 'cancelled' where code = 'SN-TDC22';

select set_config('test.m', pg_temp.m('2027-03-31 14:00')::text, true);

create function pg_temp.period(p text) returns jsonb language sql as $$
  select current_setting('test.m')::jsonb -> 'periods' -> p;
$$;

-- ─── 4. Today ───────────────────────────────────────────

select is(
  pg_temp.period('today') -> 'totals',
  '{"orders":2,"packs":3,"grams":1000,"sales":500,"with_total":1,"without_total":1,
    "samples":{"orders":2,"packs":3},
    "came_in":{"amount":500,"payments":3,"without_amount":1,
               "by_method":{"upi":300,"cash":200,"bank":0,"other":0,"not_recorded":0}}}'::jsonb,
  'today: real orders by India time; samples on their own; cancelled and free sample orders out; part payments each count'
);

select is(
  pg_temp.period('today') -> 'previous',
  jsonb_build_object(
    'starts_at', pg_temp.ist('2027-03-30 00:00'), 'ends_at', pg_temp.ist('2027-03-30 14:00'),
    'totals', '{"orders":1,"packs":2,"grams":500,"sales":400,"with_total":1,"without_total":0,
                "samples":{"orders":0,"packs":0},
                "came_in":{"amount":0,"payments":0,"without_amount":0,
                           "by_method":{"upi":0,"cash":0,"bank":0,"other":0,"not_recorded":0}}}'::jsonb),
  'today: compared with yesterday up to 14:00, so the order and payment after it are left out'
);

select is(
  jsonb_build_object('starts_at', pg_temp.period('today') -> 'starts_at', 'ends_at', pg_temp.period('today') -> 'ends_at'),
  jsonb_build_object('starts_at', pg_temp.ist('2027-03-31 00:00'), 'ends_at', pg_temp.ist('2027-03-31 14:00')),
  'today: from 00:00 India time to now'
);

select is(
  pg_temp.period('today') -> 'products',
  '[{"product_id":"bites","orders":1,"packs":2,"grams":500,"previous":{"orders":0,"packs":0,"grams":0}},
    {"product_id":"muesli","orders":0,"packs":0,"grams":0,"previous":{"orders":1,"packs":2,"grams":500}},
    {"product_id":"raggi-jaggi","orders":1,"packs":1,"grams":500,"previous":{"orders":0,"packs":0,"grams":0}}]'::jsonb,
  'today: per product packs and grams, samples left out; a product only sold yesterday still has its row'
);

select is(
  jsonb_build_object(
    'grain', pg_temp.period('today') #> '{chart,grain}',
    'now_index', pg_temp.period('today') #> '{chart,now_index}',
    'hours', (select jsonb_agg(b -> 'hour') from jsonb_array_elements(pg_temp.period('today') #> '{chart,current}') b),
    'dates', (select jsonb_agg(distinct b -> 'date') from jsonb_array_elements(pg_temp.period('today') #> '{chart,current}') b),
    'current', pg_temp.busy(pg_temp.period('today') #> '{chart,current}'),
    'previous', pg_temp.busy(pg_temp.period('today') #> '{chart,previous}')),
  jsonb_build_object(
    'grain', 'hour', 'now_index', 14,
    'hours', (select jsonb_agg(h) from generate_series(0, 23) h),
    'dates', '["2027-03-31"]'::jsonb,
    'current', '{"0":{"orders":1,"packs":2,"sales":0,"came_in":0},
                 "9":{"orders":1,"packs":1,"sales":500,"came_in":0},
                 "10":{"orders":0,"packs":0,"sales":0,"came_in":300},
                 "13":{"orders":0,"packs":0,"sales":0,"came_in":200}}'::jsonb,
    'previous', '{"10":{"orders":1,"packs":2,"sales":400,"came_in":0},
                  "15":{"orders":1,"packs":1,"sales":250,"came_in":400}}'::jsonb),
  'today: 24 India hours; the ghost is the whole of yesterday'
);

-- ─── 5. Week ────────────────────────────────────────────

select is(
  jsonb_build_object(
    'starts_at', pg_temp.period('week') -> 'starts_at',
    'orders', pg_temp.period('week') #> '{totals,orders}',
    'sales', pg_temp.period('week') #> '{totals,sales}',
    'previous', (pg_temp.period('week') -> 'previous') - 'totals',
    'previous_orders', pg_temp.period('week') #> '{previous,totals,orders}',
    'previous_sales', pg_temp.period('week') #> '{previous,totals,sales}',
    'now_index', pg_temp.period('week') #> '{chart,now_index}',
    'dates', (select jsonb_agg(b -> 'date') from jsonb_array_elements(pg_temp.period('week') #> '{chart,current}') b),
    'ghost_from', pg_temp.period('week') #> '{chart,previous,0,date}'),
  jsonb_build_object(
    'starts_at', pg_temp.ist('2027-03-29 00:00'), 'orders', 5, 'sales', 1500,
    'previous', jsonb_build_object('starts_at', pg_temp.ist('2027-03-22 00:00'), 'ends_at', pg_temp.ist('2027-03-24 14:00')),
    'previous_orders', 1, 'previous_sales', 300, 'now_index', 2,
    'dates', '["2027-03-29","2027-03-30","2027-03-31","2027-04-01","2027-04-02","2027-04-03","2027-04-04"]'::jsonb,
    'ghost_from', '2027-03-22'),
  'week: from Monday 00:00 (included), against last week up to Wednesday 14:00; Monday to Sunday'
);

-- ─── 6. Month, and the month end ────────────────────────

select is(
  jsonb_build_object(
    'orders', pg_temp.period('month') #> '{totals,orders}',
    'packs', pg_temp.period('month') #> '{totals,packs}',
    'sales', pg_temp.period('month') #> '{totals,sales}',
    'came_in', pg_temp.period('month') #> '{totals,came_in,amount}',
    'other', pg_temp.period('month') #> '{totals,came_in,by_method,other}',
    'previous', (pg_temp.period('month') -> 'previous') - 'totals',
    'previous_orders', pg_temp.period('month') #> '{previous,totals,orders}',
    'previous_sales', pg_temp.period('month') #> '{previous,totals,sales}',
    'buckets', jsonb_array_length(pg_temp.period('month') #> '{chart,current}'),
    'ghost_buckets', jsonb_array_length(pg_temp.period('month') #> '{chart,previous}'),
    'now_index', pg_temp.period('month') #> '{chart,now_index}'),
  jsonb_build_object(
    'orders', 6, 'packs', 8, 'sales', 1800, 'came_in', 1900, 'other', 1000,
    'previous', jsonb_build_object('starts_at', pg_temp.ist('2027-02-01 00:00'), 'ends_at', pg_temp.ist('2027-03-01 00:00')),
    'previous_orders', 2, 'previous_sales', 1100,
    'buckets', 31, 'ghost_buckets', 28, 'now_index', 30),
  'month on 31 March: February has no 31st, so it is the whole of February (not 28 Feb 14:00); money by when it came in'
);

select is(
  (select jsonb_build_object('previous', (m -> 'previous') - 'totals', 'orders', m #> '{previous,totals,orders}',
      'sales', m #> '{previous,totals,sales}')
   from (select pg_temp.m('2027-03-28 14:00') -> 'periods' -> 'month' as m) x),
  jsonb_build_object(
    'previous', jsonb_build_object('starts_at', pg_temp.ist('2027-02-01 00:00'), 'ends_at', pg_temp.ist('2027-02-28 14:00')),
    'orders', 1, 'sales', 100),
  'month on 28 March: the same day and time in February'
);

select is(
  (select (m -> 'previous') - 'totals' from (select pg_temp.m('2027-05-31 09:00') -> 'periods' -> 'month' as m) x),
  jsonb_build_object('starts_at', pg_temp.ist('2027-04-01 00:00'), 'ends_at', pg_temp.ist('2027-05-01 00:00')),
  'month on 31 May: the whole of April'
);

-- ─── 7. Year, and the leap day ──────────────────────────

select is(
  jsonb_build_object(
    'orders', pg_temp.period('year') #> '{totals,orders}',
    'sales', pg_temp.period('year') #> '{totals,sales}',
    'previous', (pg_temp.period('year') -> 'previous') - 'totals',
    'previous_orders', pg_temp.period('year') #> '{previous,totals,orders}',
    'previous_sales', pg_temp.period('year') #> '{previous,totals,sales}',
    'months', (select jsonb_agg(b -> 'date') from jsonb_array_elements(pg_temp.period('year') #> '{chart,current}') b),
    'now_index', pg_temp.period('year') #> '{chart,now_index}',
    'current', pg_temp.busy(pg_temp.period('year') #> '{chart,current}'),
    'previous_chart', pg_temp.busy(pg_temp.period('year') #> '{chart,previous}')),
  jsonb_build_object(
    'orders', 9, 'sales', 3600,
    'previous', jsonb_build_object('starts_at', pg_temp.ist('2026-01-01 00:00'), 'ends_at', pg_temp.ist('2026-03-31 14:00')),
    'previous_orders', 1, 'previous_sales', 600,
    'months', (select jsonb_agg(to_char(d, 'YYYY-MM-DD')) from generate_series('2027-01-01'::date, '2027-12-01', '1 month') d),
    'now_index', 2,
    'current', '{"0":{"orders":1,"packs":1,"sales":700,"came_in":0},
                 "1":{"orders":2,"packs":5,"sales":1100,"came_in":0},
                 "2":{"orders":6,"packs":8,"sales":1800,"came_in":1900}}'::jsonb,
    'previous_chart', '{"2":{"orders":2,"packs":2,"sales":650,"came_in":0}}'::jsonb),
  'year: against last year to 31 March 14:00; 12 months; the ghost is the whole of last year'
);

select is(
  (select jsonb_build_object('previous', (y -> 'previous') - 'totals', 'orders', y #> '{previous,totals,orders}',
      'sales', y #> '{previous,totals,sales}', 'came_in', y #> '{previous,totals,came_in,amount}')
   from (select pg_temp.m('2028-02-29 14:00') -> 'periods' -> 'year' as y) x),
  jsonb_build_object(
    'previous', jsonb_build_object('starts_at', pg_temp.ist('2027-01-01 00:00'), 'ends_at', pg_temp.ist('2027-03-01 00:00')),
    'orders', 3, 'sales', 1800, 'came_in', 0),
  'year on 29 Feb 2028: last year runs to the end of February 2027'
);

select is(
  (select jsonb_build_object('previous', (y -> 'previous') - 'totals', 'came_in', y #> '{previous,totals,came_in,amount}')
   from (select pg_temp.m('2028-03-01 10:00') -> 'periods' -> 'year' as y) x),
  jsonb_build_object(
    'previous', jsonb_build_object('starts_at', pg_temp.ist('2027-01-01 00:00'), 'ends_at', pg_temp.ist('2027-03-01 10:00')),
    'came_in', 1000),
  'year on 1 March 2028: last year to 1 March 2027 at 10:00'
);

-- ─── 8. Lifetime ────────────────────────────────────────

select is(
  jsonb_build_object(
    'starts_at', pg_temp.period('lifetime') -> 'starts_at',
    'first_order_at', current_setting('test.m')::jsonb -> 'first_order_at',
    'orders', pg_temp.period('lifetime') #> '{totals,orders}',
    'sales', pg_temp.period('lifetime') #> '{totals,sales}',
    'previous', pg_temp.period('lifetime') -> 'previous',
    'product_previous', (select jsonb_agg(distinct p -> 'previous') from jsonb_array_elements(pg_temp.period('lifetime') -> 'products') p),
    'grain', pg_temp.period('lifetime') #> '{chart,grain}',
    'first_bucket', pg_temp.period('lifetime') #> '{chart,current,0,date}',
    'buckets', jsonb_array_length(pg_temp.period('lifetime') #> '{chart,current}'),
    'now_index', pg_temp.period('lifetime') #> '{chart,now_index}',
    'ghost', pg_temp.period('lifetime') #> '{chart,previous}'),
  jsonb_build_object(
    'starts_at', pg_temp.ist('2025-12-15 10:00'), 'first_order_at', pg_temp.ist('2025-12-15 10:00'),
    'orders', 12, 'sales', 4450, 'previous', null, 'product_previous', '[null]'::jsonb,
    'grain', 'month', 'first_bucket', '2025-12-01', 'buckets', 16, 'now_index', 15, 'ghost', null),
  'lifetime: everything since the first order, by month past 26 weeks, never compared'
);

select is(
  (select jsonb_build_object('grain', l #> '{chart,grain}', 'now_index', l #> '{chart,now_index}',
      'dates', (select jsonb_agg(b -> 'date') from jsonb_array_elements(l #> '{chart,current}') b),
      'first', l #> '{chart,current,0,orders}')
   from (select pg_temp.m('2026-01-10 12:00') -> 'periods' -> 'lifetime' as l) x),
  '{"grain":"week","now_index":3,"dates":["2025-12-15","2025-12-22","2025-12-29","2026-01-05"],"first":1}'::jsonb,
  'lifetime in its first 26 weeks: by week, Mondays, from the first order''s week'
);

-- ─── 9. When there's no comparison ──────────────────────

select is(
  (select jsonb_object_agg(p.key, jsonb_build_object(
      'previous', p.value -> 'previous' is not null and p.value -> 'previous' <> 'null'::jsonb,
      'ghost', p.value #> '{chart,previous}' <> 'null'::jsonb))
   from jsonb_each(pg_temp.m('2026-01-10 12:00') -> 'periods') p),
  '{"today":{"previous":true,"ghost":true},"week":{"previous":true,"ghost":true},
    "month":{"previous":false,"ghost":false},"year":{"previous":false,"ghost":false},
    "lifetime":{"previous":false,"ghost":false}}'::jsonb,
  'first order on 15 Dec 2025, on 10 Jan 2026: today and week compare; December and 2025 started before it, so month and year don''t'
);

select is(
  (select jsonb_object_agg(x.at, jsonb_build_object('month', m #> '{periods,month,previous}' <> 'null'::jsonb,
      'year', m #> '{periods,year,previous}' <> 'null'::jsonb))
   from (select at, pg_temp.m(at) as m from unnest(array['2026-06-10 12:00', '2027-01-10 12:00']) at) x),
  '{"2026-06-10 12:00":{"month":true,"year":false},"2027-01-10 12:00":{"month":true,"year":true}}'::jsonb,
  'year compares only once last year began after the first order: not in 2026, yes in 2027'
);

-- ─── 10. Everything adds up ─────────────────────────────

select is(
  (select jsonb_object_agg(p.key, (
      select jsonb_build_object('orders', sum((b ->> 'orders')::int), 'packs', sum((b ->> 'packs')::int),
        'sales', sum((b ->> 'sales')::int), 'came_in', sum((b ->> 'came_in')::int))
      from jsonb_array_elements(p.value #> '{chart,current}') b))
   from jsonb_each(current_setting('test.m')::jsonb -> 'periods') p),
  (select jsonb_object_agg(p.key, jsonb_build_object('orders', p.value #> '{totals,orders}',
      'packs', p.value #> '{totals,packs}', 'sales', p.value #> '{totals,sales}',
      'came_in', p.value #> '{totals,came_in,amount}'))
   from jsonb_each(current_setting('test.m')::jsonb -> 'periods') p),
  'every period: the chart buckets add up to the totals'
);

select is(
  (select jsonb_object_agg(p.key, jsonb_build_object(
      'packs', (select sum((x ->> 'packs')::int) from jsonb_array_elements(p.value -> 'products') x),
      'grams', (select sum((x ->> 'grams')::int) from jsonb_array_elements(p.value -> 'products') x),
      'with_without', (p.value #>> '{totals,with_total}')::int + (p.value #>> '{totals,without_total}')::int,
      'by_method', (select sum(v::int) from jsonb_each_text(p.value #> '{totals,came_in,by_method}') m(k, v))))
   from jsonb_each(current_setting('test.m')::jsonb -> 'periods') p),
  (select jsonb_object_agg(p.key, jsonb_build_object(
      'packs', (p.value #>> '{totals,packs}')::int, 'grams', (p.value #>> '{totals,grams}')::int,
      'with_without', (p.value #>> '{totals,orders}')::int,
      'by_method', (p.value #>> '{totals,came_in,amount}')::int))
   from jsonb_each(current_setting('test.m')::jsonb -> 'periods') p),
  'every period: products add up to packs and grams, with + without a total is orders, methods add up to came in'
);

-- ─── 11. The RPC is the same as the pinned function ────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.live', public.get_admin_metrics()::text, true);
reset role;

select is(
  (current_setting('test.live')::jsonb) - 'as_of',
  public.admin_metrics_json(now())::jsonb - 'as_of',
  'get_admin_metrics() is admin_metrics_json(now())'
);

select is(
  current_setting('test.live')::jsonb #> '{periods,lifetime,totals,orders}',
  '12'::jsonb,
  'the RPC sees the same orders (lifetime 12)'
);

select * from finish();
rollback;
