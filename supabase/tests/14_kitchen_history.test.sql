-- 20261010000000: cooking history. The append-only log of every batch logged,
-- changed or deleted and every write-off (and its removal), filled by triggers.
-- Covers: what each call writes, Undo appending (never removing), previews
-- leaving nothing, the 7-day prune leaving history alone, the backfill, who can
-- read it (admin only, anon and signed-in users can't touch the table), the
-- admin RPC's filters, paging and limits, and that no email reaches the page.
-- Test data is fake and everything rolls back at the end.
--
-- Calls run as postgres with an admin's claims (as in 11_kitchen_flow). Within
-- one transaction now() doesn't move, so event sets are compared sorted, and
-- paging uses rows whose times the test sets itself.

begin;
create extension if not exists pgtap with schema extensions;

select plan(46);

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

create temp table tags (tag text primary key, id uuid not null);

create function pg_temp.as_owner() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
$$;

create function pg_temp.as_someone() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
$$;

create function pg_temp.day(p_ago integer) returns text language sql as $$
  select to_char(public.kitchen_today() - p_ago, 'YYYY-MM-DD');
$$;

create function pg_temp.bid(p_tag text) returns uuid language sql as $$
  select id from tags where tag = p_tag;
$$;

-- Tags the batch that was just logged (the one not tagged yet).
create function pg_temp.tag_new(p_tag text) returns void language plpgsql as $$
begin
  insert into tags select p_tag, b.id from public.kitchen_batches b where b.id not in (select id from tags);
end;
$$;

-- The batch's history as sorted "event:action" pairs (the order within one
-- transaction is not meaningful, so the set is what's compared).
create function pg_temp.events(p_tag text) returns text language sql as $$
  select coalesce(string_agg(x, ' ' order by x collate "C"), '')
  from (
    select h.event || ':' || coalesce(h.action_kind, '-') as x
    from public.kitchen_history h
    where h.batch_id = pg_temp.bid(p_tag)
  ) s;
$$;

create function pg_temp.total() returns bigint language sql as $$
  select count(*) from public.kitchen_history;
$$;

-- ═══ Who can see and write it ════════════════════════════════════════════

select ok(
  (select relrowsecurity from pg_class where oid = 'public.kitchen_history'::regclass),
  'kitchen_history: RLS is on'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'kitchen_history'),
  0,
  'kitchen_history: no policies, so RLS alone never opens it'
);

select is(
  coalesce(concat_ws(' ',
    case when has_table_privilege('anon', 'public.kitchen_history', 'select') then 'anon select' end,
    case when has_table_privilege('authenticated', 'public.kitchen_history', 'select') then 'auth select' end,
    case when has_table_privilege('authenticated', 'public.kitchen_history', 'insert') then 'auth insert' end,
    case when has_table_privilege('authenticated', 'public.kitchen_history', 'update') then 'auth update' end,
    case when has_table_privilege('authenticated', 'public.kitchen_history', 'delete') then 'auth delete' end
  ), ''),
  '',
  'kitchen_history: anon and signed-in users have no privileges on the table'
);

select ok(
  has_function_privilege('authenticated', 'public.get_admin_kitchen_history(uuid, text, timestamptz, integer)', 'execute')
  and not has_function_privilege('anon', 'public.get_admin_kitchen_history(uuid, text, timestamptz, integer)', 'execute'),
  'get_admin_kitchen_history: signed-in admins may call it, anon may not'
);

select ok(
  not has_function_privilege('anon', 'public.kitchen_history_batch()', 'execute')
  and not has_function_privilege('authenticated', 'public.kitchen_history_batch()', 'execute')
  and not has_function_privilege('anon', 'public.kitchen_history_writeoff()', 'execute')
  and not has_function_privilege('authenticated', 'public.kitchen_history_writeoff()', 'execute'),
  'history trigger functions: not callable by anon or signed-in users'
);

set local role anon;
select throws_ok(
  'select count(*) from public.kitchen_history',
  '42501', null,
  'anon: cannot select the history table'
);
select throws_ok(
  'select public.get_admin_kitchen_history()',
  '42501', null,
  'anon: cannot call the history RPC'
);
reset role;

set local role authenticated;
select throws_ok(
  'select count(*) from public.kitchen_history',
  '42501', null,
  'signed in: cannot select the history table directly'
);
reset role;

-- ═══ The backfill (its statements, run with the triggers off) ════════════

set session_replication_role = replica;
insert into public.kitchen_batches (id, product_id, grams, made_on, created_at, created_by)
values ('00000000-0000-4000-8000-0000000000b1', 'date-bites', 400, pg_temp.day(2)::date,
  timezone('utc', now()) - interval '3 days', '00000000-0000-4000-8000-000000000001');
