-- 20260930000000: Held in Cooking. A manual Packing -> Cooking move keeps the
-- order's real batch food, and the kitchen never promotes the order by
-- itself; it leaves Cooking only when a person moves it. Covers the move, the
-- fill and promote rules, Undo, cancel, reopen, batch changes, edits,
-- priority, and the flag's own guards. Test data is fake (example.com) and
-- everything rolls back at the end. Calls run as postgres with an admin's
-- claims.

begin;
create extension if not exists pgtap with schema extensions;

select plan(61);

delete from public.orders;
delete from public.order_rate_limits;
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

create function pg_temp.clean() returns void language sql as $$
  delete from public.kitchen_writeoffs;
  delete from public.kitchen_allocations;
  delete from public.kitchen_batches;
  delete from public.kitchen_actions;
  delete from public.orders;
  delete from tags;
$$;

create function pg_temp.id(p_code text) returns uuid language sql as $$
  select id from public.orders where code = p_code;
$$;

-- 'cooking held' or 'packing -': the status, then whether it is held.
create function pg_temp.sh(p_code text) returns text language sql as $$
  select status || case when kitchen_hold then ' held' else ' -' end from public.orders where code = p_code;
$$;

create function pg_temp.bid(p_tag text) returns uuid language sql as $$
  select id from tags where tag = p_tag;
$$;

-- Logs one batch (today) and tags it.
create function pg_temp.log(p_tag text, p_product text, p_grams integer)
returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  v := public.log_admin_batches(jsonb_build_array(jsonb_build_object(
    'product_id', p_product, 'grams', p_grams)))::jsonb;
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

