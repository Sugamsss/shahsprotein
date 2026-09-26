-- Order book, admin side: the is_admin() gate, phone normalisation,
-- save_admin_order(), update_admin_order(), the order list and detail, the
-- overview week maths, customers, stock, coupon use, the email list and
-- delete. Test data is fake (EXAMPLE10, 9198000000xx, example.com) and
-- everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(88);

-- The shared local stack may hold other people's test data. Start from
-- empty tables; the rollback at the end puts everything back.
delete from public.orders;
delete from public.order_rate_limits;
delete from public.product_stock;
delete from public.coupons;
delete from public.waitlist_members;
delete from public.admin_users;

-- ─── Fixtures ───────────────────────────────────────────

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

insert into public.coupons (id, code, description)
values ('00000000-0000-4000-9000-000000000010', 'EXAMPLE10', '10% off your order');

-- ─── 1. A signed-in non-admin gets Unauthorized ─────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok('select public.get_admin_me()', 'P0001', 'Unauthorized', 'non-admin: get_admin_me');
select throws_ok('select public.get_admin_users()', 'P0001', 'Unauthorized', 'non-admin: get_admin_users');
select throws_ok('select public.get_admin_orders()', 'P0001', 'Unauthorized', 'non-admin: get_admin_orders');
select throws_ok($$select public.get_admin_order('SN-7KQ4M')$$, 'P0001', 'Unauthorized', 'non-admin: get_admin_order');
select throws_ok($$select public.update_admin_order(gen_random_uuid(), '{}')$$, 'P0001', 'Unauthorized', 'non-admin: update_admin_order');
select throws_ok($$select public.save_admin_order(null, '{}')$$, 'P0001', 'Unauthorized', 'non-admin: save_admin_order');
select throws_ok('select public.delete_admin_order(gen_random_uuid())', 'P0001', 'Unauthorized', 'non-admin: delete_admin_order');
select throws_ok('select public.get_admin_overview()', 'P0001', 'Unauthorized', 'non-admin: get_admin_overview');
select throws_ok('select public.get_admin_customers()', 'P0001', 'Unauthorized', 'non-admin: get_admin_customers');
select throws_ok($$select public.set_admin_stock('muesli', '250 g', false)$$, 'P0001', 'Unauthorized', 'non-admin: set_admin_stock');
select throws_ok('select public.get_admin_coupons()', 'P0001', 'Unauthorized', 'non-admin: get_admin_coupons');
select throws_ok('select public.get_admin_email_list()', 'P0001', 'Unauthorized', 'non-admin: get_admin_email_list');

reset role;

-- From here on, calls run as the admin unless reset.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.get_admin_me()::jsonb,
  '{"id":"00000000-0000-4000-8000-000000000001","email":"owner@example.com","display_name":"Owner","home_view":"admin"}'::jsonb,
  'get_admin_me returns the admin'
);

select is(
  (select jsonb_agg(u - 'created_at') from jsonb_array_elements(public.get_admin_users()::jsonb) u),
  '[{"email":"owner@example.com","display_name":"Owner","is_me":true}]'::jsonb,
  'get_admin_users lists who has access and marks me'
);

reset role;

-- ─── 2. Phone normalisation ─────────────────────────────

select results_eq(
  $$select public.order_try_normalize_phone(p) from (values
      ('98000 00001'), ('+91 98000 00001'), ('098000 00001'), ('0091 98000 00001'),
      ('919800000001'), ('+44 7700 900001'), ('+1 (555) 010-0001'),
      ('12345'), ('0123456789012'), ('1234567890123456'), (''), (null)
    ) as t(p)$$,
  $$values
      ('919800000001'::text), ('919800000001'), ('919800000001'), ('919800000001'),
      ('919800000001'), ('447700900001'), ('15550100001'),
      (null), (null), (null), (null), (null)$$,
  'phones: 10 digits, +91, leading 0, 00 prefix, foreign kept, junk rejected'
);

select throws_ok(
  $$select public.order_check_phone('"98000"')$$,
  '22023', 'That phone number doesn''t look right.', 'a short phone is an error for the admin'
);