insert into public.kitchen_writeoffs (id, batch_id, grams, reason, created_at, created_by)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 40, 'thrown_out',
  timezone('utc', now()) - interval '2 days', '00000000-0000-4000-8000-000000000001');

insert into public.kitchen_history (at, by, batch_id, product_id, event, grams, made_on, action_kind)
select b.created_at, b.created_by, b.id, b.product_id, 'logged', b.grams, b.made_on, null
from public.kitchen_batches b
where b.id = '00000000-0000-4000-8000-0000000000b1';
insert into public.kitchen_history (at, by, batch_id, product_id, event, grams, made_on, reason, action_kind)
select w.created_at, w.created_by, w.batch_id, b.product_id,
  case when w.reason = 'used_up' then 'used_up' else 'thrown_out' end,
  w.grams, b.made_on, w.reason, null
from public.kitchen_writeoffs w
join public.kitchen_batches b on b.id = w.batch_id
where w.id = '00000000-0000-4000-8000-0000000000c1';
set session_replication_role = origin;

select is(
  (select count(*)::integer from public.kitchen_history where batch_id = '00000000-0000-4000-8000-0000000000b1'),
  2,
  'backfill: one row per existing batch and one per write-off'
);
select ok(
  exists (
    select 1 from public.kitchen_history
    where batch_id = '00000000-0000-4000-8000-0000000000b1' and event = 'logged' and action_kind is null
      and grams = 400 and by = '00000000-0000-4000-8000-000000000001'
      and at = (timezone('utc', now()) - interval '3 days')
  ),
  'backfill: logged row keeps the batch''s created_at, created_by, and no action kind'
);
select ok(
  exists (
    select 1 from public.kitchen_history
    where batch_id = '00000000-0000-4000-8000-0000000000b1' and event = 'thrown_out' and reason = 'thrown_out'
      and grams = 40 and action_kind is null
  ),
  'backfill: a thrown-out write-off becomes a thrown_out row'
);

-- Take the backfill's rows back out, quietly, so the scenario starts clean.
set session_replication_role = replica;
delete from public.kitchen_history where batch_id = '00000000-0000-4000-8000-0000000000b1';
delete from public.kitchen_writeoffs where id = '00000000-0000-4000-8000-0000000000c1';
delete from public.kitchen_batches where id = '00000000-0000-4000-8000-0000000000b1';
set session_replication_role = origin;

-- ═══ The scenario: what each kitchen call writes ═════════════════════════

select pg_temp.as_owner();

-- 'k': logged, fixed (grams, then the day), written off twice, one write-off
-- taken back, then the batch deleted and that delete undone.
-- 'm': logged, then the log undone.

select set_config('t.log', public.log_admin_batches(jsonb_build_array(jsonb_build_object(
  'product_id', 'raggi-jaggi', 'grams', 2000, 'made_on', pg_temp.day(0))))::text, true);
select pg_temp.tag_new('k');

select is(pg_temp.events('k'), 'logged:log_batches', 'log: writes one logged row, with the call''s kind');

select ok(
  exists (
    select 1 from public.kitchen_history h
    where h.batch_id = pg_temp.bid('k') and h.event = 'logged' and h.grams = 2000
      and h.made_on = public.kitchen_today() and h.old_grams is null and h.old_made_on is null
      and h.by = '00000000-0000-4000-8000-000000000001' and h.reason is null
  ),
  'log: the logged row has the grams, the made-on day and who logged it'
);

select public.update_admin_batch(pg_temp.bid('k'), '{"grams":1500}');
select is(
  (select grams || '/' || old_grams || '/' || coalesce(old_made_on::text, 'none')
   from public.kitchen_history where batch_id = pg_temp.bid('k') and event = 'changed'),
  '1500/2000/none',
  'fix grams: a changed row with the new grams and the old ones'
);

select public.update_admin_batch(pg_temp.bid('k'), jsonb_build_object('made_on', pg_temp.day(1)));
select is(
  (select grams || '/' || coalesce(old_grams::text, 'none') || '/' || made_on || '/' || old_made_on
   from public.kitchen_history where batch_id = pg_temp.bid('k') and event = 'changed' and old_made_on is not null),
  '1500/none/' || pg_temp.day(1) || '/' || pg_temp.day(0),
  'fix the day: a changed row with the old day, and no old grams when they didn''t change'
);
select is(pg_temp.events('k'), 'changed:update_batch changed:update_batch logged:log_batches',
  'fixes: each fix writes its own changed row under the update kind');

-- A save that changes neither grams nor the day records nothing.
update public.kitchen_batches set updated_at = timezone('utc', now()), updated_by = '00000000-0000-4000-8000-000000000001'
where id = pg_temp.bid('k');
select is(pg_temp.events('k'), 'changed:update_batch changed:update_batch logged:log_batches',
  'an update that changes neither grams nor the day records nothing');

