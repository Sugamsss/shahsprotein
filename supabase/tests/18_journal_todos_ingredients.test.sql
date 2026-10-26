-- 20261026000001: the journal, to-dos and ingredients. Who can call what, only-me
-- entries, a day's figures, bought lines, search totals, to-dos (assign, tick, delete,
-- Undo), Home's extras, ingredient stock and photos. Ids, names and emails are made
-- up and everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(58);

-- The shared local stack may hold other test or demo data. Start from empty tables; the
-- rollback at the end puts everything back.
delete from public.todos;
delete from public.journal_entries;
delete from public.journal_milestones;
delete from public.ingredients;
delete from public.admin_users;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'cook@example.com'),
  ('00000000-0000-4000-8000-0000000000a3', 'someone@example.com');

insert into public.admin_users (id, email, display_name, home_view)
values
  ('00000000-0000-4000-8000-0000000000a1', 'owner@example.com', 'Owner Person', 'admin'),
  ('00000000-0000-4000-8000-0000000000a2', 'cook@example.com', 'Cook Person', 'cook');

create temporary table ids (k text primary key, v uuid, j jsonb) on commit drop;
grant all on ids to authenticated;

-- ─── Who can call it ───────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.get_admin_journal(date, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.get_admin_journal(date, integer)', 'execute')
  and not has_function_privilege('anon', 'public.save_admin_todo(uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.journal_entry_json(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.ingredient_stock()', 'execute'),
  'anon can''t call the journal RPCs, and the helpers aren''t callable at all'
);

select ok(
  not has_table_privilege('authenticated', 'public.journal_entries', 'select')
  and not has_table_privilege('authenticated', 'public.todos', 'select')
  and not has_table_privilege('anon', 'public.ingredients', 'select'),
  'the tables are closed to signed-in people and anon'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.get_admin_journal()$$, 'P0001', 'Unauthorized', 'a signed-in non-admin can''t read the journal');
select throws_ok($$select public.save_admin_todo(null, '{"text":"x"}')$$, 'P0001', 'Unauthorized', 'or make a to-do');
reset role;

-- ─── Writing an entry ──────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

insert into ids
select 'cook_entry', (x ->> 'id')::uuid, x from (select public.save_admin_journal_entry(null, jsonb_build_object(
  'mood', 4, 'body', E'  Roasted the ragi longer.\r\n\r\n\r\n\r\nBuy jaggery.  ', 'hours', 4.5,
  'tags', jsonb_build_array('Kitchen', 'kitchen', ' Idea '),
  'purchases', jsonb_build_array(
    jsonb_build_object('item', 'Jaggery, 5 kg', 'amount', 450),
    jsonb_build_object('item', 'Ragi flour', 'amount', 520)
  )
)) as x) q;

select is(
  (select j -> 'tags' from ids where k = 'cook_entry'),
  '["Kitchen", "Idea"]'::jsonb,
  'tags are trimmed and repeats (any case) dropped'
);
select is(
  (select j ->> 'body' from ids where k = 'cook_entry'),
  E'Roasted the ragi longer.\n\nBuy jaggery.',
  'the body is trimmed, \r\n becomes \n and empty lines are capped at one'
);

-- Saving the same day again changes that entry; it never makes a second one.
insert into ids
select 'cook_entry_2', (x ->> 'id')::uuid, x from (select public.save_admin_journal_entry(null, jsonb_build_object(
  'mood', 5, 'body', 'Better day.', 'hours', 4.5, 'tags', '[]'::jsonb,
  'purchases', jsonb_build_array(
    jsonb_build_object('id', (select j -> 'purchases' -> 0 ->> 'id' from ids where k = 'cook_entry'),
      'item', 'Jaggery, 5 kg', 'amount', 480)
  )
)) as x) q;

select is(
  (select v from ids where k = 'cook_entry_2'),
  (select v from ids where k = 'cook_entry'),
  'one entry per person per day: a second save updates it'
);
select is(
  (select jsonb_array_length(j -> 'purchases') from ids where k = 'cook_entry_2'),
  1,
  'a bought line left out of the save is removed'
);
select is(
  (select (j -> 'purchases' -> 0 ->> 'amount')::int || ' ' || ((j -> 'purchases' -> 0 ->> 'id') = (select j -> 'purchases' -> 0 ->> 'id' from ids where k = 'cook_entry'))::text from ids where k = 'cook_entry_2'),
  '480 true',
  'a bought line sent back with its id is updated in place'
);

