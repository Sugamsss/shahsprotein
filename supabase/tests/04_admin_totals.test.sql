-- 20260926000006: get_admin_totals(), the totals at the top of the admin
-- Home. Who can call it, zeros on an empty database, the "right now"
-- numbers, which statuses a period counts, sizes, the week's days, and where
-- each period starts (India time). Test data is fake (9198000000xx,
-- example.com) and everything rolls back at the end.
--
-- The period tests never depend on today's date: each one places a pair of
-- orders on that period's own start, so they hold on a Monday, on the 1st and
-- just after midnight IST alike.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- The shared local stack may hold other people's test data. Start from
-- empty tables; the rollback at the end puts everything back.
delete from public.orders;
delete from public.order_rate_limits;
delete from public.admin_users;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

-- ─── 1. Who can call it ─────────────────────────────────

set local role anon;
select throws_ok('select public.get_admin_totals()', '42501', null, 'anon cannot call get_admin_totals');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok('select public.get_admin_totals()', 'P0001', 'Unauthorized', 'non-admin: get_admin_totals');
reset role;

select ok(
  not has_function_privilege('public', 'public.get_admin_totals()', 'execute'),
  'PUBLIC has no execute on get_admin_totals'
);

-- ─── 2. An empty database gives zeros ───────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.empty', public.get_admin_totals()::text, true);
reset role;

select is(
  current_setting('test.empty')::jsonb -> 'now',
  '{"pending":0,"to_confirm":0,"to_send":0,"on_the_way":0,"packs_to_send":0,
    "packs_to_send_by_size":[],"to_collect":{"amount":0,"orders":0,"without_amount":0}}'::jsonb,
  'empty: right now is all zeros'
);

select is(
  (select jsonb_object_agg(p.key, p.value - array['starts_on', 'days'])
   from jsonb_each(current_setting('test.empty')::jsonb -> 'periods') p),
  (select jsonb_object_agg(k, '{"orders":0,"packs":0,"packs_by_size":[],"earned":0,
                               "paid_orders":0,"paid_without_amount":0}'::jsonb)
   from unnest(array['today', 'week', 'month', 'all']) k),
  'empty: every period is zeros and an empty size list'
);

-- Where each period starts, from plain date_trunc on India time.
select is(
  (select jsonb_object_agg(p.key, p.value -> 'starts_on')
   from jsonb_each(current_setting('test.empty')::jsonb -> 'periods') p),
  jsonb_build_object(
    'today', date_trunc('day', now() at time zone 'Asia/Kolkata')::date,
    'week', date_trunc('week', now() at time zone 'Asia/Kolkata')::date,
    'month', date_trunc('month', now() at time zone 'Asia/Kolkata')::date,
    'all', null
  ),
  'starts_on: today, Monday and the 1st in India time; null for all time'
);

select is(
  current_setting('test.empty')::jsonb #> '{periods,week,days}',
  (select jsonb_agg(jsonb_build_object(
      'date', date_trunc('week', now() at time zone 'Asia/Kolkata')::date + i,
      'orders', 0, 'packs', 0) order by i)
   from generate_series(0, 6) i),
  'empty: the week has 7 zero days, Monday to Sunday'
);

-- ─── 3. Right now, and which orders a period counts ─────

-- All saved now (inside every period). Orders that must not count carry 9
-- packs of a size, so a leak shows in the numbers.
insert into public.orders (code, source, status, name, pincode, phone, amount, paid_at, created_at) values
  ('SN-NEWAA', 'site',      'new',       'New Example',   '415001', null, 200,  now(), now()),
  ('SN-STXAA', 'site',      'new',       'Stale Example', '415001', null, null, null,  now()),
  ('SN-HNDAA', 'whatsapp',  'new',       null,            null, '919800000041', null, null, now()),
  ('SN-CNFAA', 'site',      'confirmed', 'Conf Example',  '415001', null, null, null,  now()),
  ('SN-CNFBB', 'call',      'confirmed', null,            null, '919800000042', null, null, now()),
  ('SN-SNTAA', 'instagram', 'sent',      'Sent Example',  null,     null, null, now(), now()),
  ('SN-DVRAA', 'site',      'delivered', 'Dlv Example',   '415001', null, 600,  null,  now()),
  ('SN-DVRBB', 'site',      'delivered', 'Dlv Example',   '415001', null, 400,  null,  now()),
  ('SN-DVRCC', 'in_person', 'delivered', 'Dlv Example',   null,     null, null, null,  now()),
  ('SN-DVRDD', 'site',      'delivered', 'Paid Example',  '415001', null, 900,  now(), now()),
  ('SN-CANAA', 'site',      'cancelled', 'Cancel Example', '415001', null, 700, now(), now());

