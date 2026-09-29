-- 20260928000001: admin prices. Who can call what, set / get / delete by null
-- for base and coupon prices, a few real validation cases, all or nothing,
-- a deleted coupon taking its prices with it, and check_coupon() still
-- saying nothing about prices. Prices and codes are made up (EXAMPLE10) and
-- everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- The shared local stack may hold other people's test data. Start from
-- empty tables; the rollback at the end puts everything back.
delete from public.orders;
-- The kitchen too: a seeded local database has batches and spare.
delete from public.kitchen_writeoffs;
delete from public.kitchen_allocations;
delete from public.kitchen_batches;
delete from public.kitchen_actions;
delete from public.product_prices;
delete from public.coupon_prices;
delete from public.coupons;
delete from public.coupon_check_rate_limits;
delete from public.admin_users;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

insert into public.coupons (id, code, description) values
  ('00000000-0000-4000-c000-000000000001', 'EXAMPLE10', '10% off your order'),
  ('00000000-0000-4000-c000-000000000002', 'EXAMPLE20', '20% off your order');

-- ─── 1. Who can call it ─────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.get_admin_prices()', 'execute')
  and not has_function_privilege('anon', 'public.set_admin_prices(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.admin_prices_json()', 'execute')
  and not has_function_privilege('anon', 'public.admin_prices_json()', 'execute'),
  'anon can''t call the price RPCs, and the JSON helper is internal'
);

select ok(
  not has_table_privilege('anon', 'public.product_prices', 'select')
  and not has_table_privilege('authenticated', 'public.product_prices', 'select')
  and not has_table_privilege('authenticated', 'public.product_prices', 'insert')
  and not has_table_privilege('anon', 'public.coupon_prices', 'select')
  and not has_table_privilege('authenticated', 'public.coupon_prices', 'select')
  and not has_table_privilege('authenticated', 'public.coupon_prices', 'insert')
  and (select relrowsecurity from pg_class where oid = 'public.product_prices'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.coupon_prices'::regclass),
  'price tables: RLS on, no direct access'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.get_admin_prices()$$, 'P0001', 'Unauthorized', 'non-admin: get_admin_prices');
select throws_ok(
  $$select public.set_admin_prices('[{"coupon_id":null,"product_id":"muesli","size":"250 g","price":100}]')$$,
  'P0001', 'Unauthorized', 'non-admin: set_admin_prices');
reset role;

-- ─── 2. Set, get, delete ────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.get_admin_prices()::jsonb,
  '{"base":[],"coupons":[]}'::jsonb,
  'get: nothing set is two empty lists, not nulls'
);

select is(
  public.set_admin_prices('[
    {"coupon_id":null,"product_id":"muesli","size":"500 g","price":400},
    {"coupon_id":null,"product_id":"muesli","size":"250 g","price":200},
    {"coupon_id":null,"product_id":"bites","size":"250 g","price":150},
    {"coupon_id":"00000000-0000-4000-c000-000000000002","product_id":"muesli","size":"250 g","price":160},
    {"coupon_id":"00000000-0000-4000-c000-000000000001","product_id":"muesli","size":"250 g","price":180}
  ]')::jsonb,
  '{"base":[
     {"product_id":"bites","size":"250 g","price":150},
     {"product_id":"muesli","size":"250 g","price":200},
     {"product_id":"muesli","size":"500 g","price":400}],
    "coupons":[
     {"coupon_id":"00000000-0000-4000-c000-000000000001","product_id":"muesli","size":"250 g","price":180},
     {"coupon_id":"00000000-0000-4000-c000-000000000002","product_id":"muesli","size":"250 g","price":160}]}'::jsonb,
  'set: returns every price, sorted (coupons by code first)'
);

select is(
  public.get_admin_prices()::jsonb,
  public.set_admin_prices('[{"coupon_id":null,"product_id":"bites","size":"250 g","price":150}]')::jsonb,
  'get returns the same as set'
);