select throws_ok(
  $$select public.save_admin_journal_entry((timezone('Asia/Kolkata', now()))::date + 1, '{"body":"later"}')$$,
  '22023', 'That day hasn''t come yet.', 'no entries for a day that hasn''t come'
);
select throws_ok(
  $$select public.save_admin_journal_entry(null, '{"mood":7}')$$,
  '22023', 'Pick how the day went.', 'mood is 1 to 5'
);
select throws_ok(
  $$select public.save_admin_journal_entry(null, '{"hours":2.3}')$$,
  '22023', 'Hours go from 0 to 24, in half hours.', 'hours are in half hours'
);
select throws_ok(
  $$select public.save_admin_journal_entry(null, '{"purchases":[{"item":"Dates","amount":12.5}]}')$$,
  '22023', 'Put what it cost in whole rupees.', 'a bought line costs whole rupees'
);
select throws_ok(
  $$select public.save_admin_journal_entry(null, '{"tags":["one","two","three","four","five","six","seven","eight","nine"]}')$$,
  '22023', 'An entry can have up to 8 tags.', 'up to 8 tags'
);

-- An only-me entry yesterday.
insert into ids
select 'cook_private', (public.save_admin_journal_entry((timezone('Asia/Kolkata', now()))::date - 1, jsonb_build_object(
  'mood', 5, 'body', 'Just for me: dates everywhere.', 'hours', 2, 'private', true,
  'tags', jsonb_build_array('Problem'),
  'purchases', jsonb_build_array(jsonb_build_object('item', 'Dates, 3 kg', 'amount', 1050))
)) ->> 'id')::uuid;

select is(
  (select jsonb_array_length(d -> 'entries') from jsonb_array_elements(public.get_admin_journal() -> 'days') d
    where (d ->> 'day')::date = (timezone('Asia/Kolkata', now()))::date - 1),
  1,
  'the author sees their own only-me entry in the feed'
);
reset role;