-- ─── 3. save_admin_order: create ────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.save_admin_order(null, '{"source":"whatsapp","phone":"9800000001"}')$$,
  '22023', 'Add at least one item.', 'create: lines are required'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"whatsapp","lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'Add a name or a phone number.', 'create: a name or a phone is required'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"whatsapp","phone":"98000","lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'That phone number doesn''t look right.', 'create: bad phone'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"whatsapp","name":"Neha","pincode":"4150","lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'A pincode is 6 digits.', 'create: bad pincode'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"whatsapp","name":"Neha","amount":1000001,"lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'Keep the amount between 0 and 10,00,000.', 'create: amount over the limit'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"whatsapp","name":"Neha","coupon":"bad code!","lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'That coupon code doesn''t look right.', 'create: a malformed coupon is an error here'
);
select throws_ok(
  $$select public.save_admin_order(null, jsonb_build_object('source', 'call', 'name', 'Neha', 'created_at', now() + interval '1 day',
      'lines', '[{"product_id":"muesli","size":"250 g","quantity":1}]'::jsonb))$$,
  '22023', 'An order can''t be dated in the future.', 'create: no future dates'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"site","name":"Neha","lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'Choose where the order came from.', 'create: the admin cannot add a site order'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Neha","lines":[{"product_id":"muesli","size":"250 g","quantity":100}]}')$$,
  '22023', 'Each item''s quantity is 1 to 99.', 'create: quantity up to 99 by hand'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Neha","colour":"red","lines":[]}')$$,
  '22023', 'Unknown field: colour.', 'create: unknown keys are refused'
);

-- A plain create: fresh code, confirmed, not paid, lines merged.
select lives_ok(
  $$select set_config('test.fresh', public.save_admin_order(null, '{
      "source":"whatsapp","phone":"98000 00001","note":"  Leave at the gate  ",
      "lines":[{"product_id":"muesli","size":"250 g","quantity":40},{"product_id":"muesli","size":"250 g","quantity":70}]
    }')::text, true)$$,
  'create by hand with only a phone'
);

select ok(
  (current_setting('test.fresh')::jsonb ->> 'code') ~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$'
  and current_setting('test.fresh')::jsonb ->> 'message_code' = current_setting('test.fresh')::jsonb ->> 'code',
  'the server makes a fresh code with no suffix'
);

select is(
  current_setting('test.fresh')::jsonb - array['id', 'code', 'message_code', 'created_at', 'updated_at', 'status_changed_at'],
  '{"source":"whatsapp","status":"confirmed","paid":false,"paid_at":null,"kept":false,"stale":false,
    "name":null,"pincode":null,"phone":"919800000001","note":"Leave at the gate","amount":null,"coupon":null,
    "lines":[{"product_id":"muesli","size":"250 g","quantity":99}],"packs":99,
    "customer":{"order_number":1,"orders":1}}'::jsonb,
  'create: confirmed, not paid, phone normalised, note trimmed, lines merged and capped at 99'
);

-- A code typed from a WhatsApp message, then the same code again.
select lives_ok(
  $$select set_config('test.typed', public.save_admin_order(null, jsonb_build_object(
      'source', 'instagram', 'code', ' sn-7kq4m ', 'name', 'Neha Example', 'pincode', '415001',
      'coupon', 'example10', 'amount', 690, 'paid', true, 'status', 'delivered',
      'created_at', now() - interval '3 days',
      'lines', '[{"product_id":"date-bites","size":"250 g","quantity":2}]'::jsonb))::text, true)$$,
  'create with a typed code, back-dated, paid and delivered'
);

select is(
  current_setting('test.typed')::jsonb - array['id', 'paid_at', 'created_at', 'updated_at', 'status_changed_at', 'customer'],
  '{"code":"SN-7KQ4M","message_code":"SN-7KQ4M","source":"instagram","status":"delivered","paid":true,"kept":false,
    "stale":false,"name":"Neha Example","pincode":"415001","phone":null,"note":null,"amount":690,
    "coupon":{"code":"EXAMPLE10","valid":true,"known":true,"description":"10% off your order"},
    "lines":[{"product_id":"date-bites","size":"250 g","quantity":2}],"packs":2}'::jsonb,
  'create: the typed code is used as is, the coupon is matched'
);

