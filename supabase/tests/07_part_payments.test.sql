-- 20260928000000: part payments. The backfill, part → full, paying more than
-- the total, deleting and putting back (Undo), an order with no total, the
-- old app's paid: true / paid: false, who can call what, and Home's money by
-- the week each payment came in. Test data is fake (9198000000xx,
-- example.com) and everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(56);

-- The shared local stack may hold other people's test data. Start from
-- empty tables; the rollback at the end puts everything back.
delete from public.orders;
-- The kitchen too: a seeded local database has batches and spare.
delete from public.kitchen_writeoffs;
delete from public.kitchen_allocations;
delete from public.kitchen_batches;
delete from public.kitchen_actions;
delete from public.order_rate_limits;
delete from public.admin_users;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

-- The money side of an order's JSON.
create function pg_temp.money(p json) returns jsonb language sql as $$
  select jsonb_build_object(
    'payment_state', p -> 'payment_state', 'paid', p -> 'paid', 'paid_method', p -> 'paid_method',
    'amount_paid', p -> 'amount_paid', 'amount_due', p -> 'amount_due', 'amount_extra', p -> 'amount_extra')
$$;

-- Each payment as [amount, method], oldest first.
create function pg_temp.parts(p json) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_array(x -> 'amount', x -> 'method') order by n), '[]'::jsonb)
  from jsonb_array_elements((p -> 'payments')::jsonb) with ordinality as t(x, n)
$$;

-- ─── 1. Who can call it ─────────────────────────────────

insert into public.orders (id, code, source, status, name, phone, amount) values
  ('00000000-0000-4000-a000-00000000000a', 'SN-PPA22', 'whatsapp', 'delivered', 'Neha Example', '919800000001', 1000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"amount":100,"method":"upi"}')$$,
  'P0001', 'Unauthorized', 'non-admin: add_admin_payment');
select throws_ok(
  $$select public.pay_admin_order_rest('00000000-0000-4000-a000-00000000000a', '{"method":"upi"}')$$,
  'P0001', 'Unauthorized', 'non-admin: pay_admin_order_rest');
select throws_ok(
  $$select public.delete_admin_payment('00000000-0000-4000-b000-000000000001')$$,
  'P0001', 'Unauthorized', 'non-admin: delete_admin_payment');
select throws_ok(
  $$select public.restore_admin_payments('00000000-0000-4000-a000-00000000000a',
    '[{"id":"00000000-0000-4000-b000-000000000001","amount":100,"method":"upi","paid_at":"2026-01-01T00:00:00Z"}]')$$,
  'P0001', 'Unauthorized', 'non-admin: restore_admin_payments');
reset role;

select ok(
  not has_function_privilege('anon', 'public.add_admin_payment(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.pay_admin_order_rest(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.delete_admin_payment(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.restore_admin_payments(uuid,jsonb)', 'execute'),
  'anon can''t call the payment RPCs'
);

select ok(
  not has_function_privilege('authenticated', 'public.order_backfill_payments(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.order_covering_payment(uuid,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.order_pay_rest(uuid,text,text,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.order_check_payment_amount(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.order_check_payment_date(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.order_backfill_payments(uuid)', 'execute'),
  'the payment helpers are internal'
);

select ok(
  not has_table_privilege('anon', 'public.order_payments', 'select')
  and not has_table_privilege('authenticated', 'public.order_payments', 'select')
  and not has_table_privilege('authenticated', 'public.order_payments', 'insert')
  and (select relrowsecurity from pg_class where oid = 'public.order_payments'::regclass),
  'order_payments: RLS on, no direct access'
);

-- ─── 2. The backfill ────────────────────────────────────

-- Orders the way the migration found them: paid, with no payments. The
-- insert trigger would add their payments at once, so it's off here.
alter table public.orders disable trigger trg_orders_paid_insert;

