-- 20260926000006: get_admin_totals() for the per-product Home,
-- get_admin_orders(p_product), and admin_users.home_view. Who can call them, zeros on an empty
-- database, every stage per product and overall, weights, money, the week
-- boundaries, and the product filter. Test data is fake (9198000000xx,
-- example.com) and everything rolls back at the end.
--
-- Nothing here depends on today's date: fixtures are placed microseconds
-- apart from now, or on each week's own start, so the tests hold on a
-- Monday, on the 1st and just after midnight IST alike.

begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

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

-- ─── 1. Who can call them, and the signatures ──────────

set local role anon;
select throws_ok('select public.get_admin_totals()', '42501', null, 'anon cannot call get_admin_totals');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok('select public.get_admin_totals()', 'P0001', 'Unauthorized', 'non-admin: get_admin_totals');
select throws_ok($$select public.get_admin_orders(p_product => 'muesli')$$, 'P0001', 'Unauthorized',
  'non-admin: get_admin_orders with p_product');
reset role;

select ok(
  not has_function_privilege('public', 'public.get_admin_totals()', 'execute')
  and not has_function_privilege('anon',
    'public.get_admin_orders(text,text[],boolean,text,text,text,timestamptz,timestamptz,timestamptz,integer,text)', 'execute')
  and has_function_privilege('authenticated',
    'public.get_admin_orders(text,text[],boolean,text,text,text,timestamptz,timestamptz,timestamptz,integer,text)', 'execute'),
  'grants: PUBLIC cannot run get_admin_totals; get_admin_orders is authenticated only'
);

select is(
  (select array_agg(p.oid::regprocedure::text) from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'get_admin_orders'),
  array['get_admin_orders(text,text[],boolean,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,text)'],
  'get_admin_orders has one signature, with p_product; the old 10-argument one is gone'
);

-- ─── 2. An empty database gives zeros ───────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.empty', public.get_admin_totals()::text, true);
reset role;

select is(current_setting('test.empty')::jsonb -> 'products', '[]'::jsonb, 'empty: no products');

select is(
  current_setting('test.empty')::jsonb -> 'overall',
  '{
    "to_confirm": {"orders":0,"packs":0,"amount":0,"without_amount":0,"paid":0,"unpaid_amount":0},
    "to_send":    {"orders":0,"packs":0,"amount":0,"without_amount":0,"paid":0,"unpaid_amount":0},
    "on_the_way": {"orders":0,"packs":0,"amount":0,"without_amount":0,"paid":0,"unpaid_amount":0,"unpaid_names":[]},
    "to_collect": {"orders":0,"packs":0,"amount":0,"without_amount":0,"paid":0,"unpaid_amount":0,"without_amount_names":[]},
    "stale":      {"orders":0,"packs":0}
  }'::jsonb,
  'empty: every overall stage is zeros, the name lists are empty, and stale has no money keys'
);

select is(
  current_setting('test.empty')::jsonb -> 'first_order_at',
  'null'::jsonb,
  'empty: first_order_at is null'
);

select is(
  (select jsonb_object_agg(w.key, w.value - array['starts_at', 'ends_at', 'days', 'by_product', 'amount_by_method'])
   from jsonb_each(current_setting('test.empty')::jsonb -> 'weeks') w),
  (select jsonb_object_agg(k, '{"orders":0,"packs":0,"amount_in":0,"paid_orders":0,"paid_without_amount":0}'::jsonb)
   from unnest(array['this', 'last', 'last_so_far']) k),
  'empty: every week is zeros'
);

