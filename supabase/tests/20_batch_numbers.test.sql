-- 20261104000000: batch numbers, Mfg and Exp, and changing an order's batch.
-- Covers: the product letters, the number (DDMMYY, -2 on the same day), Exp
-- fixed at logging (a shelf life change only reaches new batches), a fixed
-- made-on day working both out again and Undo putting them back, a deleted
-- batch coming back with its number, the numbers in the kitchen, effects and
-- order answers, set_admin_order_batch (oldest by default, moving to another
-- batch, by-hand grams, Undo, every refusal, the fill after it, a delivered
-- order onto a past batch), get_admin_batches (who got it, search, filters,
-- limits) and who may call what. Test data is fake; everything rolls back.

begin;
create extension if not exists pgtap with schema extensions;

select plan(54);

delete from public.orders;
delete from public.order_rate_limits;
delete from public.kitchen_history;
delete from public.kitchen_writeoffs;
delete from public.kitchen_allocations;
delete from public.kitchen_batches;
delete from public.kitchen_actions;
delete from public.admin_users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

-- ─── Helpers ────────────────────────────────────────────

create temp table tags (tag text primary key, id uuid not null);

create function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
$$;

create function pg_temp.as_someone() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
$$;

create function pg_temp.day(p_ago integer) returns date language sql as $$
  select public.kitchen_today() - p_ago;
$$;

-- R041126 for today when p_prefix is 'R'.
create function pg_temp.num(p_prefix text, p_ago integer) returns text language sql as $$
  select p_prefix || to_char(pg_temp.day(p_ago), 'DDMMYY');
$$;

create function pg_temp.id(p_code text) returns uuid language sql as $$
  select id from public.orders where code = p_code;
$$;

create function pg_temp.bid(p_tag text) returns uuid language sql as $$
  select id from tags where tag = p_tag;
$$;

create function pg_temp.code(p_tag text) returns text language sql as $$
  select code from public.kitchen_batches where id = pg_temp.bid(p_tag);
$$;

-- Logs one batch, p_ago days back, and tags it. Returns the effects.
create function pg_temp.log(p_tag text, p_product text, p_grams integer, p_ago integer default 0)
returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  v := public.log_admin_batches(jsonb_build_array(jsonb_build_object(
    'product_id', p_product, 'grams', p_grams, 'made_on', to_char(pg_temp.day(p_ago), 'YYYY-MM-DD'))))::jsonb;
  insert into tags select p_tag, b.id from public.kitchen_batches b where b.id not in (select id from tags);
  return v;
end;
$$;

-- A hand-added order, p_hours old.
create function pg_temp.ord(p_code text, p_hours integer, p_lines jsonb) returns uuid language sql as $$
  select (public.save_admin_order(null, jsonb_build_object(
    'source', 'call', 'code', p_code, 'name', 'Batch Example',
    'created_at', now() - make_interval(hours => p_hours), 'lines', p_lines))::jsonb ->> 'id')::uuid;
$$;

create function pg_temp.move(p_code text, p_status text) returns jsonb language sql as $$
  select public.update_admin_order(pg_temp.id(p_code), jsonb_build_object('status', p_status))::jsonb;
$$;

create function pg_temp.set_batch(p_code text, p_product text, p_tag text) returns jsonb language sql as $$
  select public.set_admin_order_batch(pg_temp.id(p_code), p_product, pg_temp.bid(p_tag))::jsonb;
$$;

create function pg_temp.undo(p_effects jsonb) returns jsonb language sql as $$
  select public.undo_admin_kitchen((p_effects ->> 'action_id')::uuid)::jsonb;
$$;

-- 'raggi-jaggi:r1=500,raggi-jaggi:hand=300': batch grams first, by hand last.
create function pg_temp.cover(p_code text) returns text language sql as $$
  select coalesce(string_agg(
    a.product_id || ':' || coalesce(t.tag, case when a.batch_id is null then 'hand' else 'batch' end) || '=' || a.grams,
    ',' order by a.product_id, a.batch_id is null, t.tag), '')
  from public.kitchen_allocations a
  left join tags t on t.id = a.batch_id
  where a.order_id = pg_temp.id(p_code);
$$;

create function pg_temp.spare(p_tag text) returns integer language sql as $$
  select r.spare from public.kitchen_batch_rows(null) r where r.batch_id = pg_temp.bid(p_tag);
$$;

-- ═══ Who may call what ═══════════════════════════════════════════════════

