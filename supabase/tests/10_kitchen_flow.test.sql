-- 20260929000000: the kitchen flow. Who can call what, the stage mapping,
-- site orders taking spare, the fill rule (oldest order first, oldest batch
-- first, never past its shelf life), preview, undo, cancel and delete,
-- edits after cooking, batch fixes, moves by hand, used up / thrown out,
-- free sample orders and sample weights. Test data is fake (9198000000xx,
-- example.com) and everything rolls back at the end.
--
-- Calls run as postgres with an admin's claims, so the tests can also read
-- the tables. Dates are relative to today (India), so the file holds on any
-- day.

begin;
create extension if not exists pgtap with schema extensions;

select plan(95);

delete from public.orders;
delete from public.order_rate_limits;
delete from public.kitchen_writeoffs;
delete from public.kitchen_allocations;
delete from public.kitchen_batches;
delete from public.kitchen_actions;
delete from public.admin_users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'someone@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'cook@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

-- ─── Helpers ────────────────────────────────────────────

-- Batches get a short tag when they're logged, so coverage reads as text.
create temp table tags (tag text primary key, id uuid not null);

create function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
$$;

create function pg_temp.clean() returns void language sql as $$
  delete from public.kitchen_writeoffs;
  delete from public.kitchen_allocations;
  delete from public.kitchen_batches;
  delete from public.kitchen_actions;
  delete from public.orders;
  delete from tags;
$$;

create function pg_temp.day(p_ago integer) returns text language sql as $$
  select to_char(public.kitchen_today() - p_ago, 'YYYY-MM-DD');
$$;

create function pg_temp.id(p_code text) returns uuid language sql as $$
  select id from public.orders where code = p_code;
$$;

create function pg_temp.st(p_code text) returns text language sql as $$
  select status from public.orders where code = p_code;
$$;

create function pg_temp.bid(p_tag text) returns uuid language sql as $$
  select id from tags where tag = p_tag;
$$;

-- Logs one batch and tags it.
create function pg_temp.log(p_tag text, p_product text, p_grams integer, p_ago integer default 0)
returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  v := public.log_admin_batches(jsonb_build_array(jsonb_build_object(
    'product_id', p_product, 'grams', p_grams, 'made_on', pg_temp.day(p_ago))))::jsonb;
  insert into tags select p_tag, b.id from public.kitchen_batches b where b.id not in (select id from tags);
  return v;
end;
$$;

-- A hand-added order, p_hours old.
create function pg_temp.ord(p_code text, p_hours integer, p_lines jsonb) returns uuid language sql as $$
  select (public.save_admin_order(null, jsonb_build_object(
    'source', 'call', 'code', p_code, 'name', 'Kitchen Example',
    'created_at', now() - make_interval(hours => p_hours), 'lines', p_lines))::jsonb ->> 'id')::uuid;
$$;

create function pg_temp.move(p_code text, p_status text) returns jsonb language sql as $$
  select public.update_admin_order(pg_temp.id(p_code), jsonb_build_object('status', p_status))::jsonb;
$$;

-- 'raggi-jaggi:k=500,raggi-jaggi:hand=300': batch grams first, by-hand last.
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

-- An effects object's orders as 'SN-X from>to product+grams waiting ...'.
create function pg_temp.moves(e jsonb) returns text[] language sql as $$
  select coalesce(array_agg(
    (o ->> 'code') || ' ' || (o ->> 'from') || '>' || (o ->> 'to')
    || coalesce((
      select ' ' || string_agg((g ->> 'product_id')
        || case when (g ->> 'change')::integer > 0 then '+' else '' end || (g ->> 'change'), ' ')
      from jsonb_array_elements(o -> 'grams') g
    ), '')
    || coalesce((
      select ' waiting ' || string_agg(w #>> '{}', ',') from jsonb_array_elements(o -> 'waiting') w
    ), '')
    order by n
  ), '{}')
  from jsonb_array_elements(e -> 'orders') with ordinality x(o, n);
$$;

-- An effects object's batches as 'tag grams to_orders/spare'.
create function pg_temp.bat(e jsonb) returns text[] language sql as $$
  select coalesce(array_agg(
    coalesce((select t.tag from tags t where t.id = (b ->> 'id')::uuid), '?') || ' ' || (b ->> 'grams') || ' '
    || (b ->> 'to_orders') || '/' || (b ->> 'spare')
    || case when (b ->> 'deleted')::boolean then ' deleted' else '' end
    order by n
  ), '{}')
  from jsonb_array_elements(e -> 'batches') with ordinality x(b, n);
$$;

-- One product in get_admin_kitchen().
create function pg_temp.kp(p_product text) returns jsonb language sql as $$
  select p from jsonb_array_elements(public.get_admin_kitchen()::jsonb -> 'products') p
  where p ->> 'product_id' = p_product;
$$;

-- Everything Undo must put back: statuses, allocations, batches, write-offs.
create function pg_temp.snap() returns jsonb language sql as $$
  select jsonb_build_object(
    'orders', (select jsonb_object_agg(o.code, o.status) from public.orders o),
    'alloc', (select coalesce(jsonb_agg(x.v order by x.v), '[]') from (
      select o.code || ':' || pg_temp.cover(o.code) as v from public.orders o) x),
    'batches', (select coalesce(jsonb_agg(x.v order by x.v), '[]') from (
      select coalesce(t.tag, '?') || '=' || b.grams || '@' || b.made_on as v
      from public.kitchen_batches b left join tags t on t.id = b.id) x),
    'writeoffs', (select coalesce(jsonb_agg(x.v order by x.v), '[]') from (
      select w.id::text || '=' || w.grams as v from public.kitchen_writeoffs w) x)
  );
$$;

-- Drops ids and the preview/action_id keys, which differ by design.
create function pg_temp.strip(j jsonb) returns jsonb language plpgsql as $$
begin
  return case jsonb_typeof(j)
    when 'object' then coalesce((
      select jsonb_object_agg(k, pg_temp.strip(v)) from jsonb_each(j) e(k, v)
      where k not in ('id', 'batch_id', 'action_id', 'preview')), '{}'::jsonb)
    when 'array' then coalesce((
      select jsonb_agg(pg_temp.strip(v) order by n) from jsonb_array_elements(j) with ordinality a(v, n)), '[]'::jsonb)
    else j
  end;
end;
$$;

create function pg_temp.codes(p json) returns jsonb language sql as $$
  select coalesce(jsonb_agg(o ->> 'code' order by n), '[]') from json_array_elements(p -> 'orders') with ordinality t(o, n);
$$;
-- The same, sorted: for orders saved in one transaction (same created_at).
create function pg_temp.codeset(p json) returns jsonb language sql as $$
  select coalesce(jsonb_agg(o ->> 'code' order by o ->> 'code'), '[]') from json_array_elements(p -> 'orders') t(o);
$$;

-- ─── 1. Who can call what ───────────────────────────────

select ok(
  (select bool_and(
      has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute')
      and not has_function_privilege('public', f, 'execute'))
   from unnest(array[
     'public.get_admin_kitchen()', 'public.log_admin_batches(jsonb, boolean)',
     'public.update_admin_batch(uuid, jsonb, boolean)', 'public.delete_admin_batch(uuid, boolean)',
     'public.write_off_admin_spare(uuid, integer, text)', 'public.undo_admin_kitchen(uuid)',
     'public.set_admin_kitchen_product(text, jsonb)', 'public.give_admin_priority(uuid, boolean)'
   ]::regprocedure[]) f),
  'the new kitchen RPCs are for signed-in users only (is_admin inside)'
);

select ok(
  not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'kitchen\_%' or p.proname in (
        'order_clean_lines', 'order_size_grams', 'order_size_label', 'set_order_line_grams',
        'check_free_sample_order', 'refuse_free_sample_payment'))
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
  ),
  'kitchen helpers are not callable from the API'
);

