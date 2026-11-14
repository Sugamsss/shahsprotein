-- 20261114000000: expenses both owners record (packaging, courier, raw material).
-- Both owners can read, change and delete every expense; a non-admin and anon
-- cannot. Days are India civil days, and the list groups the same way.
-- Fixtures are made up and everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- The shared local stack may hold other people's data. Start clean; the rollback
-- puts everything back.
delete from public.admin_expenses;
delete from public.admin_users;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'sunit@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner'),
  ('00000000-0000-4000-8000-000000000002', 'sunit@example.com', 'Sunit');

-- India's today, fixed for this transaction, and one saved id to carry between roles.
create temporary table exp_today as
select (timezone('Asia/Kolkata', now()))::date as today;
create temporary table exp_ids (label text primary key, id uuid);
grant select, insert on exp_today, exp_ids to authenticated;

-- ─── Who can call what ──────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.get_admin_expenses(date, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.save_admin_expense(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.delete_admin_expense(uuid, boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.get_admin_expenses(date, date, text)', 'execute')
  and has_function_privilege('authenticated', 'public.save_admin_expense(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.delete_admin_expense(uuid, boolean)', 'execute'),
  'anon cannot call the expenses RPCs; signed-in people can reach them'
);

select ok(
  not has_table_privilege('anon', 'public.admin_expenses', 'select')
  and not has_table_privilege('authenticated', 'public.admin_expenses', 'select'),
  'the table is not readable directly; only the RPCs reach it'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.get_admin_expenses()$$, 'P0001', 'Unauthorized',
  'a signed-in non-admin cannot list expenses'
);
select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-11-14','spent_at','10:00','title','Tea','amount',10))$$,
  'P0001', 'Unauthorized', 'a signed-in non-admin cannot save an expense'
);
select throws_ok(
  $$select public.delete_admin_expense('00000000-0000-4000-8000-0000000000aa')$$,
  'P0001', 'Unauthorized', 'a signed-in non-admin cannot delete an expense'
);

-- ─── Today and saving, as the first owner ───────────────

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (public.get_admin_expenses()) ->> 'today',
  (select today::text from exp_today),
  'get_admin_expenses says today is India''s day'
);

-- These two sit two days back, so their times (09:40, 17:15) are always behind
-- the clock and the order they come back in doesn't depend on the hour.
select is(
  public.save_admin_expense(null, jsonb_build_object(
    'spent_on', (select today from exp_today) - 2,
    'spent_at', '09:40',
    'title', '  Zip pouches  ',
    'note', '',
    'amount', 3200
  )) ->> 'title',
  'Zip pouches',
  'save trims the title and answers the saved row'
);

select is(
  public.save_admin_expense(null, jsonb_build_object(
    'spent_on', (select today from exp_today) - 2, 'spent_at', '17:15', 'title', 'Courier to Pune', 'amount', 185
  )) ->> 'note',
  '',
  'a missing note is saved as an empty note'
);

insert into exp_ids (label, id)
select 'pune', (x ->> 'id')::uuid
from jsonb_array_elements(
  public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today) + 1) -> 'expenses'
) x
where x ->> 'title' = 'Courier to Pune';

-- ─── Validation mirrors the form ────────────────────────

-- A fixed day already behind us: these checks are about the shape of the row,
-- and which rule answers first must never depend on the hour the test runs.
select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-06-01','spent_at','10:00','title','Tea','amount',0))$$,
  '22023', null, 'amount 0 is refused'
);
select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-06-01','spent_at','10:00','title','Tea','amount',12.5))$$,
  '22023', null, 'a decimal amount is refused (whole rupees only)'
);
select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-06-01','spent_at','10:00','title','   ','amount',10))$$,
  '22023', null, 'a blank title is refused'
);
select throws_ok(
  format(
    $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-06-01','spent_at','10:00','title',%L,'amount',10))$$,
    repeat('x', 201)
  ),
  '22023', null, 'a title over 200 characters is refused'
);
select throws_ok(
  format(
    $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-06-01','spent_at','10:00','title','Tea','note',%L,'amount',10))$$,
    repeat('x', 4001)
  ),
  '22023', null, 'a note over 4000 characters is refused'
);
select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-13-01','spent_at','10:00','title','Tea','amount',10))$$,
  '22023', null, 'a day that isn''t a calendar day is refused'
);
select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2025-12-31','spent_at','10:00','title','Tea','amount',10))$$,
  '22023', null, 'a day before 2026 is refused'
);
select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on', to_char((select today from exp_today) + 1, 'YYYY-MM-DD'),'spent_at','10:00','title','Tea','amount',10))$$,
  '22023', 'That day hasn''t happened yet.', 'a day after today is refused: an expense is already paid'
);
select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-06-01','spent_at','24:00','title','Tea','amount',10))$$,
  '22023', null, '24:00 is not a time'
);