reset role;
select is(
  (select updated_by from public.product_prices where product_id = 'muesli' and size = '250 g'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'set: remembers who set it'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.set_admin_prices('[
    {"coupon_id":null,"product_id":"muesli","size":"250 g","price":220},
    {"coupon_id":null,"product_id":"muesli","size":"500 g","price":null},
    {"coupon_id":"00000000-0000-4000-c000-000000000001","product_id":"muesli","size":"250 g","price":null},
    {"coupon_id":"00000000-0000-4000-c000-000000000002","product_id":"muesli","size":"250 g","price":170}
  ]')::jsonb,
  '{"base":[
     {"product_id":"bites","size":"250 g","price":150},
     {"product_id":"muesli","size":"250 g","price":220}],
    "coupons":[
     {"coupon_id":"00000000-0000-4000-c000-000000000002","product_id":"muesli","size":"250 g","price":170}]}'::jsonb,
  'set: a number changes a price, null deletes it (base and coupon)'
);

select lives_ok(
  $$select public.set_admin_prices('[{"coupon_id":null,"product_id":"raggi-jaggi","size":"500 g","price":null}]')$$,
  'set: deleting a price that isn''t there is fine'
);

-- ─── 3. Validation ──────────────────────────────────────

select throws_ok(
  $$select public.set_admin_prices('[{"coupon_id":null,"product_id":"muesli","size":"250 g","price":0}]')$$,
  '22023', 'Prices are whole rupees from 1 to 99,999.', 'bad: price 0');
select throws_ok(
  $$select public.set_admin_prices('[{"coupon_id":null,"product_id":"muesli","size":"250 g","price":240.5}]')$$,
  '22023', 'Prices are whole rupees from 1 to 99,999.', 'bad: price with paise');
select throws_ok(
  $$select public.set_admin_prices('[{"coupon_id":null,"product_id":"muesli","size":"250 g","price":"240"}]')$$,
  '22023', 'Prices are whole rupees from 1 to 99,999.', 'bad: price as a string');
select throws_ok(
  $$select public.set_admin_prices('[{"coupon_id":null,"product_id":"muesli","size":"250 g"}]')$$,
  '22023', 'Each price needs coupon_id, product_id, size and price, and nothing else.', 'bad: a missing key');
select throws_ok(
  $$select public.set_admin_prices('[{"coupon_id":null,"product_id":"muesli","size":"250 g","price":240,"note":"x"}]')$$,
  '22023', 'Each price needs coupon_id, product_id, size and price, and nothing else.', 'bad: an extra key');
select throws_ok(
  $$select public.set_admin_prices('[{"coupon_id":null,"product_id":"muesli","size":"250","price":240}]')$$,
  '22023', 'That product or size doesn''t look right.', 'bad: size shape');
select throws_ok(
  $$select public.set_admin_prices('[{"coupon_id":"00000000-0000-4000-c000-0000000000ff","product_id":"muesli","size":"250 g","price":240}]')$$,
  '22023', 'We couldn''t find that code. Refresh the list and try again.', 'bad: unknown coupon');
select throws_ok(
  $$select public.set_admin_prices('[]')$$,
  '22023', 'There are no prices to save.', 'bad: an empty list');

-- One good change, then the same pack twice: nothing is saved.
select throws_ok(
  $$select public.set_admin_prices('[
    {"coupon_id":null,"product_id":"bites","size":"250 g","price":999},
    {"coupon_id":null,"product_id":"muesli","size":"250 g","price":230},
    {"coupon_id":null,"product_id":"muesli","size":"250 g","price":null}
  ]')$$,
  '22023', 'The same price is in the list twice.', 'bad: the same pack twice');
reset role;
select is(
  (select jsonb_object_agg(product_id || ' ' || size, price) from public.product_prices),
  '{"bites 250 g":150,"muesli 250 g":220}'::jsonb,
  'one bad item saves nothing'
);

-- ─── 4. A deleted coupon takes its prices ───────────────

delete from public.coupons where id = '00000000-0000-4000-c000-000000000002';
select is(
  (select count(*)::integer from public.coupon_prices),
  0,
  'deleting a coupon deletes its prices'
);

-- ─── 5. check_coupon() still knows nothing about prices ──

insert into public.coupon_prices (coupon_id, product_id, size, price)
values ('00000000-0000-4000-c000-000000000001', 'muesli', '250 g', 180);

select is(
  jsonb_build_array(public.check_coupon('example10')::jsonb, public.check_coupon('NOPE-NOPE')::jsonb),
  '[{"valid":true,"description":"10% off your order"},{"valid":false}]'::jsonb,
  'check_coupon: still exactly {valid, description} / {valid}'
);

select * from finish();
rollback;