-- New for 3 days: the site one is stale, the WhatsApp one is not.
update public.orders set status_changed_at = now() - interval '3 days'
where code in ('SN-STXAA', 'SN-HNDAA');

insert into public.order_lines (order_id, product_id, size, quantity)
select o.id, l.product_id, l.size, l.quantity
from (values
  ('SN-NEWAA', 'muesli',       '250 g', 9),
  ('SN-STXAA', 'muesli',       '250 g', 9),
  ('SN-HNDAA', 'muesli',       '250 g', 9),
  ('SN-CNFAA', 'raggi-jaggi',  '250 g', 2),
  ('SN-CNFAA', 'muesli',       '500 g', 1),
  -- No space and a kilo size: still grouped and sorted by weight.
  ('SN-CNFBB', 'raggi-jaggi',  '250g',  1),
  ('SN-CNFBB', 'muesli',       '1 kg',  1),
  ('SN-SNTAA', 'muesli',       '500 g', 4),
  ('SN-DVRAA', 'date-bites',   '250 g', 1),
  ('SN-DVRBB', 'muesli',       '500 g', 1),
  ('SN-DVRCC', 'raggi-jaggi',  '250 g', 1),
  ('SN-DVRDD', 'muesli',       '500 g', 2),
  ('SN-CANAA', 'muesli',       '500 g', 9)
) as l(code, product_id, size, quantity)
join public.orders o on o.code = l.code;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.totals', public.get_admin_totals()::text, true);
reset role;

select is(
  (current_setting('test.totals')::jsonb -> 'now')
    - array['packs_to_send', 'packs_to_send_by_size', 'to_collect'],
  '{"pending":5,"to_confirm":2,"to_send":2,"on_the_way":1}'::jsonb,
  'now: pending is to confirm + to send + on the way; stale, delivered and cancelled are left out'
);