select ok(
  (current_setting('test.typed')::jsonb ->> 'created_at')::timestamptz between now() - interval '3 days 1 minute' and now() - interval '3 days' + interval '1 minute',
  'create: the back-date is kept'
);

select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","code":"SN-7KQ4M","name":"Asha","lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'SN-7KQ4M is already an order. Open that one, or leave the code empty and we''ll make one.',
  'create: a typed code that is already used is refused'
);

reset role;
select is(
  (select created_by from public.orders where code = 'SN-7KQ4M'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'create: created_by is the admin'
);

-- A site order to edit and update (saved the way the site saves it).
set local role anon;
select public.submit_order('SN-9XWZT', '[{"product_id":"muesli","size":"500 g","quantity":1}]', 'Asha Example', '411001');
reset role;
select set_config('test.site_id', (select id::text from public.orders where code = 'SN-9XWZT'), true);
select set_config('test.fresh_id', current_setting('test.fresh')::jsonb ->> 'id', true);

-- ─── 4. save_admin_order: edit ──────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.save_admin_order(current_setting('test.fresh_id')::uuid, '{
    "source":"call","code":"SN-22222","status":"cancelled","paid":true,"name":"Priya Example","phone":"9800000001",
    "lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":3}]
  }')::jsonb - array['id', 'code', 'message_code', 'created_at', 'updated_at', 'status_changed_at', 'customer'],
  '{"source":"call","status":"confirmed","paid":false,"paid_at":null,"kept":false,"stale":false,
    "name":"Priya Example","pincode":null,"phone":"919800000001","note":null,"amount":null,"coupon":null,
    "lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":3}],"packs":3}'::jsonb,
  'edit: a full replace of fields and lines; code, status and paid are ignored; the note is cleared'
);

select is(
  public.save_admin_order(current_setting('test.site_id')::uuid, '{
    "source":"whatsapp","name":"Asha Example","pincode":"411001","phone":"9800000002",
    "lines":[{"product_id":"muesli","size":"500 g","quantity":2}]
  }')::jsonb ->> 'source',
  'site',
  'edit: a site order stays a site order'
);

select throws_ok(
  $$select public.save_admin_order(current_setting('test.site_id')::uuid, '{"name":"Asha Example","phone":"9800000002","lines":[{"product_id":"muesli","size":"500 g","quantity":2}]}')$$,
  '22023', 'An order from the site keeps its name and pincode.', 'edit: a site order cannot lose its pincode'
);

select throws_ok(
  $$select public.save_admin_order(gen_random_uuid(), '{"name":"Nobody","lines":[{"product_id":"muesli","size":"500 g","quantity":2}]}')$$,
  '22023', 'That order is gone.', 'edit: a missing order'
);

-- ─── 5. update_admin_order ──────────────────────────────

select is(
  public.update_admin_order(current_setting('test.site_id')::uuid, '{"amount":690}')::jsonb
    -> 'amount',
  '690'::jsonb,
  'update: only the amount changes'
);

select results_eq(
  $$select public.update_admin_order(current_setting('test.site_id')::uuid, '{"note":"Ring twice"}')::jsonb ->> 'note'
    union all
    select public.update_admin_order(current_setting('test.site_id')::uuid, '{"note":null}')::jsonb ->> 'note'
    union all
    select public.update_admin_order(current_setting('test.site_id')::uuid, '{"note":"   "}')::jsonb ->> 'note'$$,
  $$values ('Ring twice'::text), (null), (null)$$,
  'update: a note is set, cleared by null, and an empty note is stored as null'
);

select throws_ok(
  $$select public.update_admin_order(current_setting('test.site_id')::uuid, '{"status":"confirmed","phone":"123","amount":700}')$$,
  '22023', 'That phone number doesn''t look right.', 'Confirm sheet: a bad phone refuses the whole change'
);

select is(
  public.update_admin_order(current_setting('test.site_id')::uuid, '{}')::jsonb ->> 'status',
  'new',
  'Confirm sheet: after the refusal the status is unchanged'
);