select ok(
  not exists (
    select 1
    from unnest(array['kitchen_products', 'kitchen_batches', 'kitchen_allocations', 'kitchen_writeoffs',
                      'kitchen_actions', 'kitchen_action_steps']) t,
         unnest(array['anon', 'authenticated']) r,
         unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
    where has_table_privilege(r, 'public.' || t, p)
  )
  and (select bool_and(c.relrowsecurity) from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relname like 'kitchen\_%' and c.relkind = 'r')
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename like 'kitchen\_%'),
  'kitchen tables: RLS on, no policies, no privileges for anon or signed-in users'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok('select public.get_admin_kitchen()', 'P0001', 'Unauthorized', 'non-admin: get_admin_kitchen');
select throws_ok($$select public.log_admin_batches('[{"product_id":"muesli","grams":500}]')$$, 'P0001', 'Unauthorized', 'non-admin: log_admin_batches');
select throws_ok($$select public.update_admin_batch(gen_random_uuid(), '{"grams":500}')$$, 'P0001', 'Unauthorized', 'non-admin: update_admin_batch');
select throws_ok('select public.delete_admin_batch(gen_random_uuid())', 'P0001', 'Unauthorized', 'non-admin: delete_admin_batch');
select throws_ok($$select public.write_off_admin_spare(gen_random_uuid(), null, 'used_up')$$, 'P0001', 'Unauthorized', 'non-admin: write_off_admin_spare');
select throws_ok('select public.undo_admin_kitchen(gen_random_uuid())', 'P0001', 'Unauthorized', 'non-admin: undo_admin_kitchen');
select throws_ok($$select public.set_admin_kitchen_product('muesli', '{"sample_grams":25}')$$, 'P0001', 'Unauthorized', 'non-admin: set_admin_kitchen_product');
select throws_ok('select public.give_admin_priority(gen_random_uuid(), true)', 'P0001', 'Unauthorized', 'non-admin: give_admin_priority');
reset role;

select pg_temp.as_owner();

-- ─── 2. The migration ───────────────────────────────────

select results_eq(
  $$select public.kitchen_migrated_status(s, stale) from (values
      ('new', false), ('new', true), ('confirmed', false), ('sent', false), ('delivered', false), ('cancelled', false)
    ) as t(s, stale)$$,
  $$values ('cooking'::text), ('cancelled'), ('cooking'), ('ready'), ('delivered'), ('cancelled')$$,
  'old stages: new and confirmed cook, sent is ready, a stale site order is cancelled, the rest keep theirs'
);

select results_eq(
  $$select product_id, sample_grams, shelf_life_amount, shelf_life_unit from public.kitchen_products order by product_id$$,
  $$values ('bites'::text, 15, 15, 'days'::text), ('muesli', 20, 6, 'months'), ('raggi-jaggi', 20, 6, 'months')$$,
  'starting sample weights and shelf lives'
);

-- ─── 3. Website orders take spare ───────────────────────

select pg_temp.log('s1', 'bites', 600, 2);

set local role anon;
select public.submit_order('SN-KSA22', '[{"product_id":"bites","size":"250 g","quantity":2}]', 'Site Example', '415001');
select public.submit_order('SN-KSB22',
  '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1},{"product_id":"bites","size":"250 g","quantity":1}]',
  'Site Example', '415002');
reset role;

select results_eq(
  $$select e.event, e.auto from public.order_events e where e.order_id = pg_temp.id('SN-KSA22') order by e.id$$,
  $$values ('created'::text, false), ('packing', true)$$,
  'a site order covered by spare skips Cooking, and its history says it moved by itself'
);

select is(
  pg_temp.st('SN-KSB22') || ' ' || pg_temp.cover('SN-KSB22'),
  'cooking bites:s1=100',
  'a site order not fully covered lands in Cooking with what spare there was'
);

set local role anon;
select throws_ok(
  $$select public.submit_order('SN-KSC22', '[{"product_id":"bites","size":"sample","quantity":1}]', 'Site Example', '415001')$$,
  '22023', 'One of the items doesn''t look right.', 'the site still cannot order a sample'
);
reset role;

-- ─── 4. The fill: oldest order first, oldest batch first ─