select is(
  jsonb_build_object(
    'this', current_setting('test.empty')::jsonb #> '{weeks,this,days}',
    'last', current_setting('test.empty')::jsonb #> '{weeks,last,days}'),
  jsonb_build_object(
    'this', (select jsonb_agg(jsonb_build_object(
        'date', date_trunc('week', now() at time zone 'Asia/Kolkata')::date + i,
        'orders', 0, 'packs', 0) order by i)
      from generate_series(0, 6) i),
    'last', (select jsonb_agg(jsonb_build_object(
        'date', date_trunc('week', now() at time zone 'Asia/Kolkata')::date - 7 + i,
        'orders', 0, 'packs', 0) order by i)
      from generate_series(0, 6) i)),
  'empty: this week and last week each have 7 zero days, Monday to Sunday IST'
);

select is(
  jsonb_build_object(
    'this', current_setting('test.empty')::jsonb #> '{weeks,this,by_product}',
    'last_so_far', current_setting('test.empty')::jsonb #> '{weeks,last_so_far,by_product}',
    'last_has_by_product', (current_setting('test.empty')::jsonb -> 'weeks' -> 'last') ? 'by_product',
    'last_so_far_has_days', (current_setting('test.empty')::jsonb -> 'weeks' -> 'last_so_far') ? 'days'),
  '{"this":[],"last_so_far":[],"last_has_by_product":false,"last_so_far_has_days":false}'::jsonb,
  'empty: by_product is [] on this and last_so_far; last has no by_product, last_so_far no days'
);

-- Where each week starts and ends, from plain date_trunc on India time.
select is(
  (select jsonb_object_agg(w.key, jsonb_build_object(
      'starts_at', (w.value ->> 'starts_at')::timestamptz,
      'ends_at', (w.value ->> 'ends_at')::timestamptz))
   from jsonb_each(current_setting('test.empty')::jsonb -> 'weeks') w)::text,
  jsonb_build_object(
    'this', jsonb_build_object(
      'starts_at', date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata',
      'ends_at', now()),
    'last', jsonb_build_object(
      'starts_at', (date_trunc('week', now() at time zone 'Asia/Kolkata') - interval '7 days') at time zone 'Asia/Kolkata',
      'ends_at', date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
    'last_so_far', jsonb_build_object(
      'starts_at', (date_trunc('week', now() at time zone 'Asia/Kolkata') - interval '7 days') at time zone 'Asia/Kolkata',
      'ends_at', now() - interval '7 days')
  )::text,
  'weeks: this from Monday 00:00 IST to now, last is the whole week before, last_so_far ends 7 days ago'
);

-- ─── 3. Stages, per product and overall ─────────────────

-- Created a few microseconds apart, newest first in the list below.
insert into public.orders (code, source, status, name, pincode, phone, amount, paid_at, created_at) values
  -- to_confirm
  ('SN-NEW22', 'site',      'new',       'Asha Example',  '415001', null, 300,  null,  now() - interval '1 microsecond'),
  -- stale: New for 3 days (set below), must not be in to_confirm
  ('SN-STX22', 'site',      'new',       'Stale Example', '415001', null, null, null,  now() - interval '2 microseconds'),
  -- to_send, mixed: two products, two sizes and a kilo; paid before delivery
  ('SN-MXD22', 'whatsapp',  'confirmed', 'Mixed Example', null, '919800000061', 800, now(), now() - interval '3 microseconds'),
  -- to_send, no amount yet; '250g' with no space
  ('SN-CNF22', 'call',      'confirmed', 'Conf Example',  null, '919800000062', null, null, now() - interval '4 microseconds'),
  -- on_the_way
  ('SN-SNT22', 'instagram', 'sent',      'Sent Example',  null, null, 500,  null,  now() - interval '5 microseconds'),
  -- to_collect, one with an amount and one without
  ('SN-DVR22', 'site',      'delivered', 'Owed Example',  '415001', null, 600, null, now() - interval '6 microseconds'),
  ('SN-DVR33', 'in_person', 'delivered', 'Owed Example',  null, null, null, null,  now() - interval '7 microseconds'),
  -- done (delivered and paid) and cancelled: in no stage
  ('SN-DNE22', 'site',      'delivered', 'Done Example',  '415001', null, 900, now(), now() - interval '8 microseconds'),
  ('SN-CXN22', 'site',      'cancelled', 'Cancel Example', '415001', null, 700, now(), now() - interval '9 microseconds');

update public.orders set status_changed_at = now() - interval '3 days' where code = 'SN-STX22';

insert into public.order_lines (order_id, product_id, size, quantity)
select o.id, l.product_id, l.size, l.quantity
from (values
  ('SN-NEW22', 'raggi-jaggi', '250 g', 2),
  ('SN-STX22', 'raggi-jaggi', '500 g', 9),
  ('SN-MXD22', 'raggi-jaggi', '250 g', 2),
  ('SN-MXD22', 'raggi-jaggi', '500 g', 1),
  ('SN-MXD22', 'muesli',      '1 kg',  1),
  ('SN-CNF22', 'raggi-jaggi', '250g',  1),
  ('SN-SNT22', 'muesli',      '500 g', 2),
  ('SN-DVR22', 'date-bites',  '250 g', 3),
  ('SN-DVR33', 'date-bites',  '250 g', 1),
  ('SN-DNE22', 'muesli',      '250 g', 9),
  ('SN-CXN22', 'muesli',      '500 g', 9)
) as l(code, product_id, size, quantity)
join public.orders o on o.code = l.code;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.totals', public.get_admin_totals()::text, true);
reset role;

create function pg_temp.product(p_id text) returns jsonb language sql as $$
  select p -> 'stages'
  from jsonb_array_elements(current_setting('test.totals')::jsonb -> 'products') p
  where p ->> 'product_id' = p_id
$$;

select is(
  (select jsonb_agg(p -> 'product_id') from jsonb_array_elements(current_setting('test.totals')::jsonb -> 'products') p),
  '["date-bites","muesli","raggi-jaggi"]'::jsonb,
  'products: every product with lines in a stage, by id'
);

select is(
  pg_temp.product('raggi-jaggi'),
  '{
    "to_confirm": {"orders":1,"packs":2,"grams":500,"by_size":[{"size":"250 g","grams_each":250,"packs":2}]},
    "to_send":    {"orders":2,"packs":4,"grams":1250,"by_size":[{"size":"250 g","grams_each":250,"packs":3},
                                                                {"size":"500 g","grams_each":500,"packs":1}]},
    "on_the_way": {"orders":0,"packs":0,"grams":0,"by_size":[]},
    "to_collect": {"orders":0,"packs":0,"grams":0,"by_size":[]},
    "stale":      {"orders":1,"packs":9,"grams":4500,"by_size":[{"size":"500 g","grams_each":500,"packs":9}]}
  }'::jsonb,
  'raggi-jaggi: the stale order is only in stale; 250g and 250 g are one size; grams add up'
);

select is(
  pg_temp.product('muesli'),
  '{
    "to_confirm": {"orders":0,"packs":0,"grams":0,"by_size":[]},
    "to_send":    {"orders":1,"packs":1,"grams":1000,"by_size":[{"size":"1 kg","grams_each":1000,"packs":1}]},
    "on_the_way": {"orders":1,"packs":2,"grams":1000,"by_size":[{"size":"500 g","grams_each":500,"packs":2}]},
    "to_collect": {"orders":0,"packs":0,"grams":0,"by_size":[]},
    "stale":      {"orders":0,"packs":0,"grams":0,"by_size":[]}
  }'::jsonb,
  'muesli: the mixed order counts once here too, with its kilo; done and cancelled are in no stage'
);

