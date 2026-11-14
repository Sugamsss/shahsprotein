-- 20261114000001: vendors on expenses.
-- One spelling per vendor, kept case-insensitively; trimmed and collapsed; the
-- field is touched only when the key is sent; the vendor is searchable; and
-- get_admin_expense_vendors lists who was used before, live rows only.
-- Fixtures are made up and everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

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

-- India's today, fixed for this transaction, and the saved ids to carry between roles.
create temporary table exp_today as
select (timezone('Asia/Kolkata', now()))::date as today;
create temporary table exp_ids (label text primary key, id uuid, saved jsonb);
grant select, insert on exp_today, exp_ids to authenticated;

-- ─── Who can call the vendors list ──────────────────────

select ok(
  not has_function_privilege('anon', 'public.get_admin_expense_vendors()', 'execute')
  and has_function_privilege('authenticated', 'public.get_admin_expense_vendors()', 'execute'),
  'anon cannot call the vendors list; signed-in people can reach it'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.get_admin_expense_vendors()$$, 'P0001', 'Unauthorized',
  'a signed-in non-admin cannot read the vendors list'
);

-- ─── Saving: trim, collapse, one spelling ───────────────

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into exp_ids (label, id, saved)
select 'patil', (s.j ->> 'id')::uuid, s.j
from (select public.save_admin_expense(null, jsonb_build_object(
  'spent_on', (select today from exp_today) - 3,
  'spent_at', '09:00',
  'title', 'Jaggi powder',
  'vendor', '  Patil   Traders  ',
  'amount', 2750
)) as j) s;

select is(
  (select saved ->> 'vendor' from exp_ids where label = 'patil'),
  'Patil Traders',
  'the vendor is trimmed and its inner spaces collapsed'
);

select ok(
  (select saved from exp_ids where label = 'patil') ? 'vendor',
  'the saved row carries the vendor'
);

insert into exp_ids (label, id, saved)
select 'pune', (s.j ->> 'id')::uuid, s.j
from (select public.save_admin_expense(null, jsonb_build_object(
  'spent_on', (select today from exp_today) - 2,
  'spent_at', '10:00',
  'title', 'Courier to Pune',
  'vendor', 'patil traders',
  'amount', 185
)) as j) s;

select is(
  (select saved ->> 'vendor' from exp_ids where label = 'pune'),
  'Patil Traders',
  'a different case saves the spelling already on a live row'
);

insert into exp_ids (label, id, saved)
select 'satara', (s.j ->> 'id')::uuid, s.j
from (select public.save_admin_expense(null, jsonb_build_object(
  'spent_on', (select today from exp_today) - 2,
  'spent_at', '11:00',
  'title', 'Zip pouches',
  'vendor', 'Satara  Packaging',
  'amount', 3200
)) as j) s;

select is(
  (select saved ->> 'vendor' from exp_ids where label = 'satara'),
  'Satara Packaging',
  'a vendor with a double space saves one space'
);

insert into exp_ids (label, id, saved)
select 'gas', (s.j ->> 'id')::uuid, s.j
from (select public.save_admin_expense(null, jsonb_build_object(
  'spent_on', (select today from exp_today) - 1,
  'spent_at', '12:00',
  'title', 'Gas cylinder',
  'amount', 1150
)) as j) s;

select is(
  (select saved ->> 'vendor' from exp_ids where label = 'gas'),
  '',
  'an expense saved without a vendor has an empty one, never null'
);

-- The key is what decides: an older admin tab saves the same expense without it.
select is(
  public.save_admin_expense(
    (select id from exp_ids where label = 'satara'),
    jsonb_build_object(
      'spent_on', (select today from exp_today) - 2, 'spent_at', '11:00', 'title', 'Zip pouches, 500 pcs', 'amount', 3300
    )
  ) ->> 'vendor',
  'Satara Packaging',
  'editing without the vendor key leaves the vendor as it was'
);

select is(
  public.save_admin_expense(
    (select id from exp_ids where label = 'satara'),
    jsonb_build_object(
      'spent_on', (select today from exp_today) - 2, 'spent_at', '11:00', 'title', 'Zip pouches, 500 pcs',
      'vendor', 'satara packaging', 'amount', 3300
    )
  ) ->> 'vendor',
  'Satara Packaging',
  'editing snaps to the spelling that entry already had'
);

select is(
  public.save_admin_expense(
    (select id from exp_ids where label = 'gas'),
    jsonb_build_object(
      'spent_on', (select today from exp_today) - 1, 'spent_at', '12:00', 'title', 'Gas cylinder',
      'vendor', '  ', 'amount', 1150
    )
  ) ->> 'vendor',
  '',
  'spaces alone mean no vendor'
);