insert into public.orders (id, code, source, status, name, phone, amount, paid_at, paid_method, paid_note, created_by) values
  ('00000000-0000-4000-a000-0000000000b1', 'SN-BFA22', 'call', 'delivered', 'Asha Example', '919800000011', 700,
   '2026-09-20 10:00+05:30', 'upi', null, null),
  ('00000000-0000-4000-a000-0000000000b2', 'SN-BFB22', 'call', 'delivered', 'Ravi Example', '919800000012', null,
   '2026-09-21 10:00+05:30', null, null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-a000-0000000000b3', 'SN-BFC22', 'call', 'ready', 'Meera Example', '919800000013', 450,
   '2026-09-22 10:00+05:30', 'other', 'Paid by a friend', null),
  ('00000000-0000-4000-a000-0000000000b4', 'SN-BFD22', 'call', 'delivered', 'Farah Example', '919800000014', 300,
   null, null, null, null);

-- Owner marked the first one paid.
insert into public.order_events (order_id, event, at, by) values
  ('00000000-0000-4000-a000-0000000000b1', 'paid', '2026-09-20 10:00+05:30', '00000000-0000-4000-8000-000000000001');

alter table public.orders enable trigger trg_orders_paid_insert;

select set_config('test.before', (
  select jsonb_agg(jsonb_build_array(code, paid_at, paid_method, paid_note, updated_at) order by code)::text
  from public.orders where code like 'SN-BF%'), true);

select is(public.order_backfill_payments(), 3, 'backfill: one payment for each paid order, none for the unpaid one');

select results_eq(
  $$select o.code, p.amount, p.method, p.note, p.paid_at, p.created_by
    from public.order_payments p join public.orders o on o.id = p.order_id
    where o.code like 'SN-BF%' order by o.code$$,
  $$values
    ('SN-BFA22'::text, 700, 'upi'::text, null::text, '2026-09-20 10:00+05:30'::timestamptz, '00000000-0000-4000-8000-000000000001'::uuid),
    ('SN-BFB22', null, null, null, '2026-09-21 10:00+05:30', '00000000-0000-4000-8000-000000000001'),
    ('SN-BFC22', 450, 'other', 'Paid by a friend', '2026-09-22 10:00+05:30', null)$$,
  'backfill: amount, method, note and date copied; added by whoever marked it paid, else whoever made the order'
);

select is(
  (select jsonb_agg(jsonb_build_array(code, paid_at, paid_method, paid_note, updated_at) order by code)::text
   from public.orders where code like 'SN-BF%'),
  current_setting('test.before'),
  'backfill: the orders themselves don''t change'
);

select is(public.order_backfill_payments(), 0, 'backfill: running it again adds nothing');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  pg_temp.money(public.get_admin_order('SN-BFB22')),
  '{"payment_state":"paid","paid":true,"paid_method":null,"amount_paid":0,"amount_due":null,"amount_extra":null}'::jsonb,
  'backfill: a paid order with no total is still paid, with nothing due'
);
reset role;

-- ─── 3. Part → full ─────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config('test.a1', public.add_admin_payment('00000000-0000-4000-a000-00000000000a',
  '{"amount":750,"method":"upi","paid_at":"2026-09-24T10:00:00+05:30"}')::text, true);

select is(
  pg_temp.money(current_setting('test.a1')::json),
  '{"payment_state":"part_paid","paid":false,"paid_method":null,"amount_paid":750,"amount_due":250,"amount_extra":0}'::jsonb,
  'part: ₹750 of ₹1,000 is part paid, ₹250 due'
);

select is(
  (current_setting('test.a1')::jsonb -> 'payments' -> 0) - 'id' - 'created_at',
  '{"amount":750,"method":"upi","note":null,"paid_at":"2026-09-24T04:30:00+00:00","by_name":"Owner"}'::jsonb,
  'part: the payment shows its amount, method, date and who added it'
);

select is(current_setting('test.a1')::jsonb -> 'paid_at', 'null'::jsonb, 'part: not paid yet, so no paid_at');

-- Dated, because everything in this test runs at one now(): two undated
-- payments would tie, and ties fall back to the id.
select set_config('test.a2', public.pay_admin_order_rest('00000000-0000-4000-a000-00000000000a',
  '{"method":"cash","paid_at":"2026-09-25T10:00:00+05:30"}')::text, true);