select pg_temp.clean();
select pg_temp.ord('SN-KFA22', 72, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KFB22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KFC22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');

-- Two batches in one go: today's, and a backdated one from 5 days ago.
select set_config('t.fifo', public.log_admin_batches(jsonb_build_array(
  jsonb_build_object('product_id', 'raggi-jaggi', 'grams', 900),
  jsonb_build_object('product_id', 'raggi-jaggi', 'grams', 300, 'made_on', pg_temp.day(5))
))::text, true);
insert into tags select case b.grams when 300 then 'old' else 'new' end, b.id from public.kitchen_batches b;

select results_eq(
  $$select code, status, pg_temp.cover(code) from public.orders order by created_at$$,
  $$values ('SN-KFA22'::text, 'packing'::text, 'raggi-jaggi:new=200,raggi-jaggi:old=300'::text),
           ('SN-KFB22', 'packing', 'raggi-jaggi:new=500'),
           ('SN-KFC22', 'cooking', 'raggi-jaggi:new=200')$$,
  'the oldest order fills first, from the oldest batch first (by made-on day, so the backdated one)'
);

select is(
  jsonb_build_object('orders', pg_temp.moves(current_setting('t.fifo')::jsonb),
                     'batches', pg_temp.bat(current_setting('t.fifo')::jsonb)),
  jsonb_build_object(
    'orders', array['SN-KFA22 cooking>packing raggi-jaggi+500', 'SN-KFB22 cooking>packing raggi-jaggi+500',
                    'SN-KFC22 cooking>cooking raggi-jaggi+200 waiting raggi-jaggi'],
    'batches', array['old 300 300/0', 'new 900 900/0']),
  'effects: who moved, the grams each got, who still waits, and each batch''s use'
);

select is(
  (select jsonb_build_object('to_cook', p -> 'to_cook', 'waiting_packs', p -> 'waiting_packs',
     'queue', (select jsonb_agg(jsonb_build_object('code', q -> 'code', 'short', q -> 'short', 'also_waiting', q -> 'also_waiting'))
               from jsonb_array_elements(p -> 'queue') q))
   from pg_temp.kp('raggi-jaggi') p),
  '{"to_cook":300,"waiting_packs":[{"size":"500 g","grams_each":500,"packs":1}],
    "queue":[{"code":"SN-KFC22","short":300,"also_waiting":[]}]}'::jsonb,
  'kitchen: what is still to cook, as packs and as the people waiting'
);

-- Spare past its shelf life stays on the shelf but never fills an order,
-- even though it's the oldest. Date Bites keep 15 days.
select pg_temp.log('past', 'bites', 500, 20);
select pg_temp.log('near', 'bites', 400, 12);
select pg_temp.ord('SN-KFD22', 0, '[{"product_id":"bites","size":"250 g","quantity":1}]');

select is(
  pg_temp.st('SN-KFD22') || ' ' || pg_temp.cover('SN-KFD22'),
  'packing bites:near=250',
  'past-expiry spare is skipped; the next batch fills the order'
);

select is(
  (select jsonb_build_object('spare', p -> 'spare', 'shelf', (
     select jsonb_agg(jsonb_build_object('grams', b -> 'grams', 'state', b -> 'state', 'days_left', b -> 'days_left') order by n)
     from jsonb_array_elements(p -> 'spare_batches') with ordinality x(b, n)))
   from pg_temp.kp('bites') p),
  '{"spare":150,"shelf":[{"grams":500,"state":"past","days_left":-5},{"grams":150,"state":"near","days_left":3}]}'::jsonb,
  'kitchen: usable spare leaves out past batches, which still show with their state'
);

select throws_ok(
  $$select public.log_admin_batches(jsonb_build_array(jsonb_build_object('product_id', 'muesli', 'grams', 500, 'made_on', pg_temp.day(-1))))$$,
  '22023', 'A batch can''t be made in the future.', 'made-on: not after today'
);
select throws_ok(
  $$select public.log_admin_batches(jsonb_build_array(jsonb_build_object('product_id', 'muesli', 'grams', 500, 'made_on', pg_temp.day(61))))$$,
  '22023', 'That''s more than 60 days ago. Pick a later day.', 'made-on: at most 60 days back'
);

-- ─── 5. An order moves only when every product is covered ─

select pg_temp.clean();
select pg_temp.ord('SN-KMA22', 24,
  '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1},{"product_id":"muesli","size":"250 g","quantity":1}]');
select pg_temp.log('m1', 'raggi-jaggi', 250);

select is(
  (select jsonb_build_object('status', o.status, 'kitchen', public.admin_order_json(o)::jsonb -> 'kitchen')
   from public.orders o where o.code = 'SN-KMA22'),
  format('{"status":"cooking","kitchen":[
     {"product_id":"muesli","need":250,"covered":0,"by_hand":0,"waiting":true,"batches":[]},
     {"product_id":"raggi-jaggi","need":250,"covered":250,"by_hand":0,"waiting":false,
      "batches":[{"made_on":"%s","grams":250}]}]}', pg_temp.day(0))::jsonb,
  'half covered: stays in Cooking, and the order says which product waits'
);

select is(
  (select jsonb_build_object('also_waiting', q -> 'also_waiting', 'covered', q -> 'covered')
   from pg_temp.kp('muesli') p, jsonb_array_elements(p -> 'queue') q where q ->> 'code' = 'SN-KMA22'),
  '{"also_waiting":[],"covered":["raggi-jaggi"]}'::jsonb,
  'the queue says the order is only waiting on this product'
);

select pg_temp.log('m2', 'muesli', 250);
select is(pg_temp.st('SN-KMA22'), 'packing', 'covered on every product: Packing');

-- ─── 6. Preview is the real thing, rolled back; Undo ────

select pg_temp.clean();
select pg_temp.ord('SN-KPA22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KPB22', 24,
  '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1},{"product_id":"muesli","size":"250 g","quantity":1}]');
select set_config('t.before', pg_temp.snap()::text, true);
select set_config('t.events', (select count(*)::text from public.order_events), true);

select set_config('t.prev', public.log_admin_batches('[{"product_id":"raggi-jaggi","grams":800}]', true)::text, true);