select is(
  pg_temp.product('date-bites'),
  '{
    "to_confirm": {"orders":0,"packs":0,"grams":0,"by_size":[]},
    "to_send":    {"orders":0,"packs":0,"grams":0,"by_size":[]},
    "on_the_way": {"orders":0,"packs":0,"grams":0,"by_size":[]},
    "to_collect": {"orders":2,"packs":4,"grams":1000,"by_size":[{"size":"250 g","grams_each":250,"packs":4}]},
    "stale":      {"orders":0,"packs":0,"grams":0,"by_size":[]}
  }'::jsonb,
  'date-bites: delivered and not paid is to collect'
);

select is(
  current_setting('test.totals')::jsonb -> 'overall',
  '{
    "to_confirm": {"orders":1,"packs":2,"amount":300,"without_amount":0,"paid":0,"unpaid_amount":300},
    "to_send":    {"orders":2,"packs":5,"amount":800,"without_amount":1,"paid":1,"unpaid_amount":0},
    "on_the_way": {"orders":1,"packs":2,"amount":500,"without_amount":0,"paid":0,"unpaid_amount":500,
                   "unpaid_names":["Sent"]},
    "to_collect": {"orders":2,"packs":4,"amount":600,"without_amount":1,"paid":0,"unpaid_amount":600,
                   "without_amount_names":["Owed"]},
    "stale":      {"orders":1,"packs":9}
  }'::jsonb,
  'overall: orders, packs, amount, without amount, paid and unpaid amount per stage; no money on stale'
);