select is(
  jsonb_build_object(
    'packs', current_setting('test.totals')::jsonb #> '{now,packs_to_send}',
    'by_size', current_setting('test.totals')::jsonb #> '{now,packs_to_send_by_size}'),
  '{"packs":5,"by_size":[{"size":"250 g","packs":3},{"size":"500 g","packs":1},{"size":"1 kg","packs":1}]}'::jsonb,
  'now: packs to send counts only confirmed orders, by size'
);

select is(
  current_setting('test.totals')::jsonb #> '{now,to_collect}',
  '{"amount":1000,"orders":3,"without_amount":1}'::jsonb,
  'now: to collect is delivered and not paid, with the ones missing an amount'
);

select is(
  (current_setting('test.totals')::jsonb #> '{periods,all}') - array['starts_on', 'packs_by_size', 'earned', 'paid_orders', 'paid_without_amount'],
  '{"orders":7,"packs":14}'::jsonb,
  'all time: confirmed, sent and delivered count; new, stale and cancelled do not'
);

select is(
  current_setting('test.totals')::jsonb #> '{periods,all,packs_by_size}',
  '[{"size":"250 g","packs":5},{"size":"500 g","packs":8},{"size":"1 kg","packs":1}]'::jsonb,
  'all time: packs by size, lightest first, 250g and 250 g as one'
);

select is(
  jsonb_build_object(
    'earned', current_setting('test.totals')::jsonb #> '{periods,all,earned}',
    'paid_orders', current_setting('test.totals')::jsonb #> '{periods,all,paid_orders}',
    'paid_without_amount', current_setting('test.totals')::jsonb #> '{periods,all,paid_without_amount}'),
  '{"earned":1100,"paid_orders":3,"paid_without_amount":1}'::jsonb,
  'all time: earned counts paid orders of any status but cancelled'
);

select is(
  (current_setting('test.totals')::jsonb #> '{periods,today}') - 'starts_on',
  (current_setting('test.totals')::jsonb #> '{periods,all}') - 'starts_on',
  'today: everything saved and paid just now is in it'
);

select is(
  jsonb_build_object(
    'orders', (select sum((d ->> 'orders')::int) from jsonb_array_elements(current_setting('test.totals')::jsonb #> '{periods,week,days}') d),
    'packs', (select sum((d ->> 'packs')::int) from jsonb_array_elements(current_setting('test.totals')::jsonb #> '{periods,week,days}') d)),
  jsonb_build_object(
    'orders', current_setting('test.totals')::jsonb #> '{periods,week,orders}',
    'packs', current_setting('test.totals')::jsonb #> '{periods,week,packs}'),
  'week: the days add up to the week''s orders and packs'
);

select is(
  (select jsonb_agg(d -> 'date' order by n)
   from jsonb_array_elements(current_setting('test.totals')::jsonb #> '{periods,week,days}') with ordinality as x(d, n)),
  (select jsonb_agg(to_jsonb(date_trunc('week', now() at time zone 'Asia/Kolkata')::date + i) order by i)
   from generate_series(0, 6) i),
  'week: days run Monday to Sunday, India time'
);

-- ─── 4. Where each period starts ────────────────────────

-- For one period, clears the orders and adds four around its IST start:
--   SN-NCRAT  confirmed, created at the start           (3 packs, not paid)
--   SN-XCRAT  confirmed, created 1 µs before the start  (5 packs, not paid)
--   SN-NPAYT  new, created long ago, paid at the start          (₹30)
--   SN-XPAYT  new, created long ago, paid 1 µs before the start (₹50)
-- and returns that period's totals plus all time's. Runs as the test user
-- with the admin's claims (get_admin_totals only checks is_admin()).
create function pg_temp.around_start(p_unit text, p_key text)
returns jsonb
language plpgsql
as $$
declare
  v_start timestamptz := date_trunc(p_unit, now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_totals jsonb;
begin
  delete from public.orders;

  insert into public.orders (code, source, status, phone, amount, paid_at, created_at) values
    ('SN-NCRAT', 'whatsapp', 'confirmed', '919800000051', null, null, v_start),
    ('SN-XCRAT', 'whatsapp', 'confirmed', '919800000052', null, null, v_start - interval '1 microsecond'),
    ('SN-NPAYT', 'whatsapp', 'new',       '919800000053', 30, v_start, '2020-01-01'),
    ('SN-XPAYT', 'whatsapp', 'new',       '919800000054', 50, v_start - interval '1 microsecond', '2020-01-01');

  insert into public.order_lines (order_id, product_id, size, quantity)
  select o.id, 'muesli', '250 g', case o.code when 'SN-NCRAT' then 3 else 5 end
  from public.orders o where o.code in ('SN-NCRAT', 'SN-XCRAT');

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  v_totals := public.get_admin_totals()::jsonb;

  return jsonb_build_object(
    'period', (v_totals #> array['periods', p_key]) - array['starts_on', 'packs_by_size', 'days'],
    'all', (v_totals #> '{periods,all}') - array['starts_on', 'packs_by_size']
  );
end;
$$;

-- In: SN-NCRAT (3 packs) and SN-NPAYT (₹30). Out: the two 1 µs earlier.
select is(
  pg_temp.around_start('day', 'today') -> 'period',
  '{"orders":1,"packs":3,"earned":30,"paid_orders":1,"paid_without_amount":0}'::jsonb,
  'today: created or paid at IST midnight is in; a microsecond before is out'
);

select is(
  pg_temp.around_start('week', 'week') -> 'period',
  '{"orders":1,"packs":3,"earned":30,"paid_orders":1,"paid_without_amount":0}'::jsonb,
  'week: created or paid at Monday 00:00 IST is in; a microsecond before is out'
);

select is(
  pg_temp.around_start('month', 'month') -> 'period',
  '{"orders":1,"packs":3,"earned":30,"paid_orders":1,"paid_without_amount":0}'::jsonb,
  'month: created or paid at 00:00 IST on the 1st is in; a microsecond before is out'
);

select is(
  pg_temp.around_start('month', 'all') -> 'all',
  '{"orders":2,"packs":8,"earned":80,"paid_orders":2,"paid_without_amount":0}'::jsonb,
  'all time: no start, so both sides of every boundary count'
);

select * from finish();
rollback;
