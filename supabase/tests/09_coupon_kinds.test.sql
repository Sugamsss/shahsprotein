-- 20260928000002: coupon kinds. Existing coupons become One-time, create and
-- update take a kind (and still work without one), one signature each, and
-- get_admin_coupon_uses() lists one number's coupon orders: not cancelled,
-- website orders included, newest first. check_coupon() is unchanged. Codes,
-- names and numbers are made up and everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- The shared local stack may hold other people's test data. Start from
-- empty tables; the rollback at the end puts everything back.
delete from public.orders;
-- The kitchen too: a seeded local database has batches and spare.
delete from public.kitchen_writeoffs;
delete from public.kitchen_allocations;
delete from public.kitchen_batches;
delete from public.kitchen_actions;
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

-- Made before the kind is ever mentioned, like the live coupons.
insert into public.coupons (id, code, description) values
  ('00000000-0000-4000-c000-000000000001', 'EXAMPLE10', '10% off your order'),
  ('00000000-0000-4000-c000-000000000002', 'EXAMPLE20', '20% off your order');

-- ─── 1. The column ─────────────────────────────────────

select is(
  (select array_agg(kind order by code) from public.coupons),
  array['one_time', 'one_time'],
  'coupons made without a kind are One-time'
);

select throws_ok(
  $$update public.coupons set kind = 'weekly' where code = 'EXAMPLE10'$$,
  '23514', null,
  'the table takes only repeat or one_time'
);

-- ─── 2. Who can call what ──────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.get_admin_coupon_uses(text)', 'execute')
  and not has_function_privilege('anon', 'public.create_admin_coupon(text, text, timestamptz, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.update_admin_coupon(uuid, text, boolean, timestamptz, text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.coupon_check_kind(text)', 'execute'),
  'anon can''t call the coupon RPCs, and the kind check is internal'
);

select is(
  (select array_agg(proname::text || '/' || pronargs order by proname)
   from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('create_admin_coupon', 'update_admin_coupon')),
  array['create_admin_coupon/6', 'update_admin_coupon/7'],
  'one signature each: the old ones are gone, so PostgREST never has two to choose from'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.get_admin_coupon_uses('9800000001')$$, 'P0001', 'Unauthorized', 'non-admin: get_admin_coupon_uses');
reset role;

-- ─── 3. Create, update, list ───────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.create_admin_coupon(p_code := 'example-rep', p_description := 'Our regulars'' price', p_kind := 'repeat')::jsonb ->> 'kind',
  'repeat',
  'create: Repeat'
);

select is(
  public.create_admin_coupon(p_code := 'EXAMPLE-ONE', p_description := 'First order treat')::jsonb ->> 'kind',
  'one_time',
  'create without a kind (an older admin): One-time'
);

select throws_ok(
  $$select public.create_admin_coupon(p_code := 'EXAMPLE-BAD', p_description := 'Nope', p_kind := 'weekly')$$,
  '22023', 'Choose Repeat or One-time.',
  'create: a kind that isn''t one is a plain message'
);

select is(
  public.update_admin_coupon(
    p_id := '00000000-0000-4000-c000-000000000001', p_description := '10% off your order', p_active := true,
    p_expires_at := null, p_minimum_note := null, p_internal_note := null, p_kind := 'repeat'
  )::jsonb ->> 'kind',
  'repeat',
  'update: changes the kind'
);

select is(
  (select jsonb_build_object('code', r ->> 'code', 'description', r ->> 'description', 'kind', r ->> 'kind', 'active', r -> 'active')
   from (select public.update_admin_coupon(
     p_id := '00000000-0000-4000-c000-000000000001', p_description := 'Ten percent off', p_active := true,
     p_expires_at := null, p_minimum_note := null, p_internal_note := null
   )::jsonb as r) saved),
  '{"code": "EXAMPLE10", "description": "Ten percent off", "kind": "repeat", "active": true}'::jsonb,
  'update without a kind (an older admin) keeps it and saves the rest'
);

