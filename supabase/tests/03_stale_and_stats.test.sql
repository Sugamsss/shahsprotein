-- 20260926000005: only site orders go stale, and get_waitlist_count_stats()
-- is internal. Test data is fake (9198000000xx, example.com) and everything
-- rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

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

-- ─── 1. Only site orders go stale ───────────────────────

-- One order per source, all New for 3 days and never kept. The hand-added
-- ones are older than the site one, so the oldest dates below can only come
-- out right if the rule tells them apart.
insert into public.orders (code, source, status, name, pincode, phone, created_at) values
  ('SN-STE22', 'site',      'new', 'Site Example', '415001', null,           now() - interval '3 days'),
  ('SN-WHT22', 'whatsapp',  'new', 'Wa Example',   null,     '919800000021', now() - interval '6 days'),
  ('SN-CKK22', 'call',      'new', 'Call Example', null,     '919800000022', now() - interval '5 days'),
  ('SN-NST22', 'instagram', 'new', 'Insta Example', null,    null,           now() - interval '4 days'),
  ('SN-HND22', 'in_person', 'new', 'Hand Example', null,     null,           now() - interval '4 days');

update public.orders set status_changed_at = now() - interval '3 days';

select results_eq(
  $$select o.source, (public.admin_order_json(o) ->> 'stale')::boolean
    from public.orders o order by o.source$$,
  $$values ('call', false), ('in_person', false), ('instagram', false), ('site', true), ('whatsapp', false)$$,
  'New for 3 days: only the site order is stale; WhatsApp, call, Instagram and in-person orders are not'
);

-- The admin can't read the table directly, so note the dates first.
select set_config('test.oldest_hand', (select created_at::text from public.orders where code = 'SN-WHT22'), true);
select set_config('test.site_at', (select created_at::text from public.orders where code = 'SN-STE22'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  public.get_admin_order('SN-WHT22')::jsonb -> 'stale',
  'false'::jsonb,
  'order page: a hand-added WhatsApp order left in New is not stale'
);

select set_config('test.overview', public.get_admin_overview()::text, true);

select is(
  jsonb_build_object(
    'to_confirm', current_setting('test.overview')::jsonb #> '{queue,to_confirm}',
    'stale', current_setting('test.overview')::jsonb #> '{queue,stale}'),
  '{"to_confirm":4,"stale":1}'::jsonb,
  'overview: the four hand-added orders are to confirm, the site order is stale'
);
select ok(
  (current_setting('test.overview')::jsonb #>> '{queue,to_confirm_oldest}')::timestamptz
    = current_setting('test.oldest_hand')::timestamptz,
  'overview: to_confirm_oldest is the oldest hand-added order'
);
select ok(
  (current_setting('test.overview')::jsonb #>> '{queue,stale_oldest}')::timestamptz
    = current_setting('test.site_at')::timestamptz,
  'overview: stale_oldest is the site order'
);

reset role;

-- ─── 2. get_waitlist_count_stats() is internal ──────────

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