-- Undo by the action id of an update_admin_order or batch answer.
create function pg_temp.undo(p_effects jsonb) returns jsonb language sql as $$
  select public.undo_admin_kitchen(
    coalesce(p_effects #>> '{kitchen_effects,action_id}', p_effects ->> 'action_id')::uuid)::jsonb;
$$;

-- 'raggi-jaggi:k=500,raggi-jaggi:hand=300': batch grams first, by hand last.
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

create function pg_temp.kp(p_product text) returns jsonb language sql as $$
  select p from jsonb_array_elements(public.get_admin_kitchen()::jsonb -> 'products') p
  where p ->> 'product_id' = p_product;
$$;

-- Who is in a product's queue, in order.
create function pg_temp.queue(p_product text) returns jsonb language sql as $$
  select coalesce(jsonb_agg(q ->> 'code' order by n), '[]')
  from jsonb_array_elements(pg_temp.kp(p_product) -> 'queue') with ordinality t(q, n);
$$;

-- Every batch row as it is. Moves, cancels and fills never delete one.
create function pg_temp.bsnap() returns jsonb language sql as $$
  select coalesce(jsonb_agg(b.id || '=' || b.grams || '@' || b.made_on order by b.id), '[]') from public.kitchen_batches b;
$$;

-- Everything Undo must put back: status and hold, allocations, batches.
create function pg_temp.snap() returns jsonb language sql as $$
  select jsonb_build_object(
    'orders', (select coalesce(jsonb_agg(o.code || ':' || pg_temp.sh(o.code) order by o.code), '[]') from public.orders o),
    'alloc', (select coalesce(jsonb_agg(o.code || ':' || pg_temp.cover(o.code) order by o.code), '[]') from public.orders o),
    'batches', pg_temp.bsnap()
  );
$$;

create function pg_temp.hist(p_code text) returns text language sql as $$
  select string_agg(e.event || ':' || case when e.auto then 'auto' else 'by hand' end, ' ' order by e.id)
  from public.order_events e where e.order_id = pg_temp.id(p_code);
$$;

select pg_temp.as_owner();

-- ─── 1. Packing -> Cooking, fully covered by batches ────

select pg_temp.clean();
select pg_temp.ord('SN-KHA22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('a', 'raggi-jaggi', 800);
select set_config('t.s0', pg_temp.snap()::text, true);
select set_config('t.a', pg_temp.move('SN-KHA22', 'cooking')::text, true);

select ok(
  pg_temp.sh('SN-KHA22') = 'cooking held'
  and (current_setting('t.a')::jsonb ->> 'held')::boolean
  and current_setting('t.a')::jsonb #>> '{kitchen_effects,action_id}' is not null,
  'Packing to Cooking by hand: Cooking, held, one action to undo, and the answer says held'
);

select ok(
  (pg_temp.snap() - 'orders') = (current_setting('t.s0')::jsonb - 'orders')
  and pg_temp.spare('a') = 300,
  'its batch food stays on it: allocations and batches are exactly as they were, nothing became spare'
);

select is(
  pg_temp.hist('SN-KHA22'),
  'created:by hand packing:auto cooking:by hand',
  'the history has a Cooking event moved by hand'
);

select ok(
  (public.get_admin_order('SN-KHA22')::jsonb ->> 'held')::boolean
  and (select (o ->> 'held')::boolean from json_array_elements(public.get_admin_orders()::json -> 'orders') o
       where o ->> 'code' = 'SN-KHA22'),
  'get_admin_order and get_admin_orders say held'
);

-- ─── 2. Undo of the hold move ───────────────────────────

select is(
  pg_temp.undo(current_setting('t.a')::jsonb) ->> 'undone', 'true',
  'Undo of the hold move answers undone'
);

select ok(
  pg_temp.snap() = current_setting('t.s0')::jsonb
  and pg_temp.sh('SN-KHA22') = 'packing -'
  and pg_temp.hist('SN-KHA22') = 'created:by hand packing:auto',
  'Undo: Packing again, not held, allocations identical, the history reads as if it never happened'
);

select ok(
  (pg_temp.undo(current_setting('t.a')::jsonb) ->> 'undone') = 'true'
  and pg_temp.snap() = current_setting('t.s0')::jsonb,
  'a second Undo is quiet and changes nothing'
);

select set_config('t.r2', pg_temp.move('SN-KHA22', 'cooking')::text, true);
select pg_temp.move('SN-KHA22', 'packing');

select throws_ok(
  $$select pg_temp.undo(current_setting('t.r2')::jsonb)$$,
  '22023', 'Something changed since, so this can''t be undone.',
  'Undo of the hold move is refused once the order has moved on'
);

-- ─── 3. Other orders still fill; the held one is never promoted ─

select pg_temp.clean();
select pg_temp.ord('SN-KHB22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KHC22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('b', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHB22', 'cooking');
select pg_temp.log('b2', 'raggi-jaggi', 500);

select is(
  pg_temp.sh('SN-KHB22') || ' | ' || pg_temp.cover('SN-KHB22') || ' | '
    || pg_temp.sh('SN-KHC22') || ' | ' || pg_temp.cover('SN-KHC22'),
  'cooking held | raggi-jaggi:b=500 | packing - | raggi-jaggi:b2=500',
  'a new batch fills the next waiting order and leaves the held one alone'
);

select public.update_admin_batch(pg_temp.bid('b'), '{"grams":300}');
select is(
  pg_temp.sh('SN-KHB22') || ' | ' || pg_temp.cover('SN-KHB22'),
  'cooking held | raggi-jaggi:b=300',
  'a smaller batch takes grams off the held order like any Cooking order; it stays Cooking and held'
);

select public.update_admin_batch(pg_temp.bid('b'), '{"grams":500}');
select is(
  pg_temp.sh('SN-KHB22') || ' | ' || pg_temp.cover('SN-KHB22'),
  'cooking held | raggi-jaggi:b=500',
  'a bigger batch tops the short held order up, and it is still not promoted'
);

select pg_temp.log('b3', 'raggi-jaggi', 300);
select ok(
  pg_temp.sh('SN-KHB22') = 'cooking held' and pg_temp.spare('b3') = 300,
  'another log with the held order covered: it stays held, the new food is spare'
);

-- ─── 4. A held order is not a donor to a priority order ─

select pg_temp.clean();
select pg_temp.ord('SN-KHD22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('d', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHD22', 'cooking');
select public.save_admin_order(null, '{"source":"call","code":"SN-KHE22","name":"Priority Example","priority":true,
  "lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]}');

select ok(
  pg_temp.cover('SN-KHD22') = 'raggi-jaggi:d=500' and pg_temp.cover('SN-KHE22') = ''
  and pg_temp.sh('SN-KHD22') = 'cooking held',
  'a priority order short does not take a held order''s batch grams'
);

-- The same order without the hold is the donor (the hold is what stops it).
update public.orders set kitchen_hold = false where code = 'SN-KHD22';
select public.kitchen_fill('raggi-jaggi');
select ok(
  pg_temp.cover('SN-KHE22') = 'raggi-jaggi:d=500' and pg_temp.cover('SN-KHD22') = '',
  'control: without the hold the same Cooking order gives its grams to the priority order'
);

-- ─── 5. Mixed order: batch food stays, by-hand part goes ─

select pg_temp.clean();
select pg_temp.ord('SN-KHH22', 24,
  '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1},{"product_id":"muesli","size":"250 g","quantity":1}]');
select pg_temp.log('h', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHH22', 'packing');
select set_config('t.hb', pg_temp.bsnap()::text, true);

select is(
  pg_temp.sh('SN-KHH22') || ' ' || pg_temp.cover('SN-KHH22'),
  'packing - muesli:hand=250,raggi-jaggi:h=500',
  'setup: raggi from the batch, muesli covered by hand'
);

select pg_temp.move('SN-KHH22', 'cooking');
select ok(
  pg_temp.sh('SN-KHH22') = 'cooking held' and pg_temp.cover('SN-KHH22') = 'raggi-jaggi:h=500'
  and pg_temp.bsnap() = current_setting('t.hb')::jsonb,
  'back to Cooking drops only the by-hand part; the raggi batch food stays, the batch is untouched'
);

select ok(
  (select jsonb_object_agg(k ->> 'product_id', k -> 'waiting')
   from json_array_elements(public.get_admin_order('SN-KHH22')::json -> 'kitchen') k)
    = '{"muesli":true,"raggi-jaggi":false}'::jsonb
  and pg_temp.kp('muesli') ->> 'to_cook' = '250' and pg_temp.queue('muesli') = '["SN-KHH22"]'
  and pg_temp.kp('raggi-jaggi') ->> 'to_cook' = '0' and pg_temp.queue('raggi-jaggi') = '[]',
  'muesli is waiting and in the queue, raggi is covered and is not'
);

-- Move to Packing from held: the short part is covered by hand again.
select set_config('t.mp', pg_temp.move('SN-KHH22', 'packing')::text, true);
select ok(
  pg_temp.sh('SN-KHH22') = 'packing -' and pg_temp.cover('SN-KHH22') = 'muesli:hand=250,raggi-jaggi:h=500'
  and pg_temp.hist('SN-KHH22') = 'created:by hand packing:by hand cooking:by hand packing:by hand',
  'Move to Packing from held: Packing, hold gone, the short part covered by hand, a history event'
);

select pg_temp.undo(current_setting('t.mp')::jsonb);
select ok(
  pg_temp.sh('SN-KHH22') = 'cooking held' and pg_temp.cover('SN-KHH22') = 'raggi-jaggi:h=500'
  and pg_temp.hist('SN-KHH22') = 'created:by hand packing:by hand cooking:by hand',
  'Undo of that move: back in Cooking held, allocations as before'
);

select pg_temp.log('m', 'muesli', 250);
select ok(
  pg_temp.sh('SN-KHH22') = 'cooking held' and pg_temp.cover('SN-KHH22') = 'muesli:m=250,raggi-jaggi:h=500'
  and pg_temp.kp('muesli') ->> 'to_cook' = '0' and pg_temp.queue('muesli') = '[]'
  and (public.get_admin_overview()::jsonb -> 'queue' -> 'cooking' ->> 'count') = '1'
  and (public.get_admin_totals()::jsonb -> 'kitchen' -> 'products') = (public.get_admin_kitchen()::jsonb -> 'products'),
  'a batch for muesli covers it: still Cooking and held, short 0, not in to_cook or the queue, still counted in Cooking'
);

-- ─── 6. Fully by-hand order ─────────────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KHW22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.move('SN-KHW22', 'packing');
select pg_temp.move('SN-KHW22', 'cooking');

select ok(
  pg_temp.sh('SN-KHW22') = 'cooking held' and pg_temp.cover('SN-KHW22') = ''
  and pg_temp.kp('raggi-jaggi') ->> 'to_cook' = '500' and pg_temp.queue('raggi-jaggi') = '["SN-KHW22"]',
  'a fully by-hand order back in Cooking: by-hand dropped, short is its whole need, in the queue and to_cook'
);

select pg_temp.log('i', 'raggi-jaggi', 800);
select ok(
  pg_temp.sh('SN-KHW22') = 'cooking held' and pg_temp.cover('SN-KHW22') = 'raggi-jaggi:i=500'
  and pg_temp.spare('i') = 300,
  'the next batch tops the held order up and leaves it in Cooking'
);

select pg_temp.clean();
select pg_temp.ord('SN-KHJ22', 24, '[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]');
select pg_temp.move('SN-KHJ22', 'packing');
select pg_temp.log('j', 'raggi-jaggi', 800);
select pg_temp.move('SN-KHJ22', 'cooking');

select ok(
  pg_temp.sh('SN-KHJ22') = 'cooking held' and pg_temp.cover('SN-KHJ22') = 'raggi-jaggi:j=250'
  and pg_temp.spare('j') = 550,
  'with usable spare on the shelf the move tops the order up, but it stays Cooking held'
);

-- ─── 7. Cancel, reopen, delete ──────────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KHK22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KHS22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('k', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHK22', 'cooking');
select set_config('t.sk', pg_temp.snap()::text, true);
select set_config('t.cx', pg_temp.move('SN-KHK22', 'cancelled')::text, true);

select ok(
  pg_temp.sh('SN-KHK22') = 'cancelled -' and pg_temp.cover('SN-KHK22') = ''
  and pg_temp.sh('SN-KHS22') = 'packing -' and pg_temp.cover('SN-KHS22') = 'raggi-jaggi:k=500'
  and pg_temp.spare('k') = 0,
  'cancel from held: hold cleared, its food goes back and the fill gives it to the next order'
);

select pg_temp.undo(current_setting('t.cx')::jsonb);
select ok(
  pg_temp.snap() = current_setting('t.sk')::jsonb,
  'Undo of that cancel puts back Cooking held with its food, and the next order waiting again'
);

select pg_temp.move('SN-KHK22', 'cancelled');
select pg_temp.move('SN-KHK22', 'cooking');
select ok(
  pg_temp.sh('SN-KHK22') = 'cooking -',
  'reopening a cancelled order puts it in Cooking, not held'
);

select pg_temp.log('k2', 'raggi-jaggi', 500);
select is(
  pg_temp.sh('SN-KHK22') || ' ' || pg_temp.cover('SN-KHK22'),
  'packing - raggi-jaggi:k2=500',
  'and the next batch promotes it as usual'
);

select pg_temp.clean();
select pg_temp.ord('SN-KHY22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KHZ22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('y', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHY22', 'cooking');
select public.delete_admin_order(pg_temp.id('SN-KHY22'));

select ok(
  pg_temp.sh('SN-KHZ22') = 'packing -' and pg_temp.cover('SN-KHZ22') = 'raggi-jaggi:y=500'
  and not exists (select 1 from public.orders where code = 'SN-KHY22'),
  'deleting a held order frees its food for the next order'
);

-- ─── 8. Automatic moves back to Cooking are not held ────

select pg_temp.clean();
select pg_temp.ord('SN-KHM22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('m', 'raggi-jaggi', 500);
select public.update_admin_batch(pg_temp.bid('m'), '{"grams":300}');

select is(
  pg_temp.sh('SN-KHM22') || ' ' || pg_temp.cover('SN-KHM22'),
  'cooking - raggi-jaggi:m=300',
  'a batch shrink sends a Packing order back to Cooking by the rules: not held'
);

select pg_temp.log('m2', 'raggi-jaggi', 200);
select is(pg_temp.sh('SN-KHM22'), 'packing -', 'and the next batch moves it to Packing again');

select public.save_admin_order(pg_temp.id('SN-KHM22'),
  '{"source":"call","name":"Kitchen Example","lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":2}]}');
select is(pg_temp.sh('SN-KHM22'), 'cooking -', 'an edit that needs more food sends it back by the rules: not held');

select pg_temp.log('m3', 'raggi-jaggi', 600);
select is(pg_temp.sh('SN-KHM22'), 'packing -', 'and it is promoted by the next batch');

-- ─── 9. Batch delete, edit, priority on a held order ────

select pg_temp.clean();
select pg_temp.ord('SN-KHN22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('n', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHN22', 'cooking');
select public.delete_admin_batch(pg_temp.bid('n'));

select ok(
  pg_temp.sh('SN-KHN22') = 'cooking held' and pg_temp.cover('SN-KHN22') = '' and pg_temp.bsnap() = '[]'::jsonb,
  'deleting its batch (on purpose) takes its food; the order stays Cooking and held'
);

select pg_temp.log('n2', 'raggi-jaggi', 500);
select set_config('t.ed', public.save_admin_order(pg_temp.id('SN-KHN22'),
  '{"source":"call","name":"Kitchen Example","lines":[{"product_id":"raggi-jaggi","size":"250 g","quantity":1}]}')::text, true);

select ok(
  (current_setting('t.ed')::jsonb ->> 'held')::boolean
  and pg_temp.sh('SN-KHN22') = 'cooking held' and pg_temp.cover('SN-KHN22') = 'raggi-jaggi:n2=250'
  and pg_temp.spare('n2') = 250,
  'editing the order down keeps it held; the extra food goes back to spare'
);

select public.save_admin_order(pg_temp.id('SN-KHN22'),
  '{"source":"call","name":"Kitchen Example","lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":2}]}');
select ok(
  pg_temp.sh('SN-KHN22') = 'cooking held' and pg_temp.cover('SN-KHN22') = 'raggi-jaggi:n2=500',
  'editing it up tops it up from spare and keeps it held'
);

select pg_temp.clean();
select pg_temp.ord('SN-KHG22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('u', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHG22', 'cooking');
select set_config('t.pr', public.update_admin_order(pg_temp.id('SN-KHG22'), '{"priority":true}')::text, true);

select ok(
  pg_temp.sh('SN-KHG22') = 'cooking held' and (select priority from public.orders where code = 'SN-KHG22'),
  'priority on a held, covered order does not promote it'
);

select pg_temp.undo(current_setting('t.pr')::jsonb);
select ok(
  pg_temp.sh('SN-KHG22') = 'cooking held' and not (select priority from public.orders where code = 'SN-KHG22'),
  'Undo of the priority change keeps the hold'
);

select pg_temp.clean();
select pg_temp.ord('SN-KHV22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('v', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHV22', 'cooking');
select set_config('t.sh', public.update_admin_batch(pg_temp.bid('v'), '{"grams":300}')::text, true);
select pg_temp.undo(current_setting('t.sh')::jsonb);

select ok(
  pg_temp.sh('SN-KHV22') = 'cooking held' and pg_temp.cover('SN-KHV22') = 'raggi-jaggi:v=500',
  'Undo ends with the fill, which does not promote a held order that is covered again'
);

-- ─── 10. A held priority order and "Give it to Meera" ───

select pg_temp.clean();
select public.save_admin_order(null, jsonb_build_object('source', 'call', 'code', 'SN-KHR22', 'name', 'Meera Example',
  'priority', true, 'created_at', now() - interval '48 hours',
  'lines', '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]'::jsonb));
select pg_temp.ord('SN-KHT22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('r', 'raggi-jaggi', 500);
select pg_temp.log('t', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHR22', 'cooking');
select public.save_admin_order(pg_temp.id('SN-KHR22'),
  '{"source":"call","name":"Meera Example","lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":2}]}');
select set_config('t.sg', pg_temp.snap()::text, true);

select ok(
  pg_temp.sh('SN-KHR22') = 'cooking held'
  and (select (x ->> 'code') || (x ->> 'count')
       from jsonb_array_elements(public.give_admin_priority(pg_temp.id('SN-KHR22'), true)::jsonb -> 'pouches') x)
      = 'SN-KHT221',
  'a held priority order in Cooking is offered the packed pouch'
);

select set_config('t.give', public.give_admin_priority(pg_temp.id('SN-KHR22'))::text, true);
select ok(
  pg_temp.sh('SN-KHR22') = 'cooking held' and pg_temp.cover('SN-KHR22') = 'raggi-jaggi:r=500,raggi-jaggi:t=500'
  and pg_temp.sh('SN-KHT22') = 'cooking -',
  'it takes the pouch and is fully covered, but is not promoted; the giver goes back to Cooking, not held'
);

select pg_temp.undo(current_setting('t.give')::jsonb);
select ok(pg_temp.snap() = current_setting('t.sg')::jsonb, 'Undo of the give puts everything back, hold included');

-- ─── 11. Delivered keeps its rule ──────────────────────

select pg_temp.clean();
select pg_temp.ord('SN-KHP22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('p', 'raggi-jaggi', 500);
select pg_temp.move('SN-KHP22', 'ready');
select pg_temp.move('SN-KHP22', 'cooking');
select ok(
  pg_temp.sh('SN-KHP22') = 'cooking held' and pg_temp.cover('SN-KHP22') = 'raggi-jaggi:p=500',
  'Ready to Cooking by hand is held, like Packing, and keeps its batch food'
);

select pg_temp.move('SN-KHP22', 'delivered');
select throws_ok(
  $$select pg_temp.move('SN-KHP22', 'cooking')$$,
  '22023', 'Its food is already logged. Undo, or fix the batch.',
  'Delivered to Cooking is still refused when batches cover it all'
);

select pg_temp.ord('SN-KHQ22', 12, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.move('SN-KHQ22', 'delivered');
select pg_temp.move('SN-KHQ22', 'cooking');
select is(pg_temp.sh('SN-KHQ22'), 'cooking -', 'Delivered to Cooking is allowed when no batch food covers it, and it is not held');

-- ─── 11b. Ready to Cooking, held ────────────────────────

-- Fully covered by batches, Ready for 4 days.
select pg_temp.clean();
select pg_temp.ord('SN-KJA22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('ja', 'raggi-jaggi', 800);
select pg_temp.move('SN-KJA22', 'ready');
update public.orders set status_changed_at = now() - interval '4 days' where code = 'SN-KJA22';
select set_config('t.ja0', pg_temp.snap()::text, true);
select set_config('t.jat', (select status_changed_at::text from public.orders where code = 'SN-KJA22'), true);
select set_config('t.ja', pg_temp.move('SN-KJA22', 'cooking')::text, true);

select ok(
  pg_temp.sh('SN-KJA22') = 'cooking held' and (current_setting('t.ja')::jsonb ->> 'held')::boolean
  and (pg_temp.snap() - 'orders') = (current_setting('t.ja0')::jsonb - 'orders')
  and pg_temp.spare('ja') = 300,
  'Ready to Cooking, fully batch-covered: held, allocations byte-identical, nothing became spare'
);

select pg_temp.undo(current_setting('t.ja')::jsonb);
select ok(
  pg_temp.snap() = current_setting('t.ja0')::jsonb
  and (select status_changed_at::text from public.orders where code = 'SN-KJA22') = current_setting('t.jat'),
  'Undo: Ready again, not held, allocations identical, and Ready''s waiting days exactly as before'
);

-- A by-hand part from a manual advance.
select pg_temp.clean();
select pg_temp.ord('SN-KJB22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('jb', 'raggi-jaggi', 200);
select pg_temp.move('SN-KJB22', 'ready');
select pg_temp.move('SN-KJB22', 'cooking');

select ok(
  pg_temp.sh('SN-KJB22') = 'cooking held' and pg_temp.cover('SN-KJB22') = 'raggi-jaggi:jb=200'
  and pg_temp.kp('raggi-jaggi') ->> 'to_cook' = '300' and pg_temp.queue('raggi-jaggi') = '["SN-KJB22"]',
  'Ready with a by-hand part: it goes, the batch food stays, the order is short, in the queue and to_cook, held'
);

select pg_temp.log('jb2', 'raggi-jaggi', 300);
select ok(
  pg_temp.sh('SN-KJB22') = 'cooking held' and pg_temp.cover('SN-KJB22') = 'raggi-jaggi:jb=200,raggi-jaggi:jb2=300',
  'a new batch tops the held ex-Ready order up and does not promote it'
);

-- By-hand food that a batch shrink made while it was Ready goes too.
select pg_temp.clean();
select pg_temp.ord('SN-KJC22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('jc', 'raggi-jaggi', 500);
select pg_temp.move('SN-KJC22', 'ready');
select public.update_admin_batch(pg_temp.bid('jc'), '{"grams":300}');
select is(pg_temp.sh('SN-KJC22') || ' ' || pg_temp.cover('SN-KJC22'), 'ready - raggi-jaggi:jc=300,raggi-jaggi:hand=200',
  'setup: the shrink turned the lost grams into by-hand food on the Ready order');

select pg_temp.move('SN-KJC22', 'cooking');
select ok(
  pg_temp.sh('SN-KJC22') = 'cooking held' and pg_temp.cover('SN-KJC22') = 'raggi-jaggi:jc=300'
  and pg_temp.kp('raggi-jaggi') ->> 'to_cook' = '200',
  'the shrink''s by-hand part goes too (the old Ready rule): short 200, held'
);

select set_config('t.jp', pg_temp.move('SN-KJC22', 'packing')::text, true);
select ok(
  pg_temp.sh('SN-KJC22') = 'packing -' and pg_temp.cover('SN-KJC22') = 'raggi-jaggi:jc=300,raggi-jaggi:hand=200',
  'Move to Packing from a held ex-Ready order: hold gone, short part covered by hand'
);

select pg_temp.undo(current_setting('t.jp')::jsonb);
select ok(
  pg_temp.sh('SN-KJC22') = 'cooking held' and pg_temp.cover('SN-KJC22') = 'raggi-jaggi:jc=300',
  'Undo of that move: back in Cooking held'
);

-- Cancel, and priority.
select pg_temp.clean();
select pg_temp.ord('SN-KJD22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.ord('SN-KJE22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('jd', 'raggi-jaggi', 500);
select pg_temp.move('SN-KJD22', 'ready');
select pg_temp.move('SN-KJD22', 'cooking');
select pg_temp.move('SN-KJD22', 'cancelled');
select ok(
  pg_temp.sh('SN-KJD22') = 'cancelled -' and pg_temp.cover('SN-KJD22') = ''
  and pg_temp.sh('SN-KJE22') = 'packing -' and pg_temp.cover('SN-KJE22') = 'raggi-jaggi:jd=500',
  'cancel from a held ex-Ready order: hold cleared, its food goes to the next order'
);

select pg_temp.clean();
select pg_temp.ord('SN-KJF22', 48, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('jf', 'raggi-jaggi', 500);
select pg_temp.move('SN-KJF22', 'ready');
select pg_temp.move('SN-KJF22', 'cooking');
select public.save_admin_order(null, '{"source":"call","code":"SN-KJG22","name":"Priority Example","priority":true,
  "lines":[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]}');
select ok(
  pg_temp.cover('SN-KJF22') = 'raggi-jaggi:jf=500' and pg_temp.cover('SN-KJG22') = '',
  'a held ex-Ready order is not a donor to a priority order'
);

-- ─── 12. The flag's own guards ──────────────────────────

select ok(
  exists (select 1 from pg_constraint where conname = 'orders_kitchen_hold_check' and conrelid = 'public.orders'::regclass)
  and (select a.attnotnull and a.atthasdef from pg_attribute a
       where a.attrelid = 'public.orders'::regclass and a.attname = 'kitchen_hold'),
  'kitchen_hold is not null with a default, and has its check constraint'
);

select pg_temp.clean();
select pg_temp.ord('SN-KHX22', 24, '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1}]');
select pg_temp.log('x', 'raggi-jaggi', 500);
update public.orders set kitchen_hold = true where code = 'SN-KHX22';
select is(pg_temp.sh('SN-KHX22'), 'packing -', 'a hold cannot be set on an order that is not in Cooking');

select pg_temp.move('SN-KHX22', 'cooking');
update public.orders set status = 'packing' where code = 'SN-KHX22';
select is(pg_temp.sh('SN-KHX22'), 'packing -', 'a held flag cannot survive a status change, even a bare update');

alter table public.orders disable trigger trg_orders_clear_hold;
select throws_ok(
  $$update public.orders set kitchen_hold = true where code = 'SN-KHX22'$$,
  '23514', null,
  'without the trigger, the check constraint still refuses a hold outside Cooking'
);
alter table public.orders enable trigger trg_orders_clear_hold;

select ok(
  not has_function_privilege('anon', 'public.clear_kitchen_hold()', 'execute')
  and not has_function_privilege('authenticated', 'public.clear_kitchen_hold()', 'execute')
  and not has_function_privilege('public', 'public.clear_kitchen_hold()', 'execute'),
  'the trigger function is not callable from the API'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select public.update_admin_order(gen_random_uuid(), '{"status":"cooking"}')$$,
  'P0001', 'Unauthorized', 'non-admin cannot move an order back to Cooking'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.update_admin_order(gen_random_uuid(), '{"status":"cooking"}')$$,
  '42501', null, 'anon cannot call update_admin_order'
);
reset role;
select pg_temp.as_owner();

select * from finish();
rollback;