select ok(
  (current_setting('test.totals')::jsonb ->> 'first_order_at')::timestamptz = now() - interval '8 microseconds',
  'first_order_at is the earliest real order (the done one), not the older-looking new or cancelled ones'
);

select is(
  jsonb_build_object(
    'this', current_setting('test.totals')::jsonb #> '{weeks,this,by_product}',
    'last_so_far', current_setting('test.totals')::jsonb #> '{weeks,last_so_far,by_product}'),
  '{"this":[{"product_id":"date-bites","packs":4,"orders":2},
            {"product_id":"muesli","packs":12,"orders":3},
            {"product_id":"raggi-jaggi","packs":4,"orders":2}],
    "last_so_far":[]}'::jsonb,
  'by_product: packs and orders per product in real orders; the mixed order counts for both products'
);

select is(
  (current_setting('test.totals')::jsonb #> '{weeks,this}') - array['starts_at', 'ends_at', 'days', 'by_product', 'amount_by_method'],
  '{"orders":6,"packs":20,"amount_in":1700,"paid_orders":2,"paid_without_amount":0}'::jsonb,
  'this week: real orders only (not new, stale or cancelled); money in skips the cancelled order'
);

select is(
  (select jsonb_build_object('orders', sum((d ->> 'orders')::int), 'packs', sum((d ->> 'packs')::int))
   from jsonb_array_elements(current_setting('test.totals')::jsonb #> '{weeks,this,days}') d),
  jsonb_build_object(
    'orders', current_setting('test.totals')::jsonb #> '{weeks,this,orders}',
    'packs', current_setting('test.totals')::jsonb #> '{weeks,this,packs}'),
  'this week: the days add up to the week'
);

-- ─── 4. get_admin_orders(p_product) ─────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

create function pg_temp.codes(p json) returns text[] language sql as $$
  select coalesce(array_agg(o ->> 'code' order by n), '{}') from json_array_elements(p -> 'orders') with ordinality as t(o, n)
$$;

select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_product => 'muesli')),
  array['SN-MXD22', 'SN-SNT22', 'SN-DNE22', 'SN-CXN22'],
  'p_product: every order with muesli, any size, newest first');
select is(pg_temp.codes(public.get_admin_orders(p_product => 'muesli')),
  array['SN-MXD22', 'SN-SNT22'], 'p_product with the todo view');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'done', p_product => 'muesli')),
  array['SN-DNE22', 'SN-CXN22'], 'p_product with the done view');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_product => 'raggi-jaggi', p_search => 'example')),
  array['SN-NEW22', 'SN-STX22', 'SN-MXD22', 'SN-CNF22'], 'p_product with a name search');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_product => 'date-bites', p_search => 'MXD22')),
  '{}'::text[], 'p_product and search must both match');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_product => 'saffron')),
  '{}'::text[], 'an unknown product matches nothing');

select set_config('test.page1', public.get_admin_orders(p_view => 'all', p_product => 'muesli', p_limit => 2)::text, true);
select is(
  pg_temp.codes(current_setting('test.page1')::json)
    || pg_temp.codes(public.get_admin_orders(p_view => 'all', p_product => 'muesli', p_limit => 2,
         p_before => (current_setting('test.page1')::json ->> 'next_before')::timestamptz)),
  array['SN-MXD22', 'SN-SNT22', 'SN-DNE22', 'SN-CXN22'],
  'p_product pages with next_before and loses nothing'
);
select ok(
  public.get_admin_orders(p_view => 'all', p_product => 'muesli', p_limit => 2,
    p_before => (current_setting('test.page1')::json ->> 'next_before')::timestamptz) ->> 'next_before' is null,
  'p_product: the last page has no next_before'
);

reset role;

-- ─── 5. Who the waiting stages name ─────────────────────

