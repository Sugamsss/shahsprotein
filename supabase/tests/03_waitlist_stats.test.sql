-- 20260926000005: get_waitlist_count_stats() is internal. (Its other half,
-- the stale rule, went with the confirm step in 20260929000000.) Test data is
-- fake (example.com) and everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

-- The shared local stack may hold other people's test data. Start from
-- empty tables; the rollback at the end puts everything back.
delete from public.orders;
delete from public.order_rate_limits;
delete from public.waitlist_members;
delete from public.admin_users;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com');

insert into public.admin_users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'owner@example.com', 'Owner');

-- ─── get_waitlist_count_stats() is internal ──────────

insert into public.waitlist_members (email, source) values ('member@example.com', 'hero');

set local role anon;
select throws_ok('select public.get_waitlist_count_stats()', '42501', null, 'anon cannot call get_waitlist_count_stats');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok('select public.get_waitlist_count_stats()', '42501', null,
  'authenticated (even an admin) cannot call get_waitlist_count_stats directly');

select is(
  (public.get_admin_email_list()::jsonb -> 'stats') - array['spam', 'marketing_consent', 'verified'],
  '{"total":1,"active":1,"unsubscribed":0,"bounced":0}'::jsonb,
  'get_admin_email_list still returns stats for an admin'
);
reset role;

select ok(
  not has_function_privilege('public', 'public.get_waitlist_count_stats()', 'execute'),
  'PUBLIC has no execute on get_waitlist_count_stats'
);

select * from finish();
rollback;