select ok(
  has_function_privilege('authenticated', 'public.set_admin_order_batch(uuid, text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.set_admin_order_batch(uuid, text, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.get_admin_batches(text, text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.get_admin_batches(text, text, integer)', 'execute'),
  'set_admin_order_batch and get_admin_batches: signed-in may call them, anon may not'
);

select ok(
  not has_function_privilege('authenticated', 'public.kitchen_run_set_order_batch(uuid, text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.kitchen_batch_code(text, date, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.kitchen_batch_expires_on(text, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.kitchen_batch_label()', 'execute')
  and not has_function_privilege('anon', 'public.kitchen_batch_code(text, date, uuid)', 'execute'),
  'internal batch number functions: not callable from the API'
);

select pg_temp.as_someone();
select throws_ok($$select public.get_admin_batches()$$, 'P0001', 'Unauthorized', 'non-admin: get_admin_batches');
select throws_ok(
  $$select public.set_admin_order_batch(gen_random_uuid(), 'muesli', gen_random_uuid())$$,
  'P0001', 'Unauthorized', 'non-admin: set_admin_order_batch'
);
select pg_temp.as_owner();

-- ═══ Numbers and dates ═══════════════════════════════════════════════════

select is(
  (select string_agg(product_id || '=' || batch_prefix, ' ' order by product_id) from public.kitchen_products),
  'bites= muesli=M raggi-jaggi=R',
  'letters: Raggi Jaggi R, Muesli M, Date Bites none'
);

select set_config('t.e1', pg_temp.log('r1', 'raggi-jaggi', 500, 1)::text, true);
select pg_temp.log('r2', 'raggi-jaggi', 600);
select pg_temp.log('r3', 'raggi-jaggi', 300);
select pg_temp.log('m1', 'muesli', 400);
select pg_temp.log('b1', 'bites', 500);

select is(pg_temp.code('r1'), pg_temp.num('R', 1), 'Raggi Jaggi: R + made-on day as DDMMYY');
select is(pg_temp.code('r2'), pg_temp.num('R', 0), 'the first batch of a day has the plain number');
select is(pg_temp.code('r3'), pg_temp.num('R', 0) || '-2', 'a second batch of one product on one day is -2');
select is(pg_temp.code('m1'), pg_temp.num('M', 0), 'Muesli: M + DDMMYY');
select is(pg_temp.code('b1'), pg_temp.num('', 0), 'Date Bites: DDMMYY with no letter');

select is(
  (select expires_on from public.kitchen_batches where id = pg_temp.bid('r1')),
  (pg_temp.day(1) + interval '6 months')::date,
  'Exp: made-on day plus the shelf life (6 months for Raggi Jaggi)'
);
select is(
  (select expires_on from public.kitchen_batches where id = pg_temp.bid('b1')),
  pg_temp.day(0) + 15,
  'Exp: Date Bites 15 days'
);

select is(
  current_setting('t.e1')::jsonb #>> '{batches,0,code}', pg_temp.num('R', 1),
  'log effects carry the number'
);
select is(
  current_setting('t.e1')::jsonb #>> '{batches,0,expires_on}',
  to_char(pg_temp.day(1) + interval '6 months', 'YYYY-MM-DD'),
  'log effects carry Exp'
);

select is(
  (select b ->> 'code' from json_array_elements(public.get_admin_kitchen() -> 'batches') b
   where (b ->> 'id')::uuid = pg_temp.bid('r3')),
  pg_temp.num('R', 0) || '-2',
  'get_admin_kitchen: recent batches carry the number'
);
select is(
  (select b ->> 'code'
   from json_array_elements(public.get_admin_kitchen() -> 'products') p,
     json_array_elements(p -> 'spare_batches') b
   where (b ->> 'batch_id')::uuid = pg_temp.bid('m1')),
  pg_temp.num('M', 0),
  'get_admin_kitchen: spare batches carry the number'
);

-- A shelf life change reaches new batches only.
select public.set_admin_kitchen_product('muesli', '{"shelf_life":{"amount":3,"unit":"months"}}');
select is(
  (select expires_on from public.kitchen_batches where id = pg_temp.bid('m1')),
  (pg_temp.day(0) + interval '6 months')::date,
  'shelf life change: a batch already made keeps its Exp'
);
select pg_temp.log('m2', 'muesli', 100);
select is(
  (select expires_on from public.kitchen_batches where id = pg_temp.bid('m2')),
  (pg_temp.day(0) + interval '3 months')::date,
  'shelf life change: a new batch gets the new one'
);
select public.set_admin_kitchen_product('muesli', '{"shelf_life":{"amount":6,"unit":"months"}}');