-- ─── The other admin ───────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*)::int from jsonb_array_elements(public.get_admin_journal() -> 'days') d,
    jsonb_array_elements(d -> 'entries') e where e ->> 'id' = (select v::text from ids where k = 'cook_private')),
  0,
  'someone else never sees an only-me entry in the feed'
);
select is(
  (select (d -> 'facts' ->> 'hours')::numeric from jsonb_array_elements(public.get_admin_journal() -> 'days') d
    where (d ->> 'day')::date = (timezone('Asia/Kolkata', now()))::date),
  4.5,
  'a day''s figures carry its hours'
);
reset role;
select is(
  (select (f.spent, f.hours)::text from public.journal_day_facts((timezone('Asia/Kolkata', now()))::date - 1, (timezone('Asia/Kolkata', now()))::date - 1) f),
  '(1050,2.0)',
  'an only-me entry''s spend and hours still count in the day''s figures'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is(
  (public.search_admin_journal('dates') ->> 'count')::int,
  0,
  'search never finds someone else''s only-me entry'
);
select throws_ok(
  format($$select public.add_admin_journal_reply(%L, 'hello')$$, (select v from ids where k = 'cook_private')),
  '22023', 'That entry isn''t there any more.', 'no replies on an entry you can''t see'
);
select throws_ok(
  format($$select public.delete_admin_journal_entry(%L)$$, (select v from ids where k = 'cook_entry')),
  '22023', 'You can only delete your own entry.', 'nobody deletes someone else''s entry'
);

select is(
  (select jsonb_array_length(public.add_admin_journal_reply(v, '  Best batch yet.  ') -> 'replies') from ids where k = 'cook_entry'),
  1,
  'a reply on a shared entry'
);
select is(
  (select (public.set_admin_journal_kept(v, true) ->> 'kept')::boolean from ids where k = 'cook_entry'),
  true,
  'Keep this one, for the caller'
);
select is(
  (select jsonb_array_length(public.get_admin_journal_lookback() -> 'kept')),
  1,
  'a kept entry shows in Look back'
);

-- The owner's own entry, with a Problem tag and a dates line.
select lives_ok(
  $$select public.save_admin_journal_entry(null, '{"mood":2,"body":"Ran out of dates again.","tags":["Problem"],"purchases":[{"item":"Seedless dates","amount":1350},{"item":"Petrol","amount":180}]}')$$,
  'the owner writes their own entry for the same day'
);
select is(
  (select (s ->> 'count')::int || ' ' || (s ->> 'spent') || ' ' || (s ->> 'problems') from (select public.search_admin_journal('dates') s) x),
  '1 1350 1',
  'search adds up: entries, ₹ on lines that match, and how many are tagged Problem'
);
select is(
  (public.search_admin_journal(null, null, 'problem') ->> 'count')::int,
  1,
  'the tag filter matches any case'
);
reset role;

-- ─── To-dos ────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

insert into ids
select 'todo_owner', (x ->> 'id')::uuid, x from (select public.save_admin_todo(null, jsonb_build_object(
  'text', '  Buy 10 kg jaggery ', 'assignee', '00000000-0000-4000-8000-0000000000a1',
  'due_on', (timezone('Asia/Kolkata', now()))::date + 2, 'entry_id', (select v from ids where k = 'cook_entry')
)) as x) q;
insert into ids
select 'todo_either', (public.save_admin_todo(null, jsonb_build_object(
  'text', 'Check the dates', 'due_on', (timezone('Asia/Kolkata', now()))::date - 1
)) ->> 'id')::uuid;
insert into ids
select 'todo_cook_late', (public.save_admin_todo(null, jsonb_build_object(
  'text', 'Write the recipe card', 'assignee', '00000000-0000-4000-8000-0000000000a2', 'entry_id', (select v from ids where k = 'cook_private')
)) ->> 'id')::uuid;

select is(
  (select j ->> 'text' from ids where k = 'todo_owner'),
  'Buy 10 kg jaggery',
  'a to-do''s words are trimmed'
);
select throws_ok(
  $$select public.save_admin_todo(null, '{"text":"x","assignee":"00000000-0000-4000-8000-0000000000a3"}')$$,
  '22023', 'Pick who''s doing it.', 'only an admin can be given a to-do'
);
select throws_ok(
  $$select public.save_admin_todo(null, '{"text":"   "}')$$,
  '22023', 'Say what needs doing, in up to 200 characters.', 'a to-do needs words'
);
select is(
  (select jsonb_agg(t ->> 'text' order by t ->> 'text') from jsonb_array_elements(public.get_admin_home_extras() -> 'todos') t),
  '["Check the dates"]'::jsonb,
  'Home shows the cook what''s theirs or either''s and due soon, not someone else''s'
);
select is(
  (public.get_admin_home_extras() ->> 'later')::int,
  1,
  'and counts the cook''s other open to-dos (no day)'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is(
  (select jsonb_agg(t ->> 'text' order by t ->> 'text') from jsonb_array_elements(public.get_admin_home_extras() -> 'todos') t),
  '["Buy 10 kg jaggery", "Check the dates"]'::jsonb,
  'Home shows the owner theirs and either''s'
);
select is(
  (select t -> 'entry' from jsonb_array_elements(public.get_admin_todos() -> 'todos') t
    where t ->> 'id' = (select v::text from ids where k = 'todo_cook_late')),
  'null'::jsonb,
  'a to-do made from someone else''s only-me entry doesn''t say which entry'
);
select is(
  (select public.set_admin_todo_done(v, true) -> 'done_by' ->> 'name' from ids where k = 'todo_either'),
  'Owner Person',
  'ticking a to-do records who did it'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.get_admin_journal() -> 'days') d, jsonb_array_elements(d -> 'done') t
    where t ->> 'text' = 'Check the dates'),
  1,
  'a done to-do shows on that day in the journal'
);
select is(
  (select public.set_admin_todo_done(v, false) ->> 'done_at' from ids where k = 'todo_either'),
  null,
  'Undo takes the tick off'
);
select is(
  (select (public.delete_admin_todo(v) ->> 'deleted')::boolean from ids where k = 'todo_either'),
  true,
  'delete hides a to-do'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.get_admin_todos() -> 'todos') t where t ->> 'text' = 'Check the dates'),
  0,
  'a deleted to-do isn''t listed'
);
select is(
  (select (public.delete_admin_todo(v, false) ->> 'deleted')::boolean from ids where k = 'todo_either'),
  false,
  'Undo brings it back'
);
reset role;

-- ─── Ingredients ───────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$select public.save_admin_ingredient(null, '{"name":"Jaggery","kind":"food","low_at":1500,"uses":[{"product_id":"raggi-jaggi","per_kg":100}]}')$$,
  'Pranjali adds jaggery: 100 g in each kg of Raggi Jaggi, low at 1.5 kg'
);
select throws_ok(
  $$select public.save_admin_ingredient(null, '{"name":"jaggery"}')$$,
  '22023', 'That one is already on the list.', 'names are unique, any case'
);
select throws_ok(
  $$select public.save_admin_ingredient(null, '{"name":"Salt","uses":[{"product_id":"not-a-product","per_kg":5}]}')$$,
  '22023', 'Those amounts don''t look right.', 'uses name real products'
);
insert into ids select 'jaggery', (i ->> 'id')::uuid, i from jsonb_array_elements(public.get_admin_ingredients() -> 'ingredients') i where i ->> 'name' = 'Jaggery';

select is(
  (select i -> 'stock' from jsonb_array_elements(public.get_admin_ingredients() -> 'ingredients') i where i ->> 'name' = 'Jaggery'),
  'null'::jsonb,
  'never counted, never bought: no stock yet'
);

select lives_ok(
  format($$select public.count_admin_ingredient(%L, 1000)$$, (select v from ids where k = 'jaggery')),
  'counted by hand: 1 kg'
);
reset role;