select ok(
  pg_temp.snap() = current_setting('t.before')::jsonb
  and not exists (select 1 from public.kitchen_actions)
  and (select count(*) from public.order_events)::text = current_setting('t.events')
  and current_setting('t.prev')::jsonb -> 'preview' = 'true'
  and current_setting('t.prev')::jsonb -> 'action_id' = 'null',
  'preview leaves nothing behind: no batch, no allocation, no status change, no history, no action'
);

select set_config('t.commit', pg_temp.log('p', 'raggi-jaggi', 800)::text, true);

select is(
  pg_temp.moves(current_setting('t.commit')::jsonb),
  array['SN-KPA22 cooking>packing raggi-jaggi+500', 'SN-KPB22 cooking>cooking raggi-jaggi+300 waiting muesli,raggi-jaggi'],
  'the commit fills the older order and part of the next'
);

select is(
  pg_temp.strip(current_setting('t.prev')::jsonb),
  pg_temp.strip(current_setting('t.commit')::jsonb),
  'the preview said exactly what the commit did, kitchen included'
);

select is(
  public.undo_admin_kitchen((current_setting('t.commit')::jsonb ->> 'action_id')::uuid)::jsonb -> 'undone',
  'true'::jsonb,
  'undo'
);
select is(pg_temp.snap(), current_setting('t.before')::jsonb, 'undo puts back every status, allocation and batch');

select ok(
  (public.undo_admin_kitchen((current_setting('t.commit')::jsonb ->> 'action_id')::uuid)::jsonb -> 'undone') = 'true'
  and pg_temp.snap() = current_setting('t.before')::jsonb,
  'a second undo does nothing'
);

-- ─── 7. Undo of a cancel that moved another order ───────