select is(
  public.update_admin_order(current_setting('test.site_id')::uuid,
    '{"status":"confirmed","phone":"+91 98000 00002","amount":700}')::jsonb
    - array['id', 'code', 'message_code', 'source', 'paid', 'paid_at', 'kept', 'stale', 'name', 'pincode', 'note',
            'coupon', 'lines', 'packs', 'customer', 'created_at', 'updated_at', 'status_changed_at'],
  '{"status":"confirmed","phone":"919800000002","amount":700}'::jsonb,
  'Confirm sheet: status, phone and amount change together'
);

select throws_ok(
  $$select public.update_admin_order(current_setting('test.site_id')::uuid, '{"name":null}')$$,
  '22023', 'An order from the site keeps its name and pincode.', 'update: a site order cannot lose its name'
);
select throws_ok(
  $$select public.update_admin_order(current_setting('test.site_id')::uuid, '{"pincode":null}')$$,
  '22023', 'An order from the site keeps its name and pincode.', 'update: a site order cannot lose its pincode'
);
select is(
  public.update_admin_order(current_setting('test.fresh_id')::uuid, '{"name":null}')::jsonb -> 'name',
  'null'::jsonb,
  'update: a hand-added order with a phone can lose its name'
);
select throws_ok(
  $$select public.update_admin_order(current_setting('test.fresh_id')::uuid, '{"phone":null}')$$,
  '22023', 'Add a name or a phone number.', 'update: but not its name and phone both'
);
select throws_ok(
  $$select public.update_admin_order(current_setting('test.site_id')::uuid, '{"colour":"red"}')$$,
  '22023', 'Unknown field: colour.', 'update: unknown keys are refused'
);
select throws_ok(
  $$select public.update_admin_order(current_setting('test.site_id')::uuid, '{"status":"lost"}')$$,
  '22023', 'Unknown status.', 'update: unknown status'
);
select throws_ok(
  $$select public.update_admin_order(gen_random_uuid(), '{"status":"sent"}')$$,
  '22023', 'That order is gone.', 'update: a missing order'
);

select set_config('test.paid1', public.update_admin_order(current_setting('test.site_id')::uuid, '{"paid":true}')::jsonb ->> 'paid_at', true);
select ok(
  (public.update_admin_order(current_setting('test.site_id')::uuid, '{"paid":true}')::jsonb ->> 'paid_at')
    = current_setting('test.paid1'),
  'update: paid on an already paid order keeps the first paid_at'
);

reset role;

-- ─── 6. get_admin_orders and get_admin_order ────────────

-- A known set, with fixed times.
create function pg_temp.codes(p json) returns text[] language sql as $$
  select coalesce(array_agg(o ->> 'code' order by n), '{}') from json_array_elements(p -> 'orders') with ordinality as t(o, n)
$$;

delete from public.orders;
insert into public.orders (code, source, status, paid_at, name, pincode, phone, created_at) values
  ('SN-7KQ4M',   'site',     'new',       null,  'Neha Example', '415001', '919800000001', now() - interval '1 hour'),
  ('SN-7KQ4M-2', 'site',     'confirmed', null,  'Asha Example', '411001', null,           now() - interval '2 hours'),
  ('SN-22222',   'whatsapp', 'delivered', null,  'Ravi Example', null,     null,           now() - interval '3 hours'),
  ('SN-33333',   'call',     'delivered', now(), 'Meera Example', null,    null,           now() - interval '4 hours'),
  ('SN-44444',   'whatsapp', 'cancelled', null,  'Kiran Example', null,    null,           now() - interval '5 hours'),
  ('SN-55555',   'site',     'sent',      null,  'Neha Example', '415001', null,           now() - interval '6 hours');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(pg_temp.codes(public.get_admin_orders()),
  array['SN-7KQ4M', 'SN-7KQ4M-2', 'SN-22222', 'SN-55555'], 'todo: new, confirmed, delivered and not paid, sent');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'done')),
  array['SN-33333', 'SN-44444'], 'done: delivered and paid, cancelled');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_status => array['delivered'], p_paid => false)),
  array['SN-22222'], 'filters: Delivered · Not paid');
select is(pg_temp.codes(public.get_admin_orders(p_search => '7kq4m')),
  array['SN-7KQ4M', 'SN-7KQ4M-2'], 'search: a code without SN-, any case, finds the suffixed one too');