select is(
  pg_temp.money(current_setting('test.a2')::json),
  '{"payment_state":"paid","paid":true,"paid_method":"cash","amount_paid":1000,"amount_due":0,"amount_extra":0}'::jsonb,
  'rest: one tap pays the ₹250 left, in cash'
);

select is(pg_temp.parts(current_setting('test.a2')::json), '[[750,"upi"],[250,"cash"]]'::jsonb,
  'rest: the second payment is exactly what was due');

select is(
  current_setting('test.a2')::jsonb -> 'paid_at',
  current_setting('test.a2')::jsonb -> 'payments' -> 1 -> 'paid_at',
  'rest: paid_at is when the payments covered the total'
);

select throws_ok(
  $$select public.pay_admin_order_rest('00000000-0000-4000-a000-00000000000a', '{"method":"upi"}')$$,
  '22023', 'That order is already paid.', 'rest: not twice'
);

-- ─── 4. Paying more than the total ──────────────────────

select set_config('test.a3', public.add_admin_payment('00000000-0000-4000-a000-00000000000a',
  '{"amount":"50","method":"other","note":" Tip ","paid_at":"2026-09-26T10:00:00+05:30"}')::text, true);

select is(
  pg_temp.money(current_setting('test.a3')::json),
  '{"payment_state":"paid","paid":true,"paid_method":"cash","amount_paid":1050,"amount_due":0,"amount_extra":50}'::jsonb,
  'extra: ₹50 more than the total shows as extra; still paid by the payment that covered it'
);

select is(current_setting('test.a3')::jsonb -> 'paid_at', current_setting('test.a2')::jsonb -> 'paid_at',
  'extra: paid_at doesn''t move');