-- Previews run the real call and roll back: no history from any of them.
select public.update_admin_batch(pg_temp.bid('k'), '{"grams":700}', true);
select public.update_admin_batch(pg_temp.bid('k'), ('{"made_on":"' || pg_temp.day(3) || '"}')::jsonb, true);
select public.delete_admin_batch(pg_temp.bid('k'), true);
select public.log_admin_batches('[{"product_id":"muesli","grams":300}]', true);
select is(pg_temp.total(), 3::bigint, 'previews (fix, delete, log): leave no history at all');

select set_config('t.wa', public.write_off_admin_spare(pg_temp.bid('k'), 100, 'used_up')::text, true);
select set_config('t.wb', public.write_off_admin_spare(pg_temp.bid('k'), 50, 'thrown_out')::text, true);
select is(pg_temp.events('k'),
  'changed:update_batch changed:update_batch logged:log_batches thrown_out:write_off used_up:write_off',
  'write-offs: used up and thrown out each write one row, under the write-off kind');

-- Undo of the thrown-out write-off: its removal is appended, not deleted.
select public.undo_admin_kitchen((current_setting('t.wb')::jsonb ->> 'action_id')::uuid);
select is(
  (select count(*)::integer from public.kitchen_history where batch_id = pg_temp.bid('k') and event = 'writeoff_removed' and action_kind = 'undo' and reason = 'thrown_out'),
  1,
  'undo of a write-off: a writeoff_removed row under undo, and the write-off row stays'
);
select is(
  (select count(*)::integer from public.kitchen_history where batch_id = pg_temp.bid('k') and event = 'thrown_out'),
  1,
  'undo of a write-off: the thrown-out row itself is still there'
);

-- Delete the batch (its used up spare goes with it), then undo the delete.
select set_config('t.del', public.delete_admin_batch(pg_temp.bid('k'))::text, true);
select is(
  pg_temp.events('k'),
  'changed:update_batch changed:update_batch deleted:delete_batch logged:log_batches thrown_out:write_off used_up:write_off writeoff_removed:delete_batch writeoff_removed:undo',
  'delete: the batch''s write-offs go as removed, and the batch as deleted, all under the delete kind'
);
select is(
  (select grams::text || '/' || made_on::text from public.kitchen_history
   where batch_id = pg_temp.bid('k') and event = 'deleted'),
  '1500/' || pg_temp.day(1),
  'delete: the deleted row keeps the batch''s grams and day as they were'
);

select public.undo_admin_kitchen((current_setting('t.del')::jsonb ->> 'action_id')::uuid);
select is(
  (select count(*)::integer from public.kitchen_history where batch_id = pg_temp.bid('k') and action_kind = 'undo'),
  3,
  'undo of a delete: the batch and its used up write-off come back as undo rows (3 with the earlier write-off undo)'
);
select ok(
  exists (select 1 from public.kitchen_batches where id = pg_temp.bid('k') and grams = 1500),
  'undo of a delete: the batch is really back'
);
select is(
  (select count(*)::integer from public.kitchen_history where batch_id = pg_temp.bid('k')),
  10,
  'undo appends: every earlier row is still there, and the undo adds its own'
);
select is(
  (select count(*)::integer from public.kitchen_history where batch_id = pg_temp.bid('k') and event = 'deleted'),
  1,
  'undo appends: the deleted row is kept, not removed'
);

-- 'm': logged, then the log undone. The undo leaves a deleted row under undo.
select set_config('t.logm', public.log_admin_batches(('[{"product_id":"muesli","grams":500,"made_on":"' || pg_temp.day(0) || '"}]')::jsonb)::text, true);
select pg_temp.tag_new('m');
select public.undo_admin_kitchen((current_setting('t.logm')::jsonb ->> 'action_id')::uuid);
select is(pg_temp.events('m'), 'deleted:undo logged:log_batches', 'undo of a log: a deleted row under undo, the logged row stays');

select is(
  (select count(*)::integer from public.kitchen_history where action_kind = 'undo'),
  4,
  'undo rows across the table: three for k, one for m'
);

-- ═══ The 7-day prune ═════════════════════════════════════════════════════

update public.kitchen_actions set created_at = timezone('utc', now()) - interval '10 days'
where id = (current_setting('t.logm')::jsonb ->> 'action_id')::uuid;

select public.log_admin_batches('[{"product_id":"muesli","grams":300}]');
select ok(
  not exists (select 1 from public.kitchen_actions where id = (current_setting('t.logm')::jsonb ->> 'action_id')::uuid),
  'prune: the undo log drops the action older than 7 days'
);
select is(pg_temp.events('m'), 'deleted:undo logged:log_batches',
  'prune: the batch''s history is still there, past the 7 days');