select is(pg_temp.codes(public.get_admin_orders(p_search => ' #SN-7KQ4M-2 ')),
  array['SN-7KQ4M-2'], 'search: # and SN- are fine');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_search => 'neha')),
  array['SN-7KQ4M', 'SN-55555'], 'search: by name');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_search => '0000001')),
  array['SN-7KQ4M'], 'search: by phone digits');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_phone => '98000 00001')),
  array['SN-7KQ4M'], 'p_phone: normalised, then matched exactly');
select is(pg_temp.codes(public.get_admin_orders(p_view => 'all', p_phone => '98000')),
  '{}'::text[], 'p_phone: a partial number matches nothing');
select throws_ok($$select public.get_admin_orders(p_view => 'later')$$, '22023', 'Unknown view.', 'unknown view');
select throws_ok($$select public.get_admin_orders(p_status => array['lost'])$$, '22023', 'Unknown status.', 'unknown status');

select set_config('test.page1', public.get_admin_orders(p_view => 'all', p_limit => 4)::text, true);
select is(pg_temp.codes(current_setting('test.page1')::json),
  array['SN-7KQ4M', 'SN-7KQ4M-2', 'SN-22222', 'SN-33333'], 'paging: first page');
select is(
  pg_temp.codes(public.get_admin_orders(p_view => 'all', p_limit => 4,
    p_before => (current_setting('test.page1')::json ->> 'next_before')::timestamptz)),
  array['SN-44444', 'SN-55555'], 'paging: next_before gives the rest');
select is(
  public.get_admin_orders(p_view => 'all', p_limit => 4,
    p_before => (current_setting('test.page1')::json ->> 'next_before')::timestamptz) ->> 'next_before',
  null, 'paging: no next_before on the last page');

reset role;
insert into public.orders (code, source, name, created_at)
select 'SN-6666' || x, 'call', 'Tie Example', now() - interval '10 hours'
from unnest(array['A', 'B', 'C']) x;
set local role authenticated;

select is(
  json_array_length(public.get_admin_orders(p_view => 'all', p_limit => 7) -> 'orders'),
  9,
  'paging: a page is never cut inside a group with the same created_at'
);

select is(
  (select jsonb_build_object('code', o ->> 'code', 'message_code', o ->> 'message_code', 'history', jsonb_array_length(o -> 'history'))
   from (select public.get_admin_order('#7kq4m-2')::jsonb as o) x),
  '{"code":"SN-7KQ4M-2","message_code":"SN-7KQ4M","history":1}'::jsonb,
  'detail: found by code with # and without SN-, with history'
);
select is(public.get_admin_order('SN-ZZZZZ')::jsonb, null, 'detail: null when not found');

reset role;
insert into public.orders (code, source, name, pincode, created_at)
values ('SN-77777', 'site', 'neha example', '415001', now());
set local role authenticated;

select is(
  (public.get_admin_order('SN-77777')::jsonb -> 'phone_suggestion') - 'created_at',
  '{"phone":"919800000001","code":"SN-7KQ4M"}'::jsonb,
  'detail: a phone suggestion from another order with the same name and pincode'
);
select is(
  public.get_admin_order('SN-7KQ4M')::jsonb -> 'phone_suggestion',
  'null'::jsonb,
  'detail: no suggestion when the order has a phone'
);

reset role;

-- ─── 7. Overview: the week, India time, Monday start ────