select throws_ok(
  format(
    $$select public.save_admin_expense(null, jsonb_build_object('spent_on',%L,'spent_at','09:00','title','Tote bags','vendor',%L,'amount',10))$$,
    (select today from exp_today) - 1,
    repeat('v', 81)
  ),
  '22023', 'That vendor name is too long.', 'a vendor over 80 characters is refused'
);

select lives_ok(
  format(
    $$select public.save_admin_expense(null, jsonb_build_object('spent_on',%L,'spent_at','09:00','title','Tote bags, 80','vendor',%L,'amount',10))$$,
    (select today from exp_today) - 1,
    repeat('v', 80)
  ),
  '80 characters is allowed'
);

select throws_ok(
  $$select public.save_admin_expense(null, jsonb_build_object('spent_on','2026-06-01','spent_at','09:00','title','Tote bags','vendor',42,'amount',10))$$,
  '22023', null, 'a vendor that is not text is refused'
);

-- Direct SQL bypasses the RPC, so the column's own limit still has to hold.
reset role;
select throws_ok(
  $$insert into public.admin_expenses (spent_on, spent_at, title, vendor, amount)
    values ('2026-06-01', '09:00', 'Too long', repeat('v', 81), 10)$$,
  '23514', null, 'the column itself refuses a vendor over 80 characters'
);
delete from public.admin_expenses where title like 'Tote bags%';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- ─── Search ─────────────────────────────────────────────

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today), 'patil') -> 'expenses'
  )),
  2::bigint,
  'search finds a vendor, any case'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 31, (select today from exp_today), 'Zip') -> 'expenses'
  )),
  1::bigint,
  'the title is still searched'
);

select is(
  (select count(*) from jsonb_array_elements(
    public.get_admin_expenses((select today from exp_today) - 1, (select today from exp_today), 'Zip') -> 'expenses'
  )),
  0::bigint,
  'the range still applies when searching a vendor-titled row'
);

-- ─── The vendors list ───────────────────────────────────

select is(
  jsonb_array_length(public.get_admin_expense_vendors()),
  2,
  'only vendors with a live entry are listed'
);

select is(
  public.get_admin_expense_vendors() -> 0,
  jsonb_build_object(
    'name', 'Satara Packaging',
    'count', 1,
    'last_used', to_char((select today from exp_today) - 2, 'YYYY-MM-DD')
  ),
  'the newest vendor comes first, with its count and its day'
);

select is(
  public.get_admin_expense_vendors() -> 1,
  jsonb_build_object(
    'name', 'Patil Traders',
    'count', 2,
    'last_used', to_char((select today from exp_today) - 2, 'YYYY-MM-DD')
  ),
  'two spellings of one vendor are one entry, counted twice'
);

-- A row written before this migration may hold another case; the suggestion takes
-- the spelling of the most recent entry. Inserted by hand, since the RPC would snap it.
reset role;
insert into public.admin_expenses (spent_on, spent_at, title, vendor, amount)
values ((select today from exp_today) - 2, '12:00', 'Legacy courier', 'patil traders', 20);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.get_admin_expense_vendors() -> 0,
  jsonb_build_object(
    'name', 'patil traders',
    'count', 3,
    'last_used', to_char((select today from exp_today) - 2, 'YYYY-MM-DD')
  ),
  'the name comes from the most recent entry'
);

-- ─── Deleted rows ───────────────────────────────────────

select is(
  public.delete_admin_expense((select id from exp_ids where label = 'satara')) ->> 'deleted',
  'true',
  'the packaging shop expense is deleted'
);

select is(
  jsonb_array_length(public.get_admin_expense_vendors()),
  1,
  'a deleted entry takes its vendor out of the list'
);

select is(
  (public.get_admin_expense_vendors() -> 0 ->> 'count')::integer,
  3,
  'and the counts of the vendors still there are untouched'
);

select is(
  public.delete_admin_expense((select id from exp_ids where label = 'satara'), false) ->> 'deleted',
  'false',
  'Undo brings the expense back'
);

select is(
  jsonb_array_length(public.get_admin_expense_vendors()),
  2,
  'so its vendor is suggested again'
);

-- ─── At most 200, newest first ──────────────────────────

reset role;
insert into public.admin_expenses (spent_on, spent_at, title, vendor, amount)
select
  (select today from exp_today) - 5,
  '09:00',
  'Filler ' || n,
  'Vendor ' || lpad(n::text, 3, '0'),
  5
from generate_series(1, 202) n;
reset role;
delete from public.admin_expenses where title = 'Legacy courier';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  jsonb_array_length(public.get_admin_expense_vendors()),
  200,
  'the list stops at 200 vendors'
);

select is(
  (public.get_admin_expense_vendors() -> 0 ->> 'name'),
  'Satara Packaging',
  'the 200 kept are the newest ones'
);

select * from finish();
rollback;