select is(current_setting('test.a3')::jsonb #>> '{payments,2,note}', 'Tip', 'extra: an Other note is trimmed');

-- ─── 5. Delete, and Undo ────────────────────────────────

select set_config('test.cash_id', current_setting('test.a3')::jsonb #>> '{payments,1,id}', true);

select set_config('test.a4', public.delete_admin_payment(current_setting('test.cash_id')::uuid)::text, true);

select is(
  pg_temp.money(current_setting('test.a4')::json),
  '{"payment_state":"part_paid","paid":false,"paid_method":null,"amount_paid":800,"amount_due":200,"amount_extra":0}'::jsonb,
  'delete: without the ₹250 it''s part paid again, ₹200 due'
);

select throws_ok(
  format('select public.delete_admin_payment(%L)', current_setting('test.cash_id')),
  '22023', 'That payment is gone.', 'delete: a payment that''s gone says so'
);

select set_config('test.a5', public.restore_admin_payments('00000000-0000-4000-a000-00000000000a',
  jsonb_build_array((current_setting('test.a3')::jsonb #> '{payments,1}') - 'by_name' - 'created_at'))::text, true);

select is(
  pg_temp.money(current_setting('test.a5')::json),
  pg_temp.money(current_setting('test.a3')::json),
  'Undo: putting the payment back makes it paid again'
);

select is(
  (current_setting('test.a5')::jsonb #> '{payments,1}') - 'created_at',
  (current_setting('test.a3')::jsonb #> '{payments,1}') - 'created_at',
  'Undo: the same id, amount, method and date'
);

select is(
  pg_temp.parts(public.restore_admin_payments('00000000-0000-4000-a000-00000000000a',
    jsonb_build_array((current_setting('test.a3')::jsonb #> '{payments,1}') - 'by_name' - 'created_at'))),
  '[[750,"upi"],[250,"cash"],[50,"other"]]'::jsonb,
  'Undo twice: the second is skipped'
);

-- ─── 6. Not paid removes every payment; Undo puts them back

select set_config('test.a6', public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":false}')::text, true);

select is(
  pg_temp.money(current_setting('test.a6')::json) || jsonb_build_object('payments', current_setting('test.a6')::jsonb -> 'payments'),
  '{"payment_state":"not_paid","paid":false,"paid_method":null,"amount_paid":0,"amount_due":1000,"amount_extra":0,"payments":[]}'::jsonb,
  'paid: false removes every payment'
);

select set_config('test.a7', public.restore_admin_payments('00000000-0000-4000-a000-00000000000a',
  (select jsonb_agg(x - 'by_name' - 'created_at') from jsonb_array_elements(current_setting('test.a3')::jsonb -> 'payments') x))::text, true);

select is(
  pg_temp.money(current_setting('test.a7')::json) || jsonb_build_object('paid_at', current_setting('test.a7')::jsonb -> 'paid_at'),
  pg_temp.money(current_setting('test.a3')::json) || jsonb_build_object('paid_at', current_setting('test.a3')::jsonb -> 'paid_at'),
  'Undo: all three back, paid, with the same paid_at'
);

reset role;

select results_eq(
  $$select e.event from public.order_events e
    where e.order_id = '00000000-0000-4000-a000-00000000000a' order by e.id$$,
  $$values ('created'::text), ('paid'), ('unpaid'), ('paid'), ('unpaid'), ('paid')$$,
  'history: paid only when the total was covered, unpaid only when it stopped being covered'
);

-- ─── 7. Refusals ────────────────────────────────────────

insert into public.orders (id, code, source, status, name, phone, amount) values
  ('00000000-0000-4000-a000-00000000000c', 'SN-PPC22', 'whatsapp', 'ready', 'Asha Example', '919800000003', null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000c', '{"amount":100,"method":"upi"}')$$,
  '22023', 'Add the order total first.', 'refused: a part payment needs a total');
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"method":"upi"}')$$,
  '22023', 'Type how much they paid.', 'refused: no amount');
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"amount":0,"method":"upi"}')$$,
  '22023', 'Keep the payment between ₹1 and ₹10,00,000.', 'refused: ₹0');
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"amount":100}')$$,
  '22023', 'Choose UPI, Cash, Bank transfer or Other.', 'refused: no method');
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"amount":100,"method":"other"}')$$,
  '22023', 'Add a short note for Other.', 'refused: Other with no note');
select throws_ok(
  format($$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"amount":100,"method":"upi","paid_at":"%s"}')$$,
    now() + interval '1 hour'),
  '22023', 'A payment can''t be dated in the future.', 'refused: a date in the future');
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"amount":100,"method":"upi","paid_at":"soon"}')$$,
  '22023', 'That date doesn''t look right.', 'refused: a date that isn''t one');
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"amount":100,"method":"upi","paid_at":"-infinity"}')$$,
  '22023', 'That date doesn''t look right.', 'refused: a word Postgres reads as a time, not a date');
select throws_ok(
  $$select public.restore_admin_payments('00000000-0000-4000-a000-00000000000a',
    '[{"id":"00000000-0000-4000-b000-000000000008","amount":"","method":"upi","paid_at":"2026-09-01T00:00:00Z"}]')$$,
  '22023', 'Type how much they paid.', 'refused: putting back an empty amount on an order with a total');
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000a', '{"amount":100,"method":"upi","by":"x"}')$$,
  '22023', 'Unknown field: by.', 'refused: an unknown key');
select throws_ok(
  $$select public.pay_admin_order_rest('00000000-0000-4000-a000-0000000000ff', '{"method":"upi"}')$$,
  '22023', 'That order is gone.', 'refused: an order that''s gone');
select throws_ok(
  $$select public.restore_admin_payments('00000000-0000-4000-a000-00000000000c',
    '[{"id":"00000000-0000-4000-b000-000000000009","amount":100,"method":"upi","paid_at":"2026-09-01T00:00:00Z"}]')$$,
  '22023', 'Add the order total first.', 'refused: putting back an amount on an order with no total');

-- ─── 8. An order with no total ──────────────────────────

select set_config('test.c1', public.pay_admin_order_rest('00000000-0000-4000-a000-00000000000c',
  '{"method":"upi","paid_at":"2026-09-23T09:00:00+05:30"}')::text, true);

