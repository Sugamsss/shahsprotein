-- 20260929000000: the last "What's new" note each admin has seen.
-- set_admin_notes_seen() stores an id on the caller's own row, and
-- get_admin_me() returns it. Ids and emails are made up and everything rolls
-- back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

-- The shared local stack may hold other people's test data. Start from an
-- empty admin list; the rollback at the end puts everything back.
delete from public.admin_users;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'cook@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'someone@example.com');

insert into public.admin_users (id, email, display_name)
values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner'),
  ('00000000-0000-4000-8000-000000000002', 'cook@example.com', 'Cook');

-- ─── Who can call it ───────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.set_admin_notes_seen(text)', 'execute')
  and has_function_privilege('authenticated', 'public.set_admin_notes_seen(text)', 'execute'),
  'anon can''t call set_admin_notes_seen; signed-in people can reach it'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$select public.set_admin_notes_seen('2026-09-29-contacts-button')$$,
  'P0001', 'Unauthorized',
  'a signed-in non-admin is refused'
);
reset role;

-- ─── Never set, then set ───────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (public.get_admin_me()::jsonb) -> 'notes_seen',
  'null'::jsonb,
  'get_admin_me: notes_seen is null for someone who never set it'
);

select public.set_admin_notes_seen('2026-09-29-contacts-button');

select is(
  (public.get_admin_me()::jsonb) ->> 'notes_seen',
  '2026-09-29-contacts-button',
  'get_admin_me returns the id just set'
);

select throws_ok(
  $$select public.set_admin_notes_seen('Contacts Button')$$,
  '22023', null,
  'an id that isn''t date-then-slug is refused with 22023'
);

reset role;

-- ─── Only the caller's row ─────────────────────────────

select is(
  (select jsonb_object_agg(display_name, notes_seen) from public.admin_users),
  '{"Owner": "2026-09-29-contacts-button", "Cook": null}'::jsonb,
  'only the caller''s row changed'
);

select * from finish();
rollback;