delete from public.orders;
insert into public.orders (code, source, status, name, pincode, phone, amount, paid_at, created_at) values
  -- Delivered, not paid, no total: six, one with no name and a second
  -- "tanvi". Delivered in a different order from created (set below).
  ('SN-NMA22', 'site',     'delivered', 'Tanvi Example',  '415001', null, null, null, now() - interval '9 microseconds'),
  ('SN-NMB22', 'call',     'delivered', null,             null, '919800000091', null, null, now() - interval '8 microseconds'),
  ('SN-NMC22', 'site',     'delivered', 'Farah Q Example', '415001', null, null, null, now() - interval '7 microseconds'),
  ('SN-NMD22', 'site',     'delivered', 'Meera',          '415001', null, null, null, now() - interval '6 microseconds'),
  ('SN-NME22', 'site',     'delivered', 'Kiran Example',  '415001', null, null, null, now() - interval '5 microseconds'),
  ('SN-NMK22', 'site',     'delivered', 'tanvi Other',    '415001', null, null, null, now() - interval '12 microseconds'),
  -- Delivered, not paid, with a total: not named.
  ('SN-NMF22', 'site',     'delivered', 'Zara Example',   '415001', null, 100,  null, now() - interval '10 microseconds'),
  -- Sent: three not paid (Neha twice), one paid.
  ('SN-NMG22', 'site',     'sent',      'Neha Example',   '415001', null, null, null,  now() - interval '4 microseconds'),
  ('SN-NMH22', 'site',     'sent',      'Asha Example',   '415001', null, null, now(), now() - interval '11 microseconds'),
  ('SN-NMJ22', 'site',     'sent',      'Ravi Example',   '415001', null, null, null,  now() - interval '3 microseconds'),
  ('SN-NMM22', 'site',     'sent',      'Neha Other',     '415001', null, null, null,  now() - interval '2 microseconds');

-- When each was delivered or sent. to_collect names follow delivery;
-- on_the_way names follow created_at, so Ravi's earlier send doesn't move him.
update public.orders o set status_changed_at = now() - d.ago
from (values
  ('SN-NMD22', interval '7 days'), ('SN-NMB22', interval '6 days'), ('SN-NMA22', interval '5 days'),
  ('SN-NMK22', interval '4 days'), ('SN-NMC22', interval '2 days'), ('SN-NME22', interval '1 day'),
  ('SN-NMJ22', interval '3 days'), ('SN-NMG22', interval '1 day')
) as d(code, ago)
where o.code = d.code;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.names', public.get_admin_totals()::text, true);
reset role;

select is(
  jsonb_build_object(
    'to_collect', current_setting('test.names')::jsonb #> '{overall,to_collect}',
    'on_the_way', current_setting('test.names')::jsonb #> '{overall,on_the_way}'),
  '{"to_collect": {"orders":7,"packs":0,"amount":100,"without_amount":6,"paid":0,"unpaid_amount":100,
                   "without_amount_names":["Meera","Tanvi","Farah"]},
    "on_the_way": {"orders":4,"packs":0,"amount":0,"without_amount":4,"paid":1,"unpaid_amount":0,
                   "unpaid_names":["Neha","Ravi"]}}'::jsonb,
  'names: first names, each once (first spelling wins), at most 3; to_collect by delivery date, '
  'on_the_way by created_at; counts stay per order and include the unnamed one'
);

-- ─── 6. Week boundaries ─────────────────────────────────

-- Clears the orders and puts pairs on each edge of each week. Confirmed
-- orders carry 1, 2, 4… packs, and paid ones ₹1, ₹2, ₹4…, so every total
-- says exactly which orders were counted:
--   this Monday 00:00 IST     created 1 pack  / paid ₹1
--   1 µs before that          created 2       / paid ₹2
--   last Monday 00:00 IST     created 4       / paid ₹4
--   1 µs before that          created 8       / paid ₹8
--   exactly 7 days ago        created 16      / paid ₹16
--   1 µs before that          created 32      / paid ₹32
create function pg_temp.around_weeks()
returns jsonb
language plpgsql
as $$
declare
  v_this timestamptz := date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_last timestamptz := v_this - interval '7 days';
  v_ago timestamptz := now() - interval '7 days';
  v_totals jsonb;