select pg_temp.clean();
select pg_temp.ord('SN-KXA22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KYA22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('x', 'raggi-jaggi', 500);
select set_config('t.before', pg_temp.snap()::text, true);

select set_config('t.cancel', pg_temp.move('SN-KXA22', 'cancelled')::text, true);

select is(
  pg_temp.moves(current_setting('t.cancel')::jsonb -> 'kitchen_effects'),
  array['SN-KXA22 packing>cancelled raggi-jaggi-500', 'SN-KYA22 cooking>packing raggi-jaggi+500'],
  'cancel: its grams go back and fill the next order at once, and the answer says so'
);

select lives_ok(
  $$select public.undo_admin_kitchen((current_setting('t.cancel')::jsonb #>> '{kitchen_effects,action_id}')::uuid)$$,
  'undo the cancel'
);
select is(pg_temp.snap(), current_setting('t.before')::jsonb, 'undo of the cancel puts both orders back exactly');

select set_config('t.log', pg_temp.log('y', 'raggi-jaggi', 500)::text, true);
select is(
  pg_temp.move('SN-KYA22', 'ready') -> 'kitchen_effects',
  'null'::jsonb,
  'Packing to Ready changes nothing in the kitchen: no kitchen_effects'
);

select throws_ok(
  $$select public.undo_admin_kitchen((current_setting('t.log')::jsonb ->> 'action_id')::uuid)$$,
  '22023', 'Something changed since, so this can''t be undone.',
  'undo is refused once an order it moved has moved on'
);
select is(
  pg_temp.st('SN-KYA22') || ' ' || pg_temp.cover('SN-KYA22'),
  'ready raggi-jaggi:y=500',
  'the refused undo changed nothing'
);
select throws_ok(
  'select public.undo_admin_kitchen(gen_random_uuid())',
  '22023', 'That can''t be undone any more.', 'undo of an unknown or purged action'
);

-- ─── 8. Cancel and delete ───────────────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KQA22', 24, '[{"product_id":"bites","size":"250 g","quantity":1}]');
select pg_temp.log('q', 'bites', 400, 3);
select pg_temp.move('SN-KQA22', 'cancelled');

select is(
  (select jsonb_agg(jsonb_build_object('made_on', b -> 'made_on', 'grams', b -> 'grams'))
   from jsonb_array_elements(pg_temp.kp('bites') -> 'spare_batches') b),
  jsonb_build_array(jsonb_build_object('made_on', public.kitchen_today() - 3, 'grams', 400)),
  'cancel from Packing: the grams are spare again, with the batch''s own made-on day'
);

select pg_temp.ord('SN-KDA22', 0, '[{"product_id":"bites","size":"250 g","quantity":1}]');
select pg_temp.move('SN-KDA22', 'ready');
select pg_temp.move('SN-KDA22', 'delivered');
select pg_temp.move('SN-KDA22', 'cancelled');

select is(
  pg_temp.cover('SN-KDA22') || ' spare ' || pg_temp.spare('q'),
  'bites:q=250 spare 150',
  'cancel after delivery returns nothing: the food left'
);

select public.delete_admin_order(pg_temp.id('SN-KDA22'));
select ok(
  pg_temp.spare('q') = 150
  and (select array_agg(w.grams || ' ' || w.reason) from public.kitchen_writeoffs w) = array['250 used_up'],
  'deleting it records its batch grams as used up, so spare does not grow'
);

-- ─── 9. Edits after cooking ─────────────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KEA22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('e', 'raggi-jaggi', 500);
select public.save_admin_order(pg_temp.id('SN-KEA22'),
  '{"name":"Kitchen Example","lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":2}]}');

select is(
  (select jsonb_build_object('status', o.status, 'cover', pg_temp.cover(o.code), 'kitchen', public.admin_order_json(o)::jsonb -> 'kitchen')
   from public.orders o where o.code = 'SN-KEA22'),
  format('{"status":"cooking","cover":"raggi-jaggi:e=500",
    "kitchen":[{"product_id":"raggi-jaggi","need":1000,"covered":500,"by_hand":0,"waiting":true,
      "batches":[{"made_on":"%s","grams":500}]}]}', pg_temp.day(0))::jsonb,
  'a pack added after cooking: back to Cooking, waiting only for the missing part'
);

select pg_temp.ord('SN-KEF22', 24, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":2}]');
select pg_temp.ord('SN-KEG22', 0, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]');
select pg_temp.log('f', 'raggi-jaggi', 1000);
select public.save_admin_order(pg_temp.id('SN-KEF22'),
  '{"name":"Kitchen Example","lines":[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]}');

select results_eq(
  $$select code, status, pg_temp.cover(code) from public.orders order by created_at$$,
  $$values ('SN-KEA22'::text, 'packing'::text, 'raggi-jaggi:e=500,raggi-jaggi:f=500'::text),
           ('SN-KEF22', 'packing', 'raggi-jaggi:f=250'),
           ('SN-KEG22', 'packing', 'raggi-jaggi:f=250')$$,
  'need went down: the extra goes back and fills the next waiting order'
);

-- ─── 10. Fixing and deleting a batch ────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KHA22', 72, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KHB22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KHC22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('k', 'raggi-jaggi', 1500);
select pg_temp.move('SN-KHC22', 'ready');

select set_config('t.fix', public.update_admin_batch(pg_temp.bid('k'), '{"grams":700}')::text, true);

select results_eq(
  $$select code, status, pg_temp.cover(code) from public.orders order by created_at$$,
  $$values ('SN-KHA22'::text, 'packing'::text, 'raggi-jaggi:k=500'::text),
           ('SN-KHB22', 'cooking', 'raggi-jaggi:k=200'),
           ('SN-KHC22', 'ready', 'raggi-jaggi:hand=500')$$,
  'a batch fixed smaller takes back from the youngest orders: Ready keeps its food by hand, Packing goes back to Cooking'
);

select is(
  jsonb_build_object('orders', pg_temp.moves(current_setting('t.fix')::jsonb),
                     'batches', pg_temp.bat(current_setting('t.fix')::jsonb)),
  jsonb_build_object(
    'orders', array['SN-KHB22 packing>cooking raggi-jaggi-300 waiting raggi-jaggi', 'SN-KHC22 ready>ready raggi-jaggi-500'],
    'batches', array['k 700 700/0']),
  'the fix says what it took back from whom'
);

select set_config('t.before', pg_temp.snap()::text, true);
select set_config('t.del', public.delete_admin_batch(pg_temp.bid('k'))::text, true);

select results_eq(
  $$select code, status, pg_temp.cover(code) from public.orders order by created_at$$,
  $$values ('SN-KHA22'::text, 'cooking'::text, ''::text),
           ('SN-KHB22', 'cooking', ''),
           ('SN-KHC22', 'ready', 'raggi-jaggi:hand=500')$$,
  'deleting the batch takes back the rest'
);

select lives_ok(
  $$select public.undo_admin_kitchen((current_setting('t.del')::jsonb ->> 'action_id')::uuid)$$,
  'undo the delete'
);
select is(pg_temp.snap(), current_setting('t.before')::jsonb, 'undo brings the batch and its allocations back');

-- ─── 11. Moving by hand ─────────────────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KKA22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('kk', 'raggi-jaggi', 200);
select set_config('t.hand', pg_temp.move('SN-KKA22', 'packing')::text, true);

select ok(
  pg_temp.cover('SN-KKA22') = 'raggi-jaggi:kk=200,raggi-jaggi:hand=300'
  and current_setting('t.hand')::jsonb #>> '{kitchen_effects,action_id}' is not null,
  'out of Cooking by hand: the short part is covered by hand, and it can be undone'
);

select pg_temp.move('SN-KKA22', 'cooking');
select is(
  pg_temp.st('SN-KKA22') || ' ' || pg_temp.cover('SN-KKA22'),
  'cooking raggi-jaggi:kk=200',
  'back to Cooking by hand drops only the by-hand part'
);

select pg_temp.ord('SN-KNA22', 0, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('nn', 'raggi-jaggi', 800);
select throws_ok(
  $$select pg_temp.move('SN-KNA22', 'cooking')$$,
  '22023', 'Its food is already logged. Undo, or fix the batch.',
  'back to Cooking is refused when batches cover it all'
);

-- ─── 12. Used up / thrown out ───────────────────────────

select pg_temp.clean();
select pg_temp.log('w', 'raggi-jaggi', 500);

select public.write_off_admin_spare(pg_temp.bid('w'), 100, 'used_up');
select is(pg_temp.spare('w'), 400, 'with nobody set as cook, any admin can mark spare used up');

select throws_ok(
  $$select public.write_off_admin_spare(pg_temp.bid('w'), 500, 'thrown_out')$$,
  '22023', 'There''s only 400 g spare in that batch.', 'no more than what is spare'
);

insert into public.admin_users (id, email, display_name, home_view)
values ('00000000-0000-4000-8000-000000000003', 'cook@example.com', 'Cook', 'cook');

select throws_ok(
  $$select public.write_off_admin_spare(pg_temp.bid('w'), null, 'thrown_out')$$,
  '22023', 'Only the cook marks spare as used up or thrown out.', 'with a cook set, others cannot'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('t.wo', public.write_off_admin_spare(pg_temp.bid('w'), null, 'thrown_out')::text, true);
select is(pg_temp.spare('w'), 0, 'the cook can: null means all of the batch''s spare');

select public.undo_admin_kitchen((current_setting('t.wo')::jsonb ->> 'action_id')::uuid);
select is(pg_temp.spare('w'), 400, 'and undo it');
select pg_temp.as_owner();

-- ─── 13. Free sample orders ─────────────────────────────

select pg_temp.clean();
select set_config('t.fs', public.save_admin_order(null, '{
  "source":"in_person","code":"SN-KZA22","name":"Anil Example","phone":"919800000099",
  "lines":[{"product_id":"raggi-jaggi","size":"sample","quantity":1},{"product_id":"bites","size":"sample","quantity":1}]
}')::text, true);

select is(
  current_setting('t.fs')::jsonb - array['id', 'code', 'message_code', 'source', 'name', 'phone', 'pincode', 'note', 'coupon',
    'customer', 'created_at', 'updated_at', 'status_changed_at', 'payments', 'paid_at', 'paid_method', 'paid_note', 'kitchen'],
  '{"status":"cooking","free_sample":true,"priority":false,"paid":false,"payment_state":"not_paid","amount":null,"amount_paid":0,
    "amount_due":null,"amount_extra":null,"packs":0,"samples":2,
    "lines":[{"product_id":"bites","size":"sample","quantity":1,"grams_each":15},
             {"product_id":"raggi-jaggi","size":"sample","quantity":1,"grams_each":20}]}'::jsonb,
  'samples only: a free sample order, each sample at its product''s weight'
);

select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Anil Example","amount":100,"lines":[{"product_id":"bites","size":"sample","quantity":1}]}')$$,
  '22023', 'A free sample order has no total.', 'free sample: no total'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Anil Example","coupon":"EXAMPLE10","lines":[{"product_id":"bites","size":"sample","quantity":1}]}')$$,
  '22023', 'A free sample order has no coupon.', 'free sample: no coupon'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Anil Example","paid":true,"lines":[{"product_id":"bites","size":"sample","quantity":1}]}')$$,
  '22023', 'A free sample order has nothing to pay.', 'free sample: not paid on create'
);
select throws_ok(
  $$select public.pay_admin_order_rest(pg_temp.id('SN-KZA22'), '{"method":"cash"}')$$,
  '22023', 'A free sample order has nothing to pay.', 'free sample: no Mark paid'
);
select throws_ok(
  $$select public.update_admin_order(pg_temp.id('SN-KZA22'), '{"amount":50}')$$,
  '22023', 'A free sample order has no total.', 'free sample: no total later either'
);

select public.save_admin_order(null, '{
  "source":"call","code":"SN-KZB22","name":"Anil Example","phone":"919800000099","amount":300,"status":"delivered",
  "lines":[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]
}');
select pg_temp.move('SN-KZA22', 'delivered');
-- A paid order with a free taster riding along: in the Free samples list,
-- but still money like any order.
select public.save_admin_order(null, '{
  "source":"call","code":"SN-KZC22","name":"Anil Example","phone":"919800000099","amount":250,"status":"ready",
  "lines":[{"product_id":"muesli","size":"250 g","quantity":1},{"product_id":"bites","size":"sample","quantity":1}]
}');

select is(
  jsonb_build_object(
    'todo', pg_temp.codeset(public.get_admin_orders()),
    'done', pg_temp.codes(public.get_admin_orders(p_view => 'done')),
    'only', pg_temp.codes(public.get_admin_orders(p_view => 'all', p_free_sample => true)),
    'without', pg_temp.codeset(public.get_admin_orders(p_view => 'all', p_free_sample => false)),
    'samples', pg_temp.codeset(public.get_admin_orders(p_view => 'all', p_samples => true)),
    'no_samples', pg_temp.codes(public.get_admin_orders(p_view => 'all', p_samples => false))),
  '{"todo":["SN-KZB22","SN-KZC22"],"done":["SN-KZA22"],"only":["SN-KZA22"],"without":["SN-KZB22","SN-KZC22"],
    "samples":["SN-KZA22","SN-KZC22"],"no_samples":["SN-KZB22"]}'::jsonb,
  'a delivered free sample order is done with nothing to collect; p_free_sample picks out sample-only orders, p_samples every order carrying one'
);

select is(
  (select jsonb_build_object(
     'to_collect', o #> '{queue,to_collect,count}', 'free_samples', o #> '{queue,free_samples}',
     'done', o #> '{done,free_samples}')
   from (select public.get_admin_overview()::jsonb as o) x),
  '{"to_collect":1,"free_samples":{"open":1,"sent_this_month":1,"grams_this_month":35},"done":1}'::jsonb,
  'overview: only the paid-for order is to collect; the taster on its way is open, the sample order sent this month'
);

select is(
  (select jsonb_build_object('orders', c -> 'orders', 'delivered', c -> 'delivered', 'open', c -> 'open', 'samples', c -> 'samples')
   from jsonb_array_elements(public.get_admin_customers()::jsonb -> 'customers') c),
  '{"orders":2,"delivered":1,"open":2,"samples":1}'::jsonb,
  'customers: a free sample order is not an order, it shows as samples'
);

select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Anil Example","lines":[{"product_id":"saffron","size":"sample","quantity":1}]}')$$,
  '22023', 'That product has no sample weight yet. Set one on the Products page.', 'a sample needs its product''s weight'
);

-- ─── 14. A sample keeps the weight it was saved with ────

select pg_temp.clean();
select pg_temp.ord('SN-KSS22', 24,
  '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1},{"product_id":"raggi-jaggi","size":"sample","quantity":1}]');
select pg_temp.log('s', 'raggi-jaggi', 520);
select public.set_admin_kitchen_product('raggi-jaggi', '{"sample_grams":30}');
select public.save_admin_order(pg_temp.id('SN-KSS22'), '{"name":"Kitchen Example","note":"Ring twice",
  "lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":1},{"product_id":"raggi-jaggi","size":"sample","quantity":1}]}');
select pg_temp.ord('SN-KST22', 0, '[{"product_id":"raggi-jaggi","size":"sample","quantity":1}]');

select is(
  jsonb_build_object(
    'kept', pg_temp.st('SN-KSS22'),
    'old_sample', (select grams_each from public.order_lines where order_id = pg_temp.id('SN-KSS22') and size = 'sample'),
    'new_sample', (select grams_each from public.order_lines where order_id = pg_temp.id('SN-KST22') and size = 'sample')),
  '{"kept":"packing","old_sample":20,"new_sample":30}'::jsonb,
  'a new sample weight applies to new lines; an edited order keeps its old weight and stays in Packing'
);

select throws_ok(
  $$select public.set_admin_kitchen_product('raggi-jaggi', '{"sample_grams":0}')$$,
  '22023', 'A sample is 1 g to 500 g.', 'sample weight: 1 g to 500 g'
);

-- ─── 15. Home: the kitchen and grams made ───────────────

select pg_temp.clean();
select pg_temp.log('t1', 'raggi-jaggi', 700, 0);
select pg_temp.log('t2', 'raggi-jaggi', 300, 20);

select pg_temp.ord('SN-KHA22', 5, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]');
select pg_temp.ord('SN-KHB22', 4, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]');
select is(
  (select jsonb_agg(jsonb_build_array(b -> 'grams', b -> 'to_orders', b -> 'orders') order by b ->> 'grams')
   from jsonb_array_elements(public.get_admin_kitchen()::jsonb -> 'batches') b),
  '[[300,300,2],[700,200,1]]'::jsonb,
  'each logged batch says how many orders its food went to (the older batch first)'
);

select is(
  (select jsonb_build_object(
     'same_kitchen', t -> 'kitchen' = public.get_admin_kitchen()::jsonb,
     'this', t #> '{weeks,this,grams_made}', 'last', t #> '{weeks,last,grams_made}')
   from (select public.get_admin_totals()::jsonb as t) x),
  '{"same_kitchen":true,"this":700,"last":0}'::jsonb,
  'totals carry the kitchen as get_admin_kitchen gives it, and grams made by made-on week'
);

-- ─── 16. The safety net ─────────────────────────────────

select pg_temp.ord('SN-KVA22', 0, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]');
set constraints public.trg_kitchen_allocations_room immediate;
select throws_ok(
  $$update public.kitchen_allocations set grams = 5000 where order_id = pg_temp.id('SN-KVA22')$$,
  '23514', 'A batch can''t give out more than it holds.', 'a batch can never give out more than it holds'
);
set constraints public.trg_kitchen_allocations_room deferred;

-- ─── 17. Commit-time checks run as the caller's role ────
-- The deferred batch check fires at commit, after the RPC has returned, as
-- the caller (a signed-in admin, or anon on the site). SET CONSTRAINTS ...
-- IMMEDIATE fires the pending checks right here, as the current role.

select pg_temp.clean();
set local role authenticated;
select lives_ok(
  $$select public.log_admin_batches('[{"product_id":"muesli","grams":300}]')$$,
  'a signed-in admin logs a batch'
);
select lives_ok($$set constraints all immediate$$, 'its batch check passes at commit, as the admin');
set constraints all deferred;
reset role;

set local role anon;
select lives_ok(
  $$select public.submit_order('SN-KXA22', '[{"product_id":"muesli","size":"250 g","quantity":1}]', 'Web Example', '415001')$$,
  'a website order that takes spare'
);
select lives_ok($$set constraints all immediate$$, 'its batch check passes at commit, as anon');
set constraints all deferred;
reset role;
select is(pg_temp.st('SN-KXA22'), 'packing', 'the website order took the spare and went to Packing');

-- A write-off as the cook: its check must also hold at commit.
select set_config('t.kxb', (select b.id::text from public.kitchen_batches b where b.product_id = 'muesli'), true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$select public.write_off_admin_spare(current_setting('t.kxb')::uuid, null, 'used_up')$$,
  'the cook marks the last 50 g used up'
);
select lives_ok($$set constraints all immediate$$, 'its batch check passes at commit, as the cook');
set constraints all deferred;
reset role;
select pg_temp.as_owner();

-- ─── 18. Priority: skip the line ────────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KPA22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KPB22', 2, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select set_config('t.pb', public.update_admin_order(pg_temp.id('SN-KPB22'), '{"priority":true}')::text, true);

select is(
  jsonb_build_object(
    'priority', current_setting('t.pb')::jsonb -> 'priority',
    'effects', current_setting('t.pb')::jsonb -> 'kitchen_effects',
    'queue', (select jsonb_agg(jsonb_build_array(q ->> 'code', q -> 'priority'))
              from jsonb_array_elements(pg_temp.kp('raggi-jaggi') -> 'queue') q)),
  '{"priority":true,"effects":null,"queue":[["SN-KPB22",true],["SN-KPA22",false]]}'::jsonb,
  'priority: the queue puts it first; nothing to give yet, so no kitchen effects'
);

select is(
  pg_temp.moves(public.log_admin_batches('[{"product_id":"raggi-jaggi","grams":500}]', true)::jsonb),
  array['SN-KPB22 cooking>packing raggi-jaggi+500'],
  'the preview gives the batch to the newer priority order'
);

select set_config('t.p1', public.log_admin_batches('[{"product_id":"raggi-jaggi","grams":500}]')::text, true);
select is(
  jsonb_build_object('a', pg_temp.st('SN-KPA22'), 'b', pg_temp.st('SN-KPB22')),
  '{"a":"cooking","b":"packing"}'::jsonb,
  'a newer priority order is filled before an older normal one'
);

select public.undo_admin_kitchen((current_setting('t.p1')::jsonb ->> 'action_id')::uuid);
select is(
  (select jsonb_build_object('a', pg_temp.st('SN-KPA22'), 'b', pg_temp.st('SN-KPB22'), 'b_priority', o.priority,
     'batches', (select count(*) from public.kitchen_batches))
   from public.orders o where o.code = 'SN-KPB22'),
  '{"a":"cooking","b":"cooking","b_priority":true,"batches":0}'::jsonb,
  'undo of that batch is exact: both back in Cooking, the batch gone, priority kept'
);

-- A priority order still short takes food a non-priority Cooking order
-- holds (it waits for the next batch instead). Undo puts it back exactly.
select public.update_admin_order(pg_temp.id('SN-KPB22'), '{"priority":false}');
select pg_temp.log('p2', 'raggi-jaggi', 300);
select pg_temp.ord('SN-KPC22', 1, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select set_config('t.snap', pg_temp.snap()::text, true);
select set_config('t.pc', public.update_admin_order(pg_temp.id('SN-KPC22'), '{"priority":true}')::text, true);

select is(
  jsonb_build_object('a', pg_temp.cover('SN-KPA22'), 'c', pg_temp.cover('SN-KPC22'),
    'moves', pg_temp.moves(current_setting('t.pc')::jsonb -> 'kitchen_effects'),
    'undoable', current_setting('t.pc')::jsonb #>> '{kitchen_effects,action_id}' is not null),
  '{"a":"","c":"raggi-jaggi:p2=300","undoable":true,
    "moves":["SN-KPA22 cooking>cooking raggi-jaggi-300 waiting raggi-jaggi","SN-KPC22 cooking>cooking raggi-jaggi+300 waiting raggi-jaggi"]}'::jsonb,
  'priority takes food a Cooking order holds, and says so'
);

select public.undo_admin_kitchen((current_setting('t.pc')::jsonb #>> '{kitchen_effects,action_id}')::uuid);
select is(
  jsonb_build_object('same', pg_temp.snap() = current_setting('t.snap')::jsonb,
    'priority', (select o.priority from public.orders o where o.code = 'SN-KPC22')),
  '{"same":true,"priority":false}'::jsonb,
  'undo of setting priority is exact: the food goes back and priority is off'
);

select public.save_admin_order(null, '{"source":"call","code":"SN-KPE22","name":"Kitchen Example","priority":true,
  "lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}');
select public.save_admin_order(pg_temp.id('SN-KPB22'), '{"name":"Kitchen Example","priority":true,
  "lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]}');
select is(
  (select jsonb_object_agg(o.code, o.priority) from public.orders o where o.code in ('SN-KPE22', 'SN-KPB22', 'SN-KPC22')),
  '{"SN-KPE22":true,"SN-KPB22":true,"SN-KPC22":false}'::jsonb,
  'Add order and Edit set priority; an edit without the key keeps it'
);
select public.save_admin_order(pg_temp.id('SN-KPC22'), '{"name":"Kitchen Example",
  "lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]}');
select is((select o.priority from public.orders o where o.code = 'SN-KPB22'), true, 'still priority after another order''s edit');

-- ─── 19. Priority takes from Cooking orders, newest first ─

select pg_temp.clean();
select pg_temp.ord('SN-KQA22', 60, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1},{"product_id":"muesli","size":"250 g","quantity":1}]');
select pg_temp.ord('SN-KQB22', 50, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KQC22', 40, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1},{"product_id":"muesli","size":"250 g","quantity":1}]');
select pg_temp.log('q1', 'raggi-jaggi', 1500);
select pg_temp.ord('SN-KQP22', 1, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]');
select set_config('t.snap', pg_temp.snap()::text, true);
select set_config('t.qp', public.update_admin_order(pg_temp.id('SN-KQP22'), '{"priority":true}')::text, true);

select is(
  jsonb_build_object(
    'older_cooking', pg_temp.cover('SN-KQA22'), 'packing_untouched', pg_temp.st('SN-KQB22') || ' ' || pg_temp.cover('SN-KQB22'),
    'newest_cooking', pg_temp.cover('SN-KQC22'), 'priority', pg_temp.st('SN-KQP22') || ' ' || pg_temp.cover('SN-KQP22')),
  '{"older_cooking":"raggi-jaggi:q1=500","packing_untouched":"packing raggi-jaggi:q1=500",
    "newest_cooking":"raggi-jaggi:q1=250","priority":"packing raggi-jaggi:q1=250"}'::jsonb,
  'it takes from the newest Cooking order first, never on its own from Packing, and the priority order moves on'
);

select public.undo_admin_kitchen((current_setting('t.qp')::jsonb #>> '{kitchen_effects,action_id}')::uuid);
select is(pg_temp.snap(), current_setting('t.snap')::jsonb, 'undo is exact');

-- ─── 20. Packed pouches: ask first ──────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KRA22', 60, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KRB22', 50, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KRC22', 40, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":2}]');
select pg_temp.log('r1', 'raggi-jaggi', 1500);
select pg_temp.move('SN-KRB22', 'ready');
select is(
  public.get_admin_overview()::jsonb #>> '{queue,ready,oldest,code}', 'SN-KRB22',
  'the overview names the order that has waited longest in Ready'
);
select public.save_admin_order(null, '{"source":"call","code":"SN-KRD22","name":"Kitchen Example","status":"delivered",
  "created_at":"2026-01-01T10:00:00Z","lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]}');
select public.save_admin_order(null, '{"source":"call","code":"SN-KRP22","name":"Priority Example","priority":true,
  "lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]}');
select set_config('t.snap', pg_temp.snap()::text, true);

select is(
  (select jsonb_build_object(
     'stays', pg_temp.st('SN-KRP22'),
     'pouches', (select jsonb_agg(jsonb_build_array(x ->> 'code', x ->> 'from', x ->> 'size', x -> 'count'))
                 from jsonb_array_elements(e -> 'pouches') x),
     'preview', e -> 'preview', 'action', e -> 'action_id')
   from (select public.give_admin_priority(pg_temp.id('SN-KRP22'), true)::jsonb as e) y),
  '{"stays":"cooking","pouches":[["SN-KRB22","ready","500 g",1]],"preview":true,"action":null}'::jsonb,
  'packed food is only offered: the newest same-size pouch (not the 250 g ones, never the delivered order)'
);
select is(pg_temp.snap(), current_setting('t.snap')::jsonb, 'asking changes nothing');

select set_config('t.give', public.give_admin_priority(pg_temp.id('SN-KRP22'))::text, true);
select is(
  jsonb_build_object(
    'gave', pg_temp.st('SN-KRB22') || ' ' || pg_temp.cover('SN-KRB22'),
    'got', pg_temp.st('SN-KRP22') || ' ' || pg_temp.cover('SN-KRP22'),
    'others', pg_temp.st('SN-KRA22') || ' ' || pg_temp.st('SN-KRC22') || ' ' || pg_temp.st('SN-KRD22')),
  '{"gave":"cooking ","got":"packing raggi-jaggi:r1=500","others":"packing packing delivered"}'::jsonb,
  'on yes, the pouch moves with its batch; the order that gave it goes back to Cooking'
);

select public.undo_admin_kitchen((current_setting('t.give')::jsonb ->> 'action_id')::uuid);
select is(pg_temp.snap(), current_setting('t.snap')::jsonb, 'undo of giving is exact');

select throws_ok(
  $$select public.give_admin_priority(pg_temp.id('SN-KRA22'), true)$$,
  '22023', 'Only a priority order in Cooking can take packed food.', 'only a priority order in Cooking can take'
);

select * from finish();
rollback;