-- A batch logged after the count (made up straight into the table, with its own clock).
insert into public.kitchen_batches (product_id, grams, made_on, created_at)
values ('raggi-jaggi', 2000, (timezone('Asia/Kolkata', now()))::date, clock_timestamp());

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

-- Bought 500 g after the count, on today's entry.
select lives_ok(
  format($$select public.save_admin_journal_entry(null, jsonb_build_object('mood', 5, 'body', 'Better day.', 'hours', 4.5,
    'purchases', jsonb_build_array(
      jsonb_build_object('id', %L, 'item', 'Jaggery, 5 kg', 'amount', 480),
      jsonb_build_object('item', 'Jaggery', 'amount', 60, 'ingredient_id', %L, 'quantity', 500))))$$,
    (select j -> 'purchases' -> 0 ->> 'id' from ids where k = 'cook_entry_2'),
    (select v from ids where k = 'jaggery')),
  'a bought line can name an ingredient and how much'
);

select is(
  (select (i ->> 'stock')::numeric from jsonb_array_elements(public.get_admin_ingredients() -> 'ingredients') i where i ->> 'name' = 'Jaggery'),
  1300::numeric,
  'stock: 1000 counted + 500 bought − 200 used by a 2 kg batch'
);
select is(
  (select (i ->> 'low')::boolean from jsonb_array_elements(public.get_admin_ingredients() -> 'ingredients') i where i ->> 'name' = 'Jaggery'),
  true,
  'at or under its low mark it''s low'
);
select is(
  (select jsonb_agg(l ->> 'name') from jsonb_array_elements(public.get_admin_home_extras() -> 'low') l),
  '["Jaggery"]'::jsonb,
  'Home lists it as running low'
);
select is(
  (select (public.add_admin_ingredients(array['Ragi', 'jaggery', '  Ghee ']) -> 'ingredients') @> '[{"name":"Ragi"},{"name":"Ghee"}]'::jsonb),
  true,
  'adding several names at once skips the ones already there'
);
reset role;

-- ─── Photos ────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

select throws_ok(
  format($$select public.add_admin_journal_photo(%L, 'somewhere/else.webp', 100, 100)$$, (select v from ids where k = 'cook_entry')),
  '22023', 'That photo doesn''t look right.', 'a photo''s path starts with its entry'
);
select is(
  (select jsonb_array_length(public.add_admin_journal_photo(v, v::text || '/00000000-0000-4000-8000-00000000f001.webp', 1600, 1200) -> 'photos') from ids where k = 'cook_entry'),
  1,
  'the author adds a photo to their entry'
);
select ok(
  (select public.journal_photo_writable(v::text || '/x.webp') from ids where k = 'cook_private'),
  'the author can upload to their only-me entry'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select ok(
  (select not public.journal_photo_readable(p.v::text || '/x.webp') and public.journal_photo_readable(e.v::text || '/x.webp')
    from ids p, ids e where p.k = 'cook_private' and e.k = 'cook_entry'),
  'someone else can read a shared entry''s photos but not an only-me entry''s'
);
reset role;

-- ─── Milestones and the month ──────────────────────────

delete from public.orders;
insert into public.orders (id, code, source, status, name, created_at, status_changed_at)
values ('00000000-0000-4000-8000-0000000000d1', 'SN-AAAAA', 'call', 'delivered', 'Test Person',
  timezone('Asia/Kolkata', ((timezone('Asia/Kolkata', now()))::date - 40)::timestamp + interval '10 hours'), now());
insert into public.order_lines (order_id, product_id, size, quantity)
values ('00000000-0000-4000-8000-0000000000d1', 'raggi-jaggi', '250 g', 99), ('00000000-0000-4000-8000-0000000000d1', 'muesli', '250 g', 3);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is(
  (select jsonb_agg(m ->> 'kind' order by m ->> 'kind') from jsonb_array_elements(public.get_admin_journal_lookback() -> 'milestones') m
    where (m ->> 'day')::date = (timezone('Asia/Kolkata', now()))::date - 40),
  '["launch", "packs"]'::jsonb,
  'launch day and the first 100 packs come from the orders'
);
select is(
  (select count(*)::int from jsonb_array_elements(public.get_admin_journal_lookback() -> 'milestones') m where m ->> 'kind' = 'months'),
  1,
  'a month after launch is a milestone'
);
select is(
  (select (m ->> 'title') from (select public.save_admin_milestone((timezone('Asia/Kolkata', now()))::date - 3, '  First stall at the market ') as m) x),
  'First stall at the market',
  'a milestone marked by hand'
);
select ok(
  (select jsonb_array_length(public.get_admin_journal_month((timezone('Asia/Kolkata', now()))::date) -> 'entries') >= 2),
  'the month page lists the month''s entries'
);
reset role;

select * from finish();
rollback;