begin
  delete from public.orders;

  insert into public.orders (code, source, status, phone, amount, paid_at, created_at)
  select 'SN-WK' || t.tag || '22', 'whatsapp', 'confirmed', '9198000000' || (70 + t.n), null, null, t.at
  from (values
    ('A', 1, v_this), ('B', 2, v_this - interval '1 microsecond'),
    ('C', 3, v_last), ('D', 4, v_last - interval '1 microsecond'),
    ('E', 5, v_ago),  ('F', 6, v_ago - interval '1 microsecond')
  ) as t(tag, n, at)
  union all
  select 'SN-PY' || t.tag || '22', 'whatsapp', 'new', '9198000000' || (80 + t.n), t.amount, t.at, '2020-01-01'
  from (values
    ('A', 1, 1, v_this), ('B', 2, 2, v_this - interval '1 microsecond'),
    ('C', 3, 4, v_last), ('D', 4, 8, v_last - interval '1 microsecond'),
    ('E', 5, 16, v_ago), ('F', 6, 32, v_ago - interval '1 microsecond')
  ) as t(tag, n, amount, at);

  insert into public.order_lines (order_id, product_id, size, quantity)
  select o.id, 'muesli', '250 g', power(2, ascii(substring(o.code from 6 for 1)) - ascii('A'))::integer
  from public.orders o where o.code like 'SN-WK%';

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  v_totals := public.get_admin_totals()::jsonb;

  return v_totals;
end;
$$;

select set_config('test.weeksfull', pg_temp.around_weeks()::text, true);
select set_config('test.weeks', (
  select jsonb_object_agg(w.key, jsonb_build_object(
    'orders', w.value -> 'orders', 'packs', w.value -> 'packs', 'amount_in', w.value -> 'amount_in'))
  from jsonb_each(current_setting('test.weeksfull')::jsonb -> 'weeks') w
)::text, true);

select is(
  current_setting('test.weeks')::jsonb -> 'this',
  '{"orders":1,"packs":1,"amount_in":1}'::jsonb,
  'this week: from Monday 00:00 IST exactly; a microsecond before is out'
);
select is(
  current_setting('test.weeks')::jsonb -> 'last',
  '{"orders":4,"packs":54,"amount_in":54}'::jsonb,
  'last week: from last Monday 00:00 IST up to (not including) this Monday'
);
select is(
  current_setting('test.weeks')::jsonb -> 'last_so_far',
  '{"orders":2,"packs":36,"amount_in":36}'::jsonb,
  'last week so far: from last Monday up to (not including) exactly 7 days ago'
);

select is(
  (select jsonb_build_object('orders', sum((d ->> 'orders')::int), 'packs', sum((d ->> 'packs')::int))
   from jsonb_array_elements(current_setting('test.weeksfull')::jsonb #> '{weeks,last,days}') d),
  '{"orders":4,"packs":54}'::jsonb,
  'last week: the days add up to the week, Sunday 23:59 IST included'
);
select is(
  jsonb_build_object(
    'this', current_setting('test.weeksfull')::jsonb #> '{weeks,this,by_product}',
    'last_so_far', current_setting('test.weeksfull')::jsonb #> '{weeks,last_so_far,by_product}'),
  '{"this":[{"product_id":"muesli","packs":1,"orders":1}],
    "last_so_far":[{"product_id":"muesli","packs":36,"orders":2}]}'::jsonb,
  'by_product: the same week edges as the totals'
);
select ok(
  (current_setting('test.weeksfull')::jsonb ->> 'first_order_at')::timestamptz
    = (date_trunc('week', now() at time zone 'Asia/Kolkata') - interval '7 days') at time zone 'Asia/Kolkata'
      - interval '1 microsecond',
  'first_order_at: the earliest real order, even before last week; paid-only new orders do not count'
);

-- ─── 7. home_view and get_admin_me ──────────────────────

select is(
  (select home_view from public.admin_users where id = '00000000-0000-4000-8000-000000000001'),
  'admin',
  'home_view defaults to admin'
);
select throws_ok(
  $$update public.admin_users set home_view = 'chef' where id = '00000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'home_view accepts only cook or admin'
);

update public.admin_users set home_view = 'cook' where id = '00000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.get_admin_me()::jsonb,
  '{"id":"00000000-0000-4000-8000-000000000001","email":"owner@example.com","display_name":"Owner","home_view":"cook"}'::jsonb,
  'get_admin_me returns home_view'
);
reset role;

select * from finish();
rollback;