delete from public.orders;
select set_config(
  'test.week_start',
  (date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')::text,
  true
);

-- A: Monday 00:30 India time (still Sunday in UTC) → this week.
-- B: Sunday 23:30 India time → last week. Same phone as A.
-- C: this week but cancelled → not counted.
-- D, E: delivered, not paid, long ago → money to collect.
-- F: a site order, New for days → stale (created long before last week).
-- G: delivered, not paid, same person as D by name (no phone).
-- H: delivered and paid, long ago → done.
insert into public.orders (id, code, source, status, name, phone, amount, coupon_code, coupon_id, created_at, paid_at) values
  ('00000000-0000-4000-a000-00000000000a', 'SN-AAAAA', 'call', 'new', 'Week A', '919800000011', null, null, null,
    current_setting('test.week_start')::timestamptz + interval '30 minutes', null),
  ('00000000-0000-4000-a000-00000000000b', 'SN-BBBBB', 'call', 'confirmed', 'Week B', '919800000011', null,
    'EXAMPLE10', '00000000-0000-4000-9000-000000000010',
    current_setting('test.week_start')::timestamptz - interval '30 minutes', null),
  ('00000000-0000-4000-a000-00000000000c', 'SN-CCCCC', 'call', 'cancelled', 'Week C', null, null, null, null,
    current_setting('test.week_start')::timestamptz + interval '1 day 1 hour', null),
  ('00000000-0000-4000-a000-00000000000d', 'SN-DDDDD', 'call', 'delivered', 'Week D', null, 500, null, null,
    current_setting('test.week_start')::timestamptz - interval '20 days', null),
  ('00000000-0000-4000-a000-00000000000e', 'SN-EEEEE', 'call', 'delivered', 'Week E', null, null, null, null,
    current_setting('test.week_start')::timestamptz - interval '20 days', null),
  ('00000000-0000-4000-a000-00000000000f', 'SN-FFFFF', 'call', 'new', 'Week F', null, null, null, null,
    current_setting('test.week_start')::timestamptz - interval '10 days', null),
  ('00000000-0000-4000-a000-000000000009', 'SN-GGGGG', 'call', 'delivered', 'WEEK D', null, null, null, null,
    current_setting('test.week_start')::timestamptz - interval '19 days', null),
  ('00000000-0000-4000-a000-000000000008', 'SN-HHHHH', 'call', 'delivered', 'Week H', null, null, null, null,
    current_setting('test.week_start')::timestamptz - interval '30 days', now());

update public.orders set pincode = '411038' where code = 'SN-BBBBB';
-- Only site orders go stale (20260926000005), so F came from the site.
update public.orders set source = 'site', pincode = '415001', status_changed_at = now() - interval '3 days'
where code = 'SN-FFFFF';

insert into public.order_lines (order_id, product_id, size, quantity) values
  ('00000000-0000-4000-a000-00000000000a', 'muesli', '250 g', 2),
  ('00000000-0000-4000-a000-00000000000b', 'muesli', '250 g', 3),
  ('00000000-0000-4000-a000-00000000000c', 'muesli', '250 g', 5),
  ('00000000-0000-4000-a000-00000000000d', 'muesli', '500 g', 1),
  ('00000000-0000-4000-a000-00000000000e', 'muesli', '500 g', 1);

-- D became delivered before E, so D is the oldest money to collect.
update public.orders set status_changed_at = now() - interval '2 days' where code = 'SN-DDDDD';
update public.orders set status_changed_at = now() - interval '1 day' where code = 'SN-EEEEE';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.overview', public.get_admin_overview()::text, true);

select ok(
  extract(isodow from (current_setting('test.overview')::jsonb #>> '{week,starts_on}')::date) = 1
  and (current_setting('test.overview')::jsonb #>> '{week,starts_on}')::date
      = (current_setting('test.week_start')::timestamptz at time zone 'Asia/Kolkata')::date,
  'week: starts on this Monday in India time'
);
select is(
  (select jsonb_agg(d - 'date' order by n) from jsonb_array_elements(current_setting('test.overview')::jsonb #> '{week,days}') with ordinality t(d, n)),
  '[{"orders":1,"packs":2},{"orders":0,"packs":0},{"orders":0,"packs":0},{"orders":0,"packs":0},
    {"orders":0,"packs":0},{"orders":0,"packs":0},{"orders":0,"packs":0}]'::jsonb,
  'week: seven days, Monday 00:30 India time lands on Monday, cancelled orders are left out'
);
select is(
  (current_setting('test.overview')::jsonb -> 'week')
    - array['starts_on', 'days', 'delivered', 'cancelled'],
  '{"orders":1,"packs":2,"repeat_customers":1,"last_week":{"orders":1,"packs":3}}'::jsonb,
  'week: totals, a repeat customer, and Sunday 23:30 counted in last week'
);
select is(
  ((current_setting('test.overview')::jsonb -> 'queue') #- '{to_collect,oldest,since}')
    - array['to_confirm_oldest', 'stale_oldest'],
  '{"to_confirm":1,"to_send":{"count":1,"paid":0},
    "to_collect":{"count":3,"amount":500,"without_amount":2,"people":2,
                  "oldest":{"code":"SN-DDDDD","name":"Week D"}},
    "on_the_way":{"count":0,"not_paid":0},"stale":1}'::jsonb,
  'queue: the five groups; money to collect from 2 people (by phone, else by name)'
);
select is(
  current_setting('test.overview')::jsonb -> 'done',
  '{"delivered_paid":1,"cancelled":1}'::jsonb,
  'done: all-time delivered and paid, and cancelled, as in the done view'
);
select ok(
  (current_setting('test.overview')::jsonb #>> '{queue,to_confirm_oldest}')::timestamptz
    = current_setting('test.week_start')::timestamptz + interval '30 minutes',
  'queue: to_confirm_oldest is the oldest New, not-stale order'
);
select ok(
  (current_setting('test.overview')::jsonb #>> '{queue,stale_oldest}')::timestamptz
    = current_setting('test.week_start')::timestamptz - interval '10 days',
  'queue: stale_oldest is the oldest stale order'
);

-- ─── 8. Customers, stock, coupons, email list, delete ──

select is(
  (select jsonb_agg(c - 'first_order_at' - 'last_order_at')
   from jsonb_array_elements(public.get_admin_customers()::jsonb -> 'customers') c),
  '[{"phone":"919800000011","name":"Week A","pincode":"411038","orders":2,"delivered":0,"open":2,"amount_total":0}]'::jsonb,
  'customers: grouped by phone, latest name, latest known pincode, not-cancelled orders'
);
select is(
  public.get_admin_customers()::jsonb -> 'without_phone',
  '5'::jsonb,
  'customers: orders without a phone are counted apart'
);
select is(
  jsonb_array_length(public.get_admin_customers('week b')::jsonb -> 'customers')
  + jsonb_array_length(public.get_admin_customers('00011')::jsonb -> 'customers')
  + jsonb_array_length(public.get_admin_customers('Nobody')::jsonb -> 'customers'),
  2,
  'customers: search by any of their names or by phone digits'
);

select is(
  (select jsonb_agg(e - 'since') from jsonb_array_elements(public.set_admin_stock('muesli', '500 g', false)::jsonb) e),
  '[{"product_id":"muesli","size":"500 g"}]'::jsonb,
  'stock: switching a size off returns the out list'
);
select is(public.set_admin_stock('muesli', '500 g', true)::jsonb, '[]'::jsonb, 'stock: and back on');
select throws_ok(
  $$select public.set_admin_stock('muesli', 'big', false)$$,
  '22023', 'That product or size doesn''t look right.', 'stock: a bad size'
);

select is(
  (select jsonb_build_object('code', c ->> 'code', 'order_count', c -> 'order_count', 'used', c ->> 'last_used_at' is not null)
   from jsonb_array_elements(public.get_admin_coupons()::jsonb) c),
  '{"code":"EXAMPLE10","order_count":1,"used":true}'::jsonb,
  'coupons: usage counts confirmed-and-later orders'
);

reset role;
insert into public.waitlist_members (email, source) values ('member@example.com', 'hero');
set local role authenticated;

select is(
  (select jsonb_build_object('members', jsonb_array_length(e -> 'members'), 'email', e #>> '{members,0,email}',
     'active', e #> '{stats,active}')
   from (select public.get_admin_email_list()::jsonb as e) x),
  '{"members":1,"email":"member@example.com","active":1}'::jsonb,
  'email list: members and stats'
);

select lives_ok($$select public.delete_admin_order('00000000-0000-4000-a000-00000000000a')$$, 'delete an order');
select lives_ok($$select public.delete_admin_order(gen_random_uuid())$$, 'deleting a missing order does nothing');
reset role;

select ok(
  not exists (select 1 from public.orders where id = '00000000-0000-4000-a000-00000000000a')
  and not exists (select 1 from public.order_lines where order_id = '00000000-0000-4000-a000-00000000000a')
  and not exists (select 1 from public.order_events where order_id = '00000000-0000-4000-a000-00000000000a'),
  'delete takes the lines and history with it'
);

select * from finish();
rollback;
