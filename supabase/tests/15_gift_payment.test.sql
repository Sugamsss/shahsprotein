-- 20261018000000: Gift, "we gave it free". It settles an order like any
-- payment, but no money came in: it's left out of came in, amount_in and
-- paid_of_sales, it comes off sales, and every by-method split shows it as
-- 'gift'. Test data is fake and everything rolls back.

begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

delete from public.orders;
delete from public.kitchen_writeoffs;
delete from public.kitchen_allocations;
delete from public.kitchen_batches;
delete from public.kitchen_actions;
delete from public.order_rate_limits;
delete from public.admin_users;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000001', 'owner@example.com');
insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

-- A: ₹500, fully gifted. B: ₹500, ₹200 UPI + ₹300 Gift. C: ₹400, Cash.
insert into public.orders (id, code, source, status, amount, name, created_at)
values
  ('00000000-0000-4000-a000-00000000000a', 'SN-GFA22', 'call', 'delivered', 500, 'Neha Example', now()),
  ('00000000-0000-4000-a000-00000000000b', 'SN-GFB22', 'call', 'delivered', 500, 'Riya Example', now()),
  ('00000000-0000-4000-a000-00000000000c', 'SN-GFC22', 'call', 'delivered', 400, 'Tanvi Example', now());

-- Admin calls run as the owner; direct table reads go back to the test's own role.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- ─── 1. Gift is a method ────────────────────────────────

select is(
  public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"gift"}')::jsonb ->> 'payment_state',
  'paid', 'mark paid with Gift settles the order');
reset role;
select is(
  (select paid_method from public.orders where id = '00000000-0000-4000-a000-00000000000a'),
  'gift', 'the order reads as Gift');
set local role authenticated;
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000a', '{"paid":true,"paid_method":"gift","paid_note":"x"}')$$,
  '22023', null, 'Gift takes no note');
select throws_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000c', '{"paid":true,"paid_method":"bogus"}')$$,
  '22023', null, 'an unknown method is still refused');

select lives_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000b', '{"amount":200,"method":"upi"}')$$,
  'a UPI part payment');
select lives_ok(
  $$select public.pay_admin_order_rest('00000000-0000-4000-a000-00000000000b', '{"method":"gift"}')$$,
  'the rest as Gift');
reset role;
select is(
  (select paid_at is not null from public.orders where id = '00000000-0000-4000-a000-00000000000b'),
  true, 'UPI + Gift settles the order');
select is(
  (select amount from public.order_payments where order_id = '00000000-0000-4000-a000-00000000000b' and method = 'gift'),
  300, 'the gifted part is the ₹300 left');
set local role authenticated;
select throws_ok(
  $$select public.add_admin_payment('00000000-0000-4000-a000-00000000000c', '{"amount":1,"method":"bogus"}')$$,
  '22023', null, 'an unknown payment method is refused');

select lives_ok(
  $$select public.update_admin_order('00000000-0000-4000-a000-00000000000c', '{"paid":true,"paid_method":"cash"}')$$,
  'C paid in cash');

-- ─── 2. Money ───────────────────────────────────────────

-- Came in: 200 UPI + 400 Cash. Gift 800 on its own.
select is(
  (public.get_admin_metrics()::jsonb #>> '{periods,today,totals,came_in,amount}')::int,
  600, 'came in leaves gifts out');
select is(
  (public.get_admin_metrics()::jsonb #>> '{periods,today,totals,came_in,by_method,gift}')::int,
  800, 'by method shows what was given away');
select is(
  (public.get_admin_metrics()::jsonb #>> '{periods,today,totals,came_in,payments}')::int,
  2, 'gift payments are not counted as payments in');
-- Sales: A 0, B 200, C 400.
select is(
  (public.get_admin_metrics()::jsonb #>> '{periods,today,totals,sales}')::int,
  600, 'sales take gifted amounts off');
select is(
  (public.get_admin_metrics()::jsonb #>> '{periods,today,totals,paid_of_sales}')::int,
  600, 'paid of sales leaves gifts out');

select is(
  (public.get_admin_totals()::jsonb #>> '{weeks,this,amount_in}')::int,
  600, 'this week''s money in leaves gifts out');
select is(
  (public.get_admin_totals()::jsonb #>> '{weeks,this,amount_by_method,gift}')::int,
  800, 'this week''s split shows Gift');
select is(
  (public.get_admin_totals()::jsonb #>> '{overall,to_collect,orders}')::int,
  0, 'gifted orders are not waiting to be collected');

reset role;
select * from finish();
set local role authenticated;
rollback;