select throws_ok(
  $$select public.update_admin_coupon('00000000-0000-4000-c000-000000000002', '20% off your order', true, null, null, null, 'ONE_TIME')$$,
  '22023', 'Choose Repeat or One-time.',
  'update: a kind that isn''t one is a plain message'
);

select is(
  (select jsonb_object_agg(c ->> 'code', c ->> 'kind') from json_array_elements(public.get_admin_coupons()) c),
  '{"EXAMPLE10": "repeat", "EXAMPLE20": "one_time", "EXAMPLE-REP": "repeat", "EXAMPLE-ONE": "one_time"}'::jsonb,
  'get_admin_coupons: every coupon carries its kind'
);

reset role;

-- ─── 4. One number's coupons ───────────────────────────

insert into public.orders (id, code, source, status, name, pincode, phone, coupon_code, coupon_id, created_at) values
  -- The number we look up: a website order, a hand-made one, one cancelled
  -- and one with no coupon.
  ('00000000-0000-4000-a000-000000000001', 'SN-22A22', 'site',     'delivered', 'Asha Example', '415001', '919800000001', 'EXAMPLE20', '00000000-0000-4000-c000-000000000002', now() - interval '20 days'),
  ('00000000-0000-4000-a000-000000000002', 'SN-22B22', 'whatsapp', 'packing',   'Asha Example', null,     '919800000001', 'EXAMPLE10', '00000000-0000-4000-c000-000000000001', now() - interval '5 days'),
  ('00000000-0000-4000-a000-000000000003', 'SN-22C22', 'call',     'cancelled', 'Asha Example', null,     '919800000001', 'EXAMPLE-ONE', null,                                 now() - interval '2 days'),
  ('00000000-0000-4000-a000-000000000004', 'SN-22D22', 'call',     'cooking',   'Asha Example', null,     '919800000001', null,        null,                                   now() - interval '1 day'),
  -- Someone else, with a coupon.
  ('00000000-0000-4000-a000-000000000005', 'SN-22E22', 'call',     'cooking',   'Neha Example', null,     '919800000002', 'EXAMPLE10', '00000000-0000-4000-c000-000000000001', now() - interval '1 day');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select jsonb_agg(u - 'created_at') from jsonb_array_elements(public.get_admin_coupon_uses('919800000001')::jsonb) u),
  '[
    {"order_id": "00000000-0000-4000-a000-000000000002", "order_code": "SN-22B22", "coupon_code": "EXAMPLE10"},
    {"order_id": "00000000-0000-4000-a000-000000000001", "order_code": "SN-22A22", "coupon_code": "EXAMPLE20"}
  ]'::jsonb,
  'uses: this number only, newest first, website orders in, cancelled and coupon-less orders out'
);

select ok(
  (select bool_and((u ->> 'created_at')::timestamptz is not null)
   from jsonb_array_elements(public.get_admin_coupon_uses('919800000001')::jsonb) u),
  'uses: each carries when the order was made'
);

select is(
  public.get_admin_coupon_uses('98000 00001')::jsonb,
  public.get_admin_coupon_uses('919800000001')::jsonb,
  'uses: a plain 10-digit number finds the same orders'
);

select is(public.get_admin_coupon_uses('12')::jsonb, '[]'::jsonb, 'uses: not a phone number is [], not an error');
select is(public.get_admin_coupon_uses(null)::jsonb, '[]'::jsonb, 'uses: no number is []');
select is(public.get_admin_coupon_uses('919800000009')::jsonb, '[]'::jsonb, 'uses: a number with no coupon orders is []');

reset role;

-- ─── 5. The site sees nothing new ──────────────────────

select is(
  jsonb_build_array(public.check_coupon('example10')::jsonb, public.check_coupon('NOPE-NOPE')::jsonb),
  '[{"valid":true,"description":"Ten percent off"},{"valid":false}]'::jsonb,
  'check_coupon: still exactly {valid, description} / {valid}, no kind'
);

select ok(
  not has_table_privilege('anon', 'public.coupons', 'select')
  and not has_column_privilege('anon', 'public.coupons', 'kind', 'select'),
  'anon still can''t read coupons, kind included'
);

select * from finish();
rollback;
