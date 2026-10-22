-- Public sends remain outside active order/kitchen data; only admin confirm
-- activates work. Fake data only; this transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
delete from public.website_requests;
delete from public.orders;
delete from public.order_rate_limits;
delete from public.kitchen_allocations;
delete from public.kitchen_writeoffs;
delete from public.kitchen_batches;
delete from public.admin_users;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','owner@example.com'),
 ('00000000-0000-4000-8000-000000000002','other@example.com');
insert into public.admin_users(id,email,display_name) values
 ('00000000-0000-4000-8000-000000000001','owner@example.com','Owner');

select ok(not has_table_privilege('anon','public.website_requests','select') and not has_table_privilege('authenticated','public.website_requests','select'),'request table is closed to API roles');
select ok(has_function_privilege('anon','public.submit_order(text,jsonb,text,text,text)','execute') and has_function_privilege('anon','public.submit_website_request(text,jsonb,text,text,jsonb,text)','execute'),'legacy and new public submission remain callable');
select ok(not has_function_privilege('anon','public.get_admin_website_requests(text,text,timestamp with time zone,integer)','execute'),'anon cannot access inbox');
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select throws_ok($$select public.submit_website_request('SN-AB234','[{"product_id":"muesli","size":"250 g","quantity":1}]','Test Person','',null,null)$$,'22023','Enter a valid phone number.','new endpoint requires phone/address');
select lives_ok($$select public.submit_order('SN-AB235','[{"product_id":"muesli","size":"250 g","quantity":1}]','Test Person','415001')$$,'legacy endpoint safely accepts old payload');
reset role;
select is((select count(*)::integer from public.orders),0,'public website calls create no order');
select is((select count(*)::integer from public.order_lines),0,'public website calls create no lines');
select is((select count(*)::integer from public.kitchen_allocations),0,'public website calls create no allocations');
select is((select count(*)::integer from public.website_requests where is_legacy),1,'legacy call persists incomplete request');
select lives_ok($$select public.submit_order('SN-AB235','[{"product_id":"muesli","size":"250 g","quantity":1}]','Test Person','415001')$$,'legacy retry is harmless');
select is((select count(*)::integer from public.website_requests where message_code='SN-AB235'),1,'retry leaves one request');
select is((select phone from public.website_requests where message_code='SN-AB235'),null,'legacy conversion preserves the absent phone');
select is((select delivery_address from public.website_requests where message_code='SN-AB235'),null::jsonb,'legacy conversion preserves absent address');
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok($$select public.get_admin_website_requests()$$,'P0001','Unauthorized','non-admin cannot list requests');
select throws_ok($$select public.dismiss_admin_website_request((select id from public.website_requests limit 1))$$,'P0001','Unauthorized','non-admin cannot dismiss requests');
reset role;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(public.get_admin_website_requests()->'requests'->0->>'state','pending','admin list returns request');
select is(public.dismiss_admin_website_request((select id from public.website_requests limit 1))->>'state','dismissed','admin can dismiss without activating');
reset role;
select is((select count(*)::integer from public.orders),0,'dismissal does not create order');
select * from finish();
rollback;