select is(
  pg_temp.money(current_setting('test.c1')::json) || jsonb_build_object('parts', pg_temp.parts(current_setting('test.c1')::json)),
  '{"payment_state":"paid","paid":true,"paid_method":"upi","amount_paid":0,"amount_due":null,"amount_extra":null,"parts":[[null,"upi"]]}'::jsonb,
  'no total: Mark paid records one payment with no amount'
);

select set_config('test.c2', public.update_admin_order('00000000-0000-4000-a000-00000000000c', '{"amount":600}')::text, true);

select is(
  pg_temp.money(current_setting('test.c2')::json) || jsonb_build_object('parts', pg_temp.parts(current_setting('test.c2')::json)),
  '{"payment_state":"paid","paid":true,"paid_method":"upi","amount_paid":600,"amount_due":0,"amount_extra":0,"parts":[[600,"upi"]]}'::jsonb,
  'no total: typing the total fills in the payment'
);

select is(current_setting('test.c2')::jsonb -> 'paid_at', current_setting('test.c1')::jsonb -> 'paid_at',
  'no total: paid_at stays the day it was paid');

select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000c', '{"amount":null}')$$,
  '22023', 'This order has payments, so it needs its total. Remove the payments first to clear it.',
  'a total with payments can''t be cleared'
);

select is(
  pg_temp.money(public.update_admin_order('00000000-0000-4000-a000-00000000000c', '{"paid":false,"amount":null}')),
  '{"payment_state":"not_paid","paid":false,"paid_method":null,"amount_paid":0,"amount_due":null,"amount_extra":null}'::jsonb,
  'paid: false and a cleared total in one call is fine'
);

-- ─── 9. A changed total, and the old app ────────────────

reset role;

-- Inserted already paid: the insert trigger gives it its ₹1,000 UPI payment.
insert into public.orders (id, code, source, status, name, phone, amount, paid_at, paid_method) values
  ('00000000-0000-4000-a000-00000000000d', 'SN-PPD22', 'call', 'delivered', 'Ravi Example', '919800000004', 1000,
   '2026-09-24 12:00+05:30', 'upi');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  pg_temp.money(public.update_admin_order('00000000-0000-4000-a000-00000000000d', '{"amount":1200}')),
  '{"payment_state":"part_paid","paid":false,"paid_method":null,"amount_paid":1000,"amount_due":200,"amount_extra":0}'::jsonb,
  'a higher total on a paid order leaves ₹200 due'
);

select is(
  pg_temp.money(public.update_admin_order('00000000-0000-4000-a000-00000000000d', '{"paid":true,"paid_method":"cash"}')),
  '{"payment_state":"paid","paid":true,"paid_method":"cash","amount_paid":1200,"amount_due":0,"amount_extra":0}'::jsonb,
  'old app: paid: true with a method pays the rest'
);

select set_config('test.d3', public.update_admin_order('00000000-0000-4000-a000-00000000000d',
  '{"paid":true,"paid_method":"bank"}')::text, true);

select is(
  pg_temp.parts(current_setting('test.d3')::json) || jsonb_build_array(current_setting('test.d3')::jsonb -> 'paid_method'),
  '[[1000,"upi"],[200,"bank"],"bank"]'::jsonb,
  'old app: a new method on a paid order changes only the payment that completed it'
);

select is(
  pg_temp.money(public.update_admin_order('00000000-0000-4000-a000-00000000000d', '{"amount":800}')),
  '{"payment_state":"paid","paid":true,"paid_method":"upi","amount_paid":1200,"amount_due":0,"amount_extra":400}'::jsonb,
  'a lower total: the first payment now covers it, and the rest is extra'
);

