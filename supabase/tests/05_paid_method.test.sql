-- 20260926000007: how an order was paid (UPI, Cash, Bank transfer, or Other with a note).
-- update_admin_order() and save_admin_order() with paid_method and
-- paid_note, the table checks, who can call it, and that paid is still paid
-- for get_admin_totals(). Test data is fake (9198000000xx, example.com) and
-- everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(35);

-- The shared local stack may hold other people's test data. Start from
-- empty tables; the rollback at the end puts everything back.
delete from public.orders;
delete from public.order_rate_limits;
delete from public.admin_users;

-- ─── Fixtures ───────────────────────────────────────────

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

-- A: delivered, not paid. B: paid before methods existed (no method).
insert into public.orders (id, code, source, status, paid_at, name, phone, created_at) values
  ('00000000-0000-4000-a000-00000000000a', 'SN-22222', 'call', 'delivered', null,
   'Neha Example', '919800000001', now() - interval '3 days'),
  ('00000000-0000-4000-a000-00000000000b', 'SN-33333', 'call', 'delivered', now() - interval '2 days',
   'Asha Example', '919800000002', now() - interval '4 days');

select set_config('test.b_paid_at', (select paid_at::text from public.orders where code = 'SN-33333'), true);

create function pg_temp.how(p json) returns jsonb language sql as $$
  select jsonb_build_object('paid', p -> 'paid', 'paid_method', p -> 'paid_method', 'paid_note', p -> 'paid_note')
$$;

-- ─── 1. Who can call it, and the helpers stay internal ──

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"upi"}')$$,
  'P0001', 'Unauthorized', 'non-admin: update_admin_order with a method'
);
reset role;

select ok(
  not has_function_privilege('authenticated', 'public.order_check_paid_method(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.order_check_paid_note(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.order_check_paid_pair(text,text)', 'execute')
  and not has_function_privilege('anon', 'public.order_check_paid_pair(text,text)', 'execute'),
  'the paid checks are internal'
);

-- ─── 2. update_admin_order: marking paid with a method ──

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config('test.a', public.update_admin_order(
  '00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"upi"}')::text, true);
select is(pg_temp.how(current_setting('test.a')::json),
  '{"paid":true,"paid_method":"upi","paid_note":null}'::jsonb, 'UPI marks it paid');

select is(
  public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"cash"}')::jsonb
    - array['id', 'code', 'message_code', 'source', 'status', 'paid', 'kept', 'stale', 'name', 'pincode', 'phone',
            'note', 'amount', 'coupon', 'lines', 'packs', 'customer', 'created_at', 'updated_at', 'status_changed_at'],
  jsonb_build_object('paid_at', current_setting('test.a')::jsonb -> 'paid_at', 'paid_method', 'cash', 'paid_note', null),
  'Cash on a paid order changes the method and keeps paid_at'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"bank"}')),
  '{"paid":true,"paid_method":"bank","paid_note":null}'::jsonb,
  'Bank transfer marks it paid, no note needed'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000a',
    '{"paid":true,"paid_method":"other","paid_note":"  bank transfer  "}')),
  '{"paid":true,"paid_method":"other","paid_note":"bank transfer"}'::jsonb,
  'Other with a note; the note is trimmed'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true}')),
  '{"paid":true,"paid_method":"other","paid_note":"bank transfer"}'::jsonb,
  'paid: true alone keeps the method and note'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000a',
    jsonb_build_object('paid', true, 'paid_method', 'other', 'paid_note', repeat('x', 60)))),
  jsonb_build_object('paid', true, 'paid_method', 'other', 'paid_note', repeat('x', 60)),
  'a 60-character note is fine'
);

-- ─── 3. update_admin_order: refusals ────────────────────

select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"other"}')$$,
  '22023', 'Add a short note for Other.', 'Other needs a note'
);
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"other","paid_note":"   "}')$$,
  '22023', 'Add a short note for Other.', 'a blank note is no note'
);
select throws_ok(
  format($$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"other","paid_note":"%s"}')$$, repeat('x', 61)),
  '22023', 'Keep the note to 60 characters or fewer.', 'a 61-character note is refused'
);
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"other","paid_note":"bank\ntransfer"}')$$,
  '22023', 'Keep the note to one line.', 'a note with a line break is refused'
);
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"upi","paid_note":"gpay"}')$$,
  '22023', 'A note goes only with Other.', 'a note with UPI is refused'
);
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"bank","paid_note":"hdfc"}')$$,
  '22023', 'A note goes only with Other.', 'a note with Bank is refused'
);
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"card"}')$$,
  '22023', 'Choose UPI, Cash, Bank transfer or Other.', 'an unknown method is refused'
);
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid_method":"upi"}')$$,
  '22023', 'Mark it paid to say how they paid.', 'a method without paid: true is refused'
);
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":false,"paid_method":"upi"}')$$,
  '22023', 'Mark it paid to say how they paid.', 'a method with paid: false is refused'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{}')),
  jsonb_build_object('paid', true, 'paid_method', 'other', 'paid_note', repeat('x', 60)),
  'after the refusals the order is as it was'
);

