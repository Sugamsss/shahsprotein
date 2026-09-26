-- 20260926000008: get_admin_totals() gains weeks.this.amount_by_method, this
-- week's money in split by how it was paid. Zeros on an empty database, which
-- orders count (this week, paid, not cancelled, with an amount), old paid
-- orders with no method as not_recorded, that the five add up to amount_in,
-- and that nothing else in the week changed. Test data is fake
-- (9198000000xx) and everything rolls back at the end.
--
-- Nothing here depends on today's date: fixtures sit on this week's own
-- start, or a microsecond before it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

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

-- ─── 1. Still admin only ────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok('select public.get_admin_totals()', 'P0001', 'Unauthorized', 'non-admin: get_admin_totals');
reset role;

-- ─── 2. An empty database gives zeros ───────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.empty', public.get_admin_totals()::text, true);
reset role;

select is(
  current_setting('test.empty')::jsonb #> '{weeks,this,amount_by_method}',
  '{"upi":0,"cash":0,"bank":0,"other":0,"not_recorded":0}'::jsonb,
  'empty: all five methods are there, as zeros'
);

select is(
  (select array_agg(w.key order by w.key) from jsonb_each(current_setting('test.empty')::jsonb -> 'weeks') w
   where w.value ? 'amount_by_method'),
  array['this'],
  'only this week has amount_by_method'
);

-- ─── 3. Which orders count ──────────────────────────────

-- This week starts Monday 00:00 IST. Everything "in" is paid exactly then;
-- everything "last week" a microsecond before.
select set_config('test.monday',
  (date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')::text, true);

insert into public.orders (code, source, status, phone, amount, paid_at, paid_method, paid_note, created_at)
select 'SN-' || t.code, 'whatsapp', t.status, '9198000000' || t.n, t.amount,
  current_setting('test.monday')::timestamptz + t.shift, t.method, t.note, '2020-01-01'
from (values
  -- In: two UPI, cash, bank, other with its note, and one paid before methods existed.
  ('MBA22', 10, 'delivered', 500,  interval '0', 'upi',   null),
  ('MBB22', 11, 'sent',      300,  interval '0', 'upi',   null),
  ('MBC22', 12, 'delivered', 200,  interval '0', 'cash',  null),
  ('MBD22', 13, 'confirmed', 1000, interval '0', 'bank',  null),
  ('MBE22', 14, 'delivered', 150,  interval '0', 'other', 'Paid by a friend'),
  ('MBF22', 15, 'delivered', 400,  interval '0', null,    null),
  -- Out: paid with no amount yet (adds nothing), cancelled after paying, paid last week.
  ('MBG22', 16, 'delivered', null, interval '0', 'cash',  null),
  ('MBH22', 17, 'cancelled', 999,  interval '0', 'upi',   null),
  ('MBJ22', 18, 'delivered', 7777, interval '-1 microsecond', 'upi', null)
) as t(code, n, status, amount, shift, method, note);

-- Out: delivered and not paid, with an amount. Made now, so it's this week's one real order.
insert into public.orders (code, source, status, phone, amount, created_at)
values ('SN-MBK22', 'whatsapp', 'delivered', '919800000019', 250, now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.totals', public.get_admin_totals()::text, true);
reset role;

select is(
  current_setting('test.totals')::jsonb #> '{weeks,this,amount_by_method}',
  '{"upi":800,"cash":200,"bank":1000,"other":150,"not_recorded":400}'::jsonb,
  'this week by method: UPI adds up, an old paid order is not_recorded; no amount, cancelled, last week and unpaid are out'
);

select is(
  (select sum(v::numeric) from jsonb_each_text(current_setting('test.totals')::jsonb #> '{weeks,this,amount_by_method}') as m(k, v)),
  (current_setting('test.totals')::jsonb #>> '{weeks,this,amount_in}')::numeric,
  'the five add up to amount_in'
);

select is(
  (current_setting('test.totals')::jsonb #> '{weeks,this}') - array['starts_at', 'ends_at', 'days', 'by_product', 'amount_by_method'],
  '{"orders":1,"packs":0,"amount_in":2550,"paid_orders":7,"paid_without_amount":1}'::jsonb,
  'this week''s other keys keep their meaning: the no-amount order is still in paid_orders and paid_without_amount'
);

select is(
  (current_setting('test.totals')::jsonb #> '{weeks,last}') ->> 'amount_in',
  '7777',
  'last week keeps its money in, without a split'
);

-- ─── 4. Only a key was added ────────────────────────────

select is(
  (select array_agg(k order by k) from jsonb_object_keys(current_setting('test.totals')::jsonb #> '{weeks,this}') k),
  array['amount_by_method', 'amount_in', 'by_product', 'days', 'ends_at', 'orders', 'packs',
        'paid_orders', 'paid_without_amount', 'starts_at'],
  'this week: the keys from 20260926000006, plus amount_by_method'
);

select * from finish();
rollback;
