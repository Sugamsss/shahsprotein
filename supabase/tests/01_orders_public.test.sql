-- Order book, public side: who can touch what, submit_order(),
-- get_product_stock(), the history trigger and the stale rule.
-- Test data is fake: EXAMPLE10-style coupons, 9198000000xx phones,
-- example.com emails. Everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(57);

-- ─── Fixtures ───────────────────────────────────────────

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

insert into public.coupons (code, description)
values ('EXAMPLE10', '10% off your order');

insert into public.coupons (code, description, active)
values ('EXAMPLEOFF', 'An old code', false);

-- ─── 1. Tables are closed to anon and signed-in users ───

select ok(
  not exists (
    select 1
    from unnest(array['orders', 'order_lines', 'order_events', 'product_stock', 'order_rate_limits']) t,
         unnest(array['anon', 'authenticated']) r,
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
    where has_table_privilege(r, 'public.' || t, p)
  ),
  'anon and authenticated have no privilege on any order table'
);

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.orders'::regclass, 'public.order_lines'::regclass, 'public.order_events'::regclass,
                   'public.product_stock'::regclass, 'public.order_rate_limits'::regclass)),
  'RLS is on for every order table'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public'
     and tablename in ('orders', 'order_lines', 'order_events', 'product_stock', 'order_rate_limits')),
  0,
  'no policies on the order tables'
);

set local role anon;
select throws_ok('select * from public.orders', '42501', null, 'anon cannot select orders');
select throws_ok(
  $$insert into public.product_stock (product_id, size, in_stock) values ('muesli', '250 g', false)$$,
  '42501', null, 'anon cannot write product_stock'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok('select * from public.order_events', '42501', null, 'a signed-in user cannot select order_events');
select throws_ok(
  $$update public.orders set status = 'delivered'$$,
  '42501', null, 'a signed-in user cannot update orders'
);
reset role;

-- ─── 2. Function grants ─────────────────────────────────

select ok(
  has_function_privilege('anon', 'public.submit_order(text, jsonb, text, text, text)', 'execute')
  and has_function_privilege('anon', 'public.get_product_stock(text)', 'execute'),
  'anon can run submit_order and get_product_stock'
);

select ok(
  not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'get_admin_me', 'get_admin_orders', 'get_admin_order', 'update_admin_order',
        'save_admin_order', 'delete_admin_order', 'get_admin_overview', 'get_admin_customers',
        'set_admin_stock', 'get_admin_coupons', 'get_admin_email_list', 'get_admin_users',
        'create_admin_coupon', 'update_admin_coupon', 'set_admin_coupon_active'
      )
      and has_function_privilege('anon', p.oid, 'execute')
  ),
  'anon cannot run any admin RPC'
);

select ok(
  not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'order\_%' or p.proname in ('admin_order_json', 'admin_filter_orders',
           'log_order_events', 'set_order_status_changed_at'))
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
  ),
  'internal helpers are not callable from the API'
);

-- ─── 3. submit_order validation ─────────────────────────

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select public.submit_order('SN-7KQ4', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Neha', '415001')$$,
  '22023', 'That order code doesn''t look right.', 'a short code is rejected'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M-2', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Neha', '415001')$$,
  '22023', 'That order code doesn''t look right.', 'the client cannot send a suffix'
);
select throws_ok(
  $$select public.submit_order('SN-0KQ4M', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Neha', '415001')$$,
  '22023', 'That order code doesn''t look right.', 'a look-alike character (0) is rejected'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M', '[]', 'Neha', '415001')$$,
  '22023', 'Add at least one item.', 'empty lines are rejected'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M', (select jsonb_agg(jsonb_build_object('product_id', 'p' || i, 'size', '250 g', 'quantity', 1)) from generate_series(1, 21) i), 'Neha', '415001')$$,
  '22023', 'Keep it to 20 items or fewer.', 'more than 20 lines are rejected'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"Muesli!","size":"250 g","quantity":1}]', 'Neha', '415001')$$,
  '22023', 'One of the items doesn''t look right.', 'a bad product id is rejected'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"muesli","size":"a lot","quantity":1}]', 'Neha', '415001')$$,
  '22023', 'One of the items doesn''t look right.', 'a bad size is rejected'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"muesli","size":"250 g","quantity":1.5}]', 'Neha', '415001')$$,
  '22023', 'One of the items doesn''t look right.', 'a fractional quantity is rejected'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"muesli","size":"250 g","quantity":11}]', 'Neha', '415001')$$,
  '22023', 'Each item''s quantity is 1 to 10.', 'quantity over 10 is rejected from the site'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"muesli","size":"250 g","quantity":1}]', E' N\u2028 ', '415001')$$,
  '22023', 'A name is 2 to 60 characters.', 'a name that cleans down to one character is rejected'
);
select throws_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Neha', '015001')$$,
  '22023', 'A pincode is 6 digits.', 'a pincode starting with 0 is rejected'
);