-- ─── 4. Not paid, Undo, and old orders ──────────────────

select is(
  (select pg_temp.how(u.j) || jsonb_build_object('paid_at', u.j -> 'paid_at')
   from (select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":false}') as j) u),
  '{"paid":false,"paid_method":null,"paid_note":null,"paid_at":null}'::jsonb,
  'paid: false clears paid_at, the method and the note'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true}')),
  '{"paid":true,"paid_method":null,"paid_note":null}'::jsonb,
  'paid: true alone marks paid with no method (the old way)'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000b', '{"paid":true}')),
  '{"paid":true,"paid_method":null,"paid_note":null}'::jsonb,
  'old order: paid: true alone leaves it paid with no method'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000b', '{"paid":true,"paid_method":"upi"}')),
  '{"paid":true,"paid_method":"upi","paid_note":null}'::jsonb,
  'old order: a method can be added'
);

select is(
  pg_temp.how(public.update_admin_order('00000000-0000-4000-a000-00000000000b', '{"paid":true,"paid_method":null}')),
  '{"paid":true,"paid_method":null,"paid_note":null}'::jsonb,
  'old order: Undo puts the empty method back with paid_method: null'
);

reset role;

select is(
  (select paid_at::text from public.orders where code = 'SN-33333'),
  current_setting('test.b_paid_at'),
  'old order: paid_at never moved'
);

select is(
  (select count(*)::int from public.order_events
   where order_id = '00000000-0000-4000-a000-00000000000a' and event = 'paid'),
  2,
  'history: one "paid" per time it was marked paid, none for changing the method'
);

-- ─── 5. save_admin_order ────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config('test.saved', public.save_admin_order(null, '{
    "source":"in_person","name":"Priya Example","paid":true,"paid_method":"other","paid_note":"paid by her brother",
    "lines":[{"product_id":"muesli","size":"250 g","quantity":1}]
  }')::text, true);
select is(pg_temp.how(current_setting('test.saved')::json),
  '{"paid":true,"paid_method":"other","paid_note":"paid by her brother"}'::jsonb,
  'create: paid with Other and a note');

select is(
  pg_temp.how(public.save_admin_order(null, '{
    "source":"call","name":"Ravi Example","paid":true,"paid_method":"cash",
    "lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')),
  '{"paid":true,"paid_method":"cash","paid_note":null}'::jsonb,
  'create: paid with Cash'
);

select is(
  pg_temp.how(public.save_admin_order(null, '{
    "source":"call","name":"Ravi Example","paid":false,"paid_method":null,"paid_note":"",
    "lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')),
  '{"paid":false,"paid_method":null,"paid_note":null}'::jsonb,
  'create: not paid, with the method and note sent empty the way a form sends them'
);

select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Ravi Example","paid_method":"upi",
    "lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'Mark it paid to say how they paid.', 'create: a method without paid is refused'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Ravi Example","paid":true,"paid_method":"other",
    "lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')$$,
  '22023', 'Add a short note for Other.', 'create: Other needs a note'
);

select is(
  pg_temp.how(public.save_admin_order((current_setting('test.saved')::json ->> 'id')::uuid, '{
    "source":"in_person","name":"Priya Example","paid":false,"paid_method":"card","paid_note":"ignored",
    "lines":[{"product_id":"muesli","size":"250 g","quantity":2}]}')),
  '{"paid":true,"paid_method":"other","paid_note":"paid by her brother"}'::jsonb,
  'edit: paid, the method and the note are ignored'
);

reset role;

-- ─── 6. The table checks ────────────────────────────────

select throws_ok(
  $$update public.orders set paid_at = null, paid_method = 'upi' where code = 'SN-22222'$$,
  '23514', null, 'table: a not-paid order has no method'
);
select throws_ok(
  $$update public.orders set paid_note = 'gpay' where code = 'SN-33333'$$,
  '23514', null, 'table: a note needs Other'
);
select throws_ok(
  $$update public.orders set paid_method = 'other', paid_note = ' bank ' where code = 'SN-33333'$$,
  '23514', null, 'table: the note is stored trimmed'
);

-- ─── 7. Paid is still paid for get_admin_totals() ───────

delete from public.orders;
insert into public.orders (code, source, status, paid_at, paid_method, name, amount, created_at) values
  ('SN-44444', 'call', 'sent', now(), 'cash', 'Neha Example', 300, now() - interval '1 hour');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (public.get_admin_totals()::jsonb #> '{overall,on_the_way}') - array['unpaid_names'],
  '{"orders":1,"packs":0,"amount":300,"without_amount":0,"paid":1,"unpaid_amount":0}'::jsonb,
  'totals: an order paid by cash counts as paid'
);
reset role;

select * from finish();
rollback;