-- Fixing the made-on day works the number and Exp out again; Undo puts them back.
select set_config('t.fix', public.update_admin_batch(pg_temp.bid('m2'), jsonb_build_object('made_on', to_char(pg_temp.day(2), 'YYYY-MM-DD')))::text, true);
select is(pg_temp.code('m2'), pg_temp.num('M', 2), 'a fixed made-on day: new number');
select is(
  (select expires_on from public.kitchen_batches where id = pg_temp.bid('m2')),
  (pg_temp.day(2) + interval '6 months')::date,
  'a fixed made-on day: Exp worked out again from the shelf life now'
);
select pg_temp.undo(current_setting('t.fix')::jsonb);
select is(pg_temp.code('m2'), pg_temp.num('M', 0) || '-2', 'Undo of the fix: the number for the day it was');

-- A deleted batch comes back with its number.
select set_config('t.del', public.delete_admin_batch(pg_temp.bid('m2'))::text, true);
select is(current_setting('t.del')::jsonb #>> '{batches,0,code}', pg_temp.num('M', 0) || '-2', 'delete effects: the number of the deleted batch');
select pg_temp.undo(current_setting('t.del')::jsonb);
select is(pg_temp.code('m2'), pg_temp.num('M', 0) || '-2', 'Undo of a delete: same number back');

select throws_ok(
  $$insert into public.kitchen_batches (product_id, grams, made_on, code) values ('muesli', 10, public.kitchen_today(), 'nope')$$,
  '23514', null,
  'a number that isn''t in the format is refused'
);

-- ═══ Which batch an order gets ═══════════════════════════════════════════

-- A takes the oldest batch: r1 (made yesterday).
select pg_temp.ord('SN-BTA22', 3, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":2}]');
select is(pg_temp.cover('SN-BTA22'), 'raggi-jaggi:r1=500', 'default: the oldest batch');
select is((select status from public.orders where code = 'SN-BTA22'), 'packing', 'covered, so Packing');

select is(
  (select k #>> '{batches,0,code}'
   from json_array_elements(public.get_admin_order('SN-BTA22') -> 'kitchen') k),
  pg_temp.num('R', 1),
  'the order answer: each batch''s number'
);
select ok(
  (select k #>> '{batches,0,expires_on}' is not null and k #>> '{batches,0,batch_id}' = pg_temp.bid('r1')::text
   from json_array_elements(public.get_admin_order('SN-BTA22') -> 'kitchen') k),
  'the order answer: each batch''s id and Exp'
);

-- Change it to r2.
select set_config('t.sb', pg_temp.set_batch('SN-BTA22', 'raggi-jaggi', 'r2')::text, true);
select is(pg_temp.cover('SN-BTA22'), 'raggi-jaggi:r2=500', 'change batch: all of it now from r2');
select is(pg_temp.spare('r1'), 500, 'change batch: r1 gets its grams back as spare');
select is(pg_temp.spare('r2'), 100, 'change batch: r2 gave 500 g');
select is(
  (current_setting('t.sb')::jsonb #>> '{order,kitchen,0,batches,0,code}'),
  pg_temp.num('R', 0),
  'change batch: the answer carries the order'
);
select ok((current_setting('t.sb')::jsonb ->> 'action_id') is not null, 'change batch: an action to undo');
select is((select status from public.orders where code = 'SN-BTA22'), 'packing', 'change batch: the stage stays');

select pg_temp.undo(current_setting('t.sb')::jsonb);
select is(pg_temp.cover('SN-BTA22'), 'raggi-jaggi:r1=500', 'Undo: back on r1');
select is(pg_temp.spare('r2'), 600, 'Undo: r2 has its grams again');

-- Refusals.
select throws_ok(
  $$select pg_temp.set_batch('SN-BTA22', 'raggi-jaggi', 'r1')$$,
  '22023', 'This already comes from batch ' || pg_temp.num('R', 1) || '.',
  'refused: already from that batch'
);
select throws_ok(
  $$select pg_temp.set_batch('SN-BTA22', 'raggi-jaggi', 'r3')$$,
  '22023', 'Batch ' || pg_temp.num('R', 0) || '-2 has 300 g spare, and this needs 500 g.',
  'refused: not enough spare'
);
select throws_ok(
  $$select pg_temp.set_batch('SN-BTA22', 'raggi-jaggi', 'm1')$$,
  '22023', 'That batch is a different product.',
  'refused: another product''s batch'
);
select throws_ok(
  $$select pg_temp.set_batch('SN-BTA22', 'muesli', 'm1')$$,
  '22023', 'That isn''t on this order.',
  'refused: a product the order doesn''t have'
);

-- Still being cooked: B needs more muesli than there is.
select pg_temp.ord('SN-BTB22', 2, '[{"product_id":"muesli","size":"500 g","quantity":2}]');
select throws_ok(
  $$select pg_temp.set_batch('SN-BTB22', 'muesli', 'm2')$$,
  '22023', 'This is still being cooked. Pick its batch once it''s ready.',
  'refused: still short in Cooking'
);

-- By hand: moved on with nothing cooked, then given a batch.
select pg_temp.move('SN-BTB22', 'packing');
select pg_temp.log('m3', 'muesli', 1000);
select is(pg_temp.cover('SN-BTB22'), 'muesli:m1=400,muesli:m2=100,muesli:hand=500', 'by hand: part of it wasn''t from a batch');
select pg_temp.set_batch('SN-BTB22', 'muesli', 'm3');
select is(pg_temp.cover('SN-BTB22'), 'muesli:m3=1000', 'change batch: the by-hand part comes from the batch too');

select pg_temp.move('SN-BTB22', 'cancelled');
select throws_ok(
  $$select pg_temp.set_batch('SN-BTB22', 'muesli', 'm1')$$,
  '22023', 'A cancelled order has no food to pick a batch for.',
  'refused: cancelled'
);

-- Past food: never for an order that's going out; a delivered one can be put right,
-- and the grams it frees fill a short order.
select pg_temp.log('bp', 'bites', 500, 20);
select pg_temp.ord('SN-BTC22', 2, '[{"product_id":"bites","size":"500 g","quantity":1}]');
select is(pg_temp.cover('SN-BTC22'), 'bites:b1=500', 'past spare never fills');
select throws_ok(
  $$select pg_temp.set_batch('SN-BTC22', 'bites', 'bp')$$,
  '22023', 'Batch ' || pg_temp.num('', 20) || ' is past its Exp date.',
  'refused: past batch for an order in Packing'
);
select pg_temp.move('SN-BTC22', 'ready');
select pg_temp.move('SN-BTC22', 'delivered');
select pg_temp.ord('SN-BTD22', 1, '[{"product_id":"bites","size":"500 g","quantity":1}]');
select is((select status from public.orders where code = 'SN-BTD22'), 'cooking', 'D waits: nothing usable');
select pg_temp.set_batch('SN-BTC22', 'bites', 'bp');
select is(pg_temp.cover('SN-BTC22'), 'bites:bp=500', 'delivered: may be put on a past batch');
select is(pg_temp.cover('SN-BTD22') || ' ' || (select status from public.orders where code = 'SN-BTD22'),
  'bites:b1=500 packing', 'the grams it freed fill the short order');

-- ═══ get_admin_batches ═══════════════════════════════════════════════════

select is(
  (select json_array_length(b -> 'orders') || ' ' || (b #>> '{orders,0,code}') || ' ' || (b #>> '{orders,0,grams}')
     || ' ' || (b #>> '{orders,0,packs,0,size}') || '×' || (b #>> '{orders,0,packs,0,quantity}')
   from json_array_elements(public.get_admin_batches() -> 'batches') b
   where b ->> 'code' = pg_temp.num('R', 1)),
  '1 SN-BTA22 500 250 g×2',
  'batches: who it went to, with grams and packs'
);
select is(
  (select string_agg(b ->> 'code', ' ' order by b ->> 'code') from json_array_elements(public.get_admin_batches(pg_temp.num('R', 0)) -> 'batches') b),
  pg_temp.num('R', 0) || ' ' || pg_temp.num('R', 0) || '-2',
  'batches: search by number'
);
select is(
  (select string_agg(b ->> 'code', ' ') from json_array_elements(public.get_admin_batches('sn-btc') -> 'batches') b),
  pg_temp.num('', 20),
  'batches: search by an order code that got food from it'
);
select is(
  (select count(*)::integer from json_array_elements(public.get_admin_batches(null, 'muesli') -> 'batches') b),
  3,
  'batches: product filter'
);
select is(
  (select json_array_length(public.get_admin_batches(null, null, 2) -> 'batches')::text
     || ' ' || (public.get_admin_batches(null, null, 2) ->> 'more')),
  '2 true',
  'batches: limit and more'
);

select * from finish();
rollback;