-- A good save, with duplicate lines, a messy name and a lower-case code.
select lives_ok(
  $$select public.submit_order(
    'sn-7kq4m',
    '[{"product_id":"muesli","size":"250 g","quantity":6},
      {"product_id":"date-bites","size":"500 g","quantity":1},
      {"product_id":"muesli","size":"250 g","quantity":7}]',
    E'  Neha\u2028\t  Example ',
    ' 415001 ',
    ' example10 '
  )$$,
  'a good order saves'
);

-- The same order again (double tap, "Try again"), name in another case.
select lives_ok(
  $$select public.submit_order(
    'SN-7KQ4M',
    '[{"product_id":"date-bites","size":"500 g","quantity":1},
      {"product_id":"muesli","size":"250 g","quantity":10}]',
    'NEHA EXAMPLE', '415001', 'EXAMPLE10'
  )$$,
  'a repeat save is accepted'
);

-- A different order with the same code, twice, and a malformed coupon.
select lives_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"muesli","size":"500 g","quantity":1}]', 'Asha Example', '411001', 'not a code!')$$,
  'a different order with the same code saves'
);
select lives_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"muesli","size":"500 g","quantity":2}]', 'Ravi Example', '411002', 'EXAMPLEOFF')$$,
  'a third order with the same code saves'
);
select lives_ok(
  $$select public.submit_order('SN-9XWZT', '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]', 'Meera Example', '415002', 'NOSUCHCODE')$$,
  'an order with an unknown coupon saves'
);

reset role;

select results_eq(
  $$select code from public.orders where code like 'SN-7KQ4M%' order by created_at, code$$,
  $$values ('SN-7KQ4M'), ('SN-7KQ4M-2'), ('SN-7KQ4M-3')$$,
  'the repeat save did nothing; other orders with the same code got -2 then -3'
);

select results_eq(
  $$select name, pincode, source, status, paid_at is null, coupon_code, coupon_valid, coupon_id is not null
    from public.orders where code = 'SN-7KQ4M'$$,
  $$values ('Neha Example'::text, '415001'::text, 'site'::text, 'new'::text, true, 'EXAMPLE10'::text, true, true)$$,
  'the name is cleaned, the order starts new and not paid, the coupon is matched'
);

select results_eq(
  $$select l.product_id, l.size, l.quantity from public.order_lines l
    join public.orders o on o.id = l.order_id where o.code = 'SN-7KQ4M' order by 1, 2$$,
  $$values ('date-bites'::text, '500 g'::text, 1), ('muesli', '250 g', 10)$$,
  'duplicate lines are merged and capped at 10'
);

select results_eq(
  $$select coupon_code, coupon_valid from public.orders where code = 'SN-7KQ4M-2'$$,
  $$values (null::text, null::boolean)$$,
  'a malformed coupon is dropped, not an error'
);

select results_eq(
  $$select coupon_code, coupon_valid, coupon_id is null from public.orders where code in ('SN-7KQ4M-3', 'SN-9XWZT') order by code$$,
  $$values ('EXAMPLEOFF'::text, false, false), ('NOSUCHCODE', false, true)$$,
  'an inactive coupon is kept but not valid; an unknown one is kept, not valid, not linked'
);

select is(
  (select fingerprint from public.orders where code = 'SN-7KQ4M'),
  md5('neha example|415001|date-bites:500 g:1,muesli:250 g:10|EXAMPLE10'),
  'the fingerprint follows the contract'
);