-- One minute after the clock is refused, but today's last minute has no minute
-- after it: at 23:59 there is nothing to refuse, so that minute is skipped. The
-- now-advance is built from the clock itself, so it never wraps past midnight.
-- These are top-level selects, never PERFORM in a DO block: PERFORM throws the
-- TAP line away, so the runner never counts it. The two WHEREs are exact
-- opposites, so exactly one of them answers and the plan stays at 38.
select throws_ok(
  format(
    $sql$select public.save_admin_expense(null, jsonb_build_object('spent_on',%L,'spent_at',%L,'title','Tea','amount',10))$sql$,
    (select today from exp_today),
    to_char(timezone('Asia/Kolkata', now())::time + interval '1 minute', 'HH24:MI')
  ),
  '22023', 'That time hasn''t happened yet today.', 'a future minute today is refused'
)
where timezone('Asia/Kolkata', now())::time < time '23:59';

select skip(1, 'the clock is on today''s last minute; it has no later minute to refuse')
where timezone('Asia/Kolkata', now())::time >= time '23:59';

select lives_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on',(select today from exp_today),'spent_at',to_char(timezone('Asia/Kolkata', now())::time,'HH24:MI'),'title','Tea now','amount',10))$$,
  'the current minute is accepted'
);
select lives_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on',(select today from exp_today) - 1,'spent_at','23:59','title','Tea yesterday','amount',10))$$,
  'a late time yesterday is accepted'
);

-- Those two boundary rows go again, so every count below is about this file's
-- own fixtures and nothing is left behind for another run to trip over.
reset role;
delete from public.admin_expenses where title in ('Tea now', 'Tea yesterday');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-06-01','spent_at','10:00','title','Tea','amount',2147483648))$$,
  '22023', null, 'an amount past 2^31-1 is refused'
);
select throws_ok(
  $$select public.get_admin_expenses((select today from exp_today), (select today - 1 from exp_today))$$,
  '22023', null, 'a range that ends before it starts is refused'
);
select throws_ok(
  $$select public.save_admin_expense('00000000-0000-4000-8000-0000000000bb', jsonb_build_object('spent_on','2026-06-01','spent_at','10:00','title','Tea','amount',10))$$,
  '22023', null, 'editing an expense that isn''t there is refused'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today) + 1) -> 'expenses'
  ) x where x ->> 'title' = 'Courier to Pune'),
  1::bigint,
  'the expense saved above is there'
);

-- ─── Both owners: anyone can change and delete ──────────

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  public.save_admin_expense(
    (select id from exp_ids where label = 'pune'),
    jsonb_build_object('spent_on',(select today from exp_today) - 2,'spent_at','18:05','title','Courier to Mumbai','amount',240)
  ) ->> 'title',
  'Courier to Mumbai',
  'the other owner can edit an expense the first one saved'
);

select is(
  public.delete_admin_expense((select id from exp_ids where label = 'pune')) ->> 'deleted',
  'true',
  'the other owner can delete it'
);

select throws_ok(
  $$select public.delete_admin_expense((select id from exp_ids where label = 'pune'))$$,
  '22023', null, 'deleting it twice is refused'
);

select is(
  public.delete_admin_expense((select id from exp_ids where label = 'pune'), false) ->> 'deleted',
  'false',
  'Undo (deleted false) brings it back'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today) + 1) -> 'expenses'
  ) x where x ->> 'title' = 'Courier to Mumbai'),
  1::bigint,
  'the restored expense is back in the list'
);

select is(
  (select (x ->> 'amount')::integer from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today) + 1) -> 'expenses'
  ) x where x ->> 'title' = 'Courier to Mumbai'),
  240,
  'Undo keeps its fields'
);

-- ─── Range, search and order ────────────────────────────

reset role;
insert into public.admin_expenses (spent_on, spent_at, title, note, amount) values
  ((select today from exp_today) - 31, '11:00', 'Oats, 10 kg', 'Muesli', 920),
  ((select today from exp_today) - 1, '10:15', 'Ragi flour, 20 kg', '', 1600),
  ((select today from exp_today) - 1, '08:00', 'Sticker printing', 'Raggi Jaggi front', 960);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 1, (select today from exp_today)) -> 'expenses'
  )),
  2::bigint,
  'the range includes its first day and leaves out its last'
);

select is(
  (public.get_admin_expenses((select today from exp_today) - 1, (select today from exp_today), 'raggi') -> 'expenses') -> 0 ->> 'title',
  'Sticker printing',
  'search finds a word in the note, any case'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today), '920') -> 'expenses'
  )),
  1::bigint,
  'search finds an amount'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 1, (select today from exp_today),
      to_char((select today from exp_today) - 1, 'DD Mon')) -> 'expenses'
  )),
  2::bigint,
  'search finds a day as "13 Nov"'
);

select is(
  (select array_agg(x ->> 'title') from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today) + 1) -> 'expenses'
  ) x),
  array['Ragi flour, 20 kg', 'Sticker printing', 'Courier to Mumbai', 'Zip pouches', 'Oats, 10 kg'],
  'newest day first, then latest time first'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 1, (select today from exp_today), 'Oats') -> 'expenses'
  )),
  0::bigint,
  'the range still applies when searching'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today), '%') -> 'expenses'
  )),
  0::bigint,
  'search treats % as a plain character, not a pattern'
);

-- Removing a person must not be blocked by the expenses they saved or changed.
reset role;
delete from public.admin_users where id = '00000000-0000-4000-8000-000000000002';
select is(
  (select count(*) from public.admin_expenses),
  5::bigint,
  'removing an admin keeps the expenses they saved or changed'
);

select * from finish();
rollback;