-- ═══ The admin RPC ═══════════════════════════════════════════════════════

select is(
  (select json_array_length(public.get_admin_kitchen_history(pg_temp.bid('k'))->'entries')),
  10,
  'history RPC: a batch''s entries, all of them'
);
select is(
  (select (public.get_admin_kitchen_history(pg_temp.bid('k'))->>'more')::boolean),
  false,
  'history RPC: nothing more after the last entry'
);
select is(
  (select count(*)::integer from json_array_elements(public.get_admin_kitchen_history(pg_temp.bid('k'))->'entries') e
   where e->>'by_name' = 'Owner'),
  10,
  'history RPC: each entry carries the display name'
);
select is(
  position('@' in public.get_admin_kitchen_history()::text),
  0,
  'history RPC: no email in the answer'
);
select is(
  (select count(*)::integer from json_array_elements(public.get_admin_kitchen_history(null, 'muesli')->'entries')),
  3,
  'history RPC: the product filter keeps that product only'
);
select is(
  (select json_array_length(public.get_admin_kitchen_history(pg_temp.bid('m'))->'entries')),
  2,
  'history RPC: the batch filter keeps that batch only'
);
select is(
  (select (e->>'event') from json_array_elements(public.get_admin_kitchen_history(pg_temp.bid('k'))->'entries') e
   where e->>'event' = 'changed' and e->>'old_grams' = '2000' limit 1),
  'changed',
  'history RPC: the fix from 2 kg to 1.5 kg carries its old grams'
);

-- Paging, with rows whose times the test sets: 3 at one moment, 2 at an earlier one.
insert into public.kitchen_history (at, batch_id, product_id, event, grams, made_on, action_kind)
select t, '00000000-0000-4000-8000-0000000000d1', 'muesli', 'logged', 100, null, null
from (values
  (timestamptz '2026-09-03 10:00+00'), (timestamptz '2026-09-03 10:00+00'), (timestamptz '2026-09-03 10:00+00'),
  (timestamptz '2026-09-01 10:00+00'), (timestamptz '2026-09-01 10:00+00')
) v(t);

select is(
  (select json_array_length(public.get_admin_kitchen_history('00000000-0000-4000-8000-0000000000d1', null, null, 2)->'entries')),
  3,
  'paging: a page never splits the entries saved at one moment (3 at once, though the limit is 2)'
);
select is(
  (select (public.get_admin_kitchen_history('00000000-0000-4000-8000-0000000000d1', null, null, 2)->>'more')::boolean),
  true,
  'paging: more after the first page'
);

select set_config('t.page1', public.get_admin_kitchen_history('00000000-0000-4000-8000-0000000000d1', null, null, 2)::text, true);
select is(
  (select count(*)::integer
   from json_array_elements(public.get_admin_kitchen_history(
      '00000000-0000-4000-8000-0000000000d1', null,
      ((current_setting('t.page1')::json -> 'entries') -> -1 ->> 'at')::timestamptz, 2)->'entries') e),
  2,
  'paging: the next page picks up from the last entry, with the older two'
);
select is(
  (select (public.get_admin_kitchen_history(
      '00000000-0000-4000-8000-0000000000d1', null,
      ((current_setting('t.page1')::json -> 'entries') -> -1 ->> 'at')::timestamptz, 2)->>'more')::boolean),
  false,
  'paging: the last page says there is no more'
);
select is(
  (select count(distinct e->>'id')::integer
   from (
     select json_array_elements(current_setting('t.page1')::json -> 'entries') e
     union all
     select json_array_elements(public.get_admin_kitchen_history(
      '00000000-0000-4000-8000-0000000000d1', null,
      ((current_setting('t.page1')::json -> 'entries') -> -1 ->> 'at')::timestamptz, 2)->'entries')
   ) x),
  5,
  'paging: every row once across the pages, none lost or repeated'
);
select is(
  (select json_array_length(public.get_admin_kitchen_history('00000000-0000-4000-8000-0000000000d1', null, null, 500)->'entries')),
  5,
  'paging: a limit above 200 is clamped, and five rows come back together'
);
select ok(
  json_array_length(public.get_admin_kitchen_history('00000000-0000-4000-8000-0000000000d1', null, null, 0)->'entries') >= 1,
  'paging: a limit below 1 is clamped to 1, and still returns the newest'
);

-- ═══ Who may read it ═════════════════════════════════════════════════════

select pg_temp.as_someone();
select throws_ok(
  'select public.get_admin_kitchen_history()',
  'P0001', 'Unauthorized',
  'a signed-in user who is not an admin: Unauthorized'
);

select * from finish();
rollback;