-- After a deleted -2, the next clash still gets a free suffix.
delete from public.orders where code = 'SN-7KQ4M-2';
set local role anon;
select lives_ok(
  $$select public.submit_order('SN-7KQ4M', '[{"product_id":"muesli","size":"500 g","quantity":3}]', 'Kiran Example', '411003')$$,
  'a clash after a deleted suffix still saves'
);
reset role;
select ok(
  exists (select 1 from public.orders where code = 'SN-7KQ4M-4' and name = 'Kiran Example'),
  'the next suffix is one past the highest, not the count'
);

-- ─── 4. Rate limits ─────────────────────────────────────

set local role anon;
set local request.headers = '{"cf-connecting-ip":"203.0.113.9"}';

select lives_ok(
  $$select public.submit_order('SN-RATE2', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Rate Example', '415001')
    from generate_series(1, 10)$$,
  'ten saves from one IP in an hour are fine'
);
select throws_ok(
  $$select public.submit_order('SN-RATE2', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Rate Example', '415001')$$,
  'PT429', 'Too many orders. Try again later.', 'the eleventh save from that IP is refused'
);

set local request.headers = '{"cf-connecting-ip":"203.0.113.10"}';
select lives_ok(
  $$select public.submit_order('SN-RATE3', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Rate Example', '415001')$$,
  'another IP is not affected'
);
reset role;

select ok(
  (select count(*) from public.order_rate_limits) = 11
  and not exists (select 1 from public.order_rate_limits where request_key like '203.%'),
  'rate-limit rows hold a hash, not the IP'
);

-- Backstop: 300 site orders in the last hour stops everyone, even with no IP.
insert into public.orders (code, source, name, pincode)
select 'SN-' || translate(lpad(i::text, 5, '0'), '01', 'AB'), 'site', 'Flood Example', '415001'
from generate_series(1, 300) i
on conflict (code) do nothing;

set local role anon;
set local request.headers = '';
select throws_ok(
  $$select public.submit_order('SN-ZZZZZ', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Late Example', '415001')$$,
  'PT429', 'Too many orders. Try again later.', 'the overall backstop refuses the 301st site order in an hour'
);
reset role;

delete from public.orders where name = 'Flood Example';

-- ─── 5. Stock ───────────────────────────────────────────

set local role anon;
select is(public.get_product_stock()::jsonb, '[]'::jsonb, 'no rows means everything is in stock');
reset role;

insert into public.product_stock (product_id, size, in_stock)
values ('muesli', '500 g', false), ('muesli', '250 g', true);

set local role anon;
select is(
  (select jsonb_agg(e - 'since') from jsonb_array_elements(public.get_product_stock()::jsonb) e),
  '[{"product_id":"muesli","size":"500 g"}]'::jsonb,
  'only out-of-stock pairs are returned'
);
reset role;

select is(
  (select provolatile from pg_proc where oid = 'public.get_product_stock(text)'::regprocedure),
  's'::"char",
  'get_product_stock is stable, so PostgREST allows GET'
);

-- ─── 6. History trigger ─────────────────────────────────

-- Looked up as postgres: the admin role can't read orders directly.
select set_config('test.order_id', (select id::text from public.orders where code = 'SN-9XWZT'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.update_admin_order(current_setting('test.order_id')::uuid, '{"status":"confirmed","paid":true}')$$,
  'confirm and mark paid'
);
select lives_ok(
  $$select public.update_admin_order(current_setting('test.order_id')::uuid, '{"paid":true,"kept":true}')$$,
  'paid again (no change) and keep'
);
select lives_ok(
  $$select public.update_admin_order(current_setting('test.order_id')::uuid, '{"status":"confirmed","kept":false,"paid":false}')$$,
  'same status, unkeep, unpaid'
);
reset role;

select results_eq(
  $$select e.event, e.by from public.order_events e join public.orders o on o.id = e.order_id
    where o.code = 'SN-9XWZT' order by e.id$$,
  $$values
    ('created'::text, null::uuid),
    ('confirmed', '00000000-0000-4000-8000-000000000001'::uuid),
    ('paid', '00000000-0000-4000-8000-000000000001'::uuid),
    ('kept', '00000000-0000-4000-8000-000000000001'::uuid),
    ('unpaid', '00000000-0000-4000-8000-000000000001'::uuid),
    ('unkept', '00000000-0000-4000-8000-000000000001'::uuid)$$,
  'history: created by the site, then one event per real change, by the admin'
);

-- ─── 7. The stale rule ──────────────────────────────────

-- SN-7KQ4M-3 is new. Age it by moving status_changed_at directly (the status
-- doesn't change, so the trigger leaves it alone).
update public.orders set status_changed_at = now() - interval '47 hours' where code = 'SN-7KQ4M-3';
select is(
  (select public.admin_order_json(o) ->> 'stale' from public.orders o where code = 'SN-7KQ4M-3'),
  'false', 'new for 47 hours is not stale'
);

update public.orders
set status_changed_at = now() - interval '49 hours', created_at = now() - interval '49 hours'
where code = 'SN-7KQ4M-3';
select is(
  (select public.admin_order_json(o) ->> 'stale' from public.orders o where code = 'SN-7KQ4M-3'),
  'true', 'new for 49 hours is stale'
);

update public.orders set kept_at = now() where code = 'SN-7KQ4M-3';
select is(
  (select public.admin_order_json(o) ->> 'stale' from public.orders o where code = 'SN-7KQ4M-3'),
  'false', 'a kept order is never stale'
);

update public.orders set kept_at = null, status = 'confirmed' where code = 'SN-7KQ4M-3';
update public.orders set status = 'new' where code = 'SN-7KQ4M-3';
select is(
  (select public.admin_order_json(o) ->> 'stale' from public.orders o where code = 'SN-7KQ4M-3'),
  'false', 'undoing a Confirm back to New restarts the clock (old created_at, fresh status_changed_at)'
);

update public.orders set status = 'confirmed' where code = 'SN-7KQ4M-3';
update public.orders set status_changed_at = now() - interval '10 days' where code = 'SN-7KQ4M-3';
select is(
  (select public.admin_order_json(o) ->> 'stale' from public.orders o where code = 'SN-7KQ4M-3'),
  'false', 'only New orders can be stale'
);

-- "Still waiting" (Keep) restarts the clock rather than hiding the order
-- for good (20260926000003). SN-7KQ4M-4 is new; age both clocks.
select set_config('test.wait_id', (select id::text from public.orders where code = 'SN-7KQ4M-4'), true);
update public.orders
set status_changed_at = now() - interval '5 days', kept_at = now() - interval '49 hours'
where code = 'SN-7KQ4M-4';
select is(
  (select public.admin_order_json(o) ->> 'stale' from public.orders o where code = 'SN-7KQ4M-4'),
  'true', 'kept more than 48 hours ago: stale again'
);

update public.orders set kept_at = now() - interval '47 hours' where code = 'SN-7KQ4M-4';
select is(
  (select public.admin_order_json(o) ->> 'stale' from public.orders o where code = 'SN-7KQ4M-4'),
  'false', 'kept less than 48 hours ago: not stale'
);

update public.orders set kept_at = now() - interval '3 days' where code = 'SN-7KQ4M-4';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.update_admin_order(current_setting('test.wait_id')::uuid, '{"kept":true}')::jsonb ->> 'stale',
  'false', 'a re-tap on an already kept order takes it off the list again'
);
reset role;
select ok(
  (select kept_at = timezone('utc', now()) from public.orders where code = 'SN-7KQ4M-4')
  and (select e.event || '/' || e.by from public.order_events e
       where e.order_id = current_setting('test.wait_id')::uuid order by e.id desc limit 1)
      = 'kept/00000000-0000-4000-8000-000000000001',
  'the re-tap refreshes kept_at to now and logs a kept event'
);

set local role authenticated;
select is(
  public.update_admin_order(current_setting('test.wait_id')::uuid, '{"kept":false}')::jsonb ->> 'stale',
  'true', 'Undo clears kept_at, so the order is stale again'
);
reset role;
select is(
  (select event from public.order_events e
   where e.order_id = current_setting('test.wait_id')::uuid order by e.id desc limit 1),
  'unkept', 'Undo logs unkept'
);

select * from finish();
rollback;