-- A ₹0 order: Mark paid records ₹0 and it's paid.
select is(
  pg_temp.money(public.save_admin_order(null, '{"source":"in_person","name":"Tanvi Example","amount":0,
    "paid":true,"paid_method":"cash","lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')),
  '{"payment_state":"paid","paid":true,"paid_method":"cash","amount_paid":0,"amount_due":0,"amount_extra":0}'::jsonb,
  'a ₹0 order made paid is paid'
);

-- The payment trigger runs during the cascade; it must not trip over the deleted order.
select lives_ok($$select public.delete_admin_order('00000000-0000-4000-a000-00000000000d')$$, 'deleting an order with payments');
reset role;

-- ─── 10. Home: money in by the week each payment came in ─

delete from public.orders;

select set_config('test.monday',
  (date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')::text, true);

insert into public.orders (id, code, source, status, name, phone, amount, created_at) values
  -- ₹1,000: ₹750 last week, ₹250 this week.
  ('00000000-0000-4000-a000-0000000000e1', 'SN-WKA22', 'whatsapp', 'delivered', 'Neha Example', '919800000021', 1000, '2020-01-01'),
  -- ₹500 paid in full this week.
  ('00000000-0000-4000-a000-0000000000e2', 'SN-WKB22', 'whatsapp', 'ready', 'Asha Example', '919800000022', 500, '2020-01-01'),
  -- Delivered, ₹900 with ₹300 up front this week: still to collect.
  ('00000000-0000-4000-a000-0000000000e3', 'SN-WKC22', 'whatsapp', 'delivered', 'Ravi Example', '919800000023', 900, '2020-01-01'),
  -- Cancelled after a ₹200 advance this week: never counted.
  ('00000000-0000-4000-a000-0000000000e4', 'SN-WKD22', 'whatsapp', 'cancelled', 'Meera Example', '919800000024', 400, '2020-01-01'),
  -- Delivered, not paid at all.
  ('00000000-0000-4000-a000-0000000000e5', 'SN-WKE22', 'whatsapp', 'delivered', 'Farah Example', '919800000025', 350, '2020-01-01');

insert into public.order_payments (order_id, amount, method, paid_at) values
  ('00000000-0000-4000-a000-0000000000e1', 750, 'upi', current_setting('test.monday')::timestamptz - interval '1 microsecond'),
  ('00000000-0000-4000-a000-0000000000e1', 250, 'cash', current_setting('test.monday')::timestamptz),
  ('00000000-0000-4000-a000-0000000000e2', 500, 'bank', current_setting('test.monday')::timestamptz),
  ('00000000-0000-4000-a000-0000000000e3', 300, 'upi', current_setting('test.monday')::timestamptz),
  ('00000000-0000-4000-a000-0000000000e4', 200, 'upi', current_setting('test.monday')::timestamptz);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.totals', public.get_admin_totals()::text, true);
select set_config('test.overview', public.get_admin_overview()::text, true);
reset role;

select is(
  jsonb_build_object(
    'this', (current_setting('test.totals')::jsonb #> '{weeks,this}')
      - array['starts_at', 'ends_at', 'days', 'by_product', 'orders', 'packs', 'grams_made', 'samples'],
    'last', (current_setting('test.totals')::jsonb #> '{weeks,last}')
      - array['starts_at', 'ends_at', 'days', 'orders', 'packs', 'grams_made', 'samples']),
  '{"this": {"amount_in":1050,"paid_orders":2,"paid_without_amount":0,"part_payments":2,
             "amount_by_method":{"upi":300,"cash":250,"bank":500,"other":0,"not_recorded":0}},
    "last": {"amount_in":750,"paid_orders":0,"paid_without_amount":0,"part_payments":1}}'::jsonb,
  'weeks: each payment counts in its own week and by its own method; the cancelled advance is out; split payments count as part payments'
);

select is(
  (current_setting('test.totals')::jsonb #> '{overall,to_collect}') - array['without_amount_names', 'samples', 'free_samples'],
  '{"orders":2,"packs":0,"amount":1250,"without_amount":0,"paid":0,"unpaid_amount":1250,"amount_due":950,"part_paid":1,
    "part_paid_names":["Ravi"]}'::jsonb,
  'to collect: the part-paid delivered order is in, with ₹600 of the ₹950 due on it, and named'
);

select is(
  (current_setting('test.overview')::jsonb #> '{queue,to_collect}') - 'oldest',
  '{"count":2,"amount":1250,"amount_due":950,"part_paid":1,"without_amount":0,"people":2}'::jsonb,
  'overview: to collect has what''s still due and how many are part paid'
);

select * from finish();
rollback;
