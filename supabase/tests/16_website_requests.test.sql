-- Public sends remain outside active order/kitchen data; only admin confirm
-- activates work. Fake data only; this transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);
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
select ok(not has_function_privilege('anon','public.get_admin_website_requests(text,text,timestamp with time zone,integer,uuid)','execute'),'anon cannot access inbox');
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
select set_config('test.request',(select id::text from public.website_requests limit 1),true);
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok($$select public.get_admin_website_requests()$$,'P0001','Unauthorized','non-admin cannot list requests');
select throws_ok($$select public.dismiss_admin_website_request(current_setting('test.request')::uuid)$$,'P0001','Unauthorized','non-admin cannot dismiss requests');
reset role;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(public.get_admin_website_requests()->'requests'->0->>'state','pending','admin list returns request');
select is(public.dismiss_admin_website_request(current_setting('test.request')::uuid)->>'state','dismissed','admin can dismiss without activating');
reset role;
select is((select count(*)::integer from public.orders),0,'dismissal does not create order');
-- A full send from the current site, confirmed, edited and deleted.
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select lives_ok($$select public.submit_website_request('SN-AB236','[{"product_id":"muesli","size":"250 g","quantity":2}]','Full Example','98000 00003',
  '{"premises":"4 Example Lane","area":"Example Nagar","landmark":"","city":"Satara","state":"Maharashtra","pincode":"415001"}',null)$$,'a complete send is saved');
reset role;
select results_eq($$select phone, delivery_address ->> 'city', delivery_address -> 'landmark', state from public.website_requests where code='SN-AB236'$$,
  $$values ('919800000003'::text,'Satara'::text,'null'::jsonb,'pending'::text)$$,'the phone is normalised and an empty landmark is left out');
select set_config('test.full',(select id::text from public.website_requests where code='SN-AB236'),true);
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select set_config('test.full_order',public.confirm_admin_website_request(current_setting('test.full')::uuid)->'order'->>'id',true);
select is(public.save_admin_order(current_setting('test.full_order')::uuid,'{"name":"Full Example","phone":"9800000003","pincode":"415002",
  "lines":[{"product_id":"muesli","size":"250 g","quantity":2}],
  "delivery_address":{"premises":"5 Example Lane","area":"Example Nagar","city":"Satara","state":"Maharashtra","pincode":"415002"}}')::jsonb->'delivery_address'->>'premises',
  '5 Example Lane','Edit order changes a website order''s address');
select throws_ok($$select public.save_admin_order(current_setting('test.full_order')::uuid,'{"name":"Full Example","phone":"9800000003","pincode":"415001",
  "lines":[{"product_id":"muesli","size":"250 g","quantity":2}],
  "delivery_address":{"premises":"5 Example Lane","area":"Example Nagar","city":"Satara","state":"Maharashtra","pincode":"415002"}}')$$,
  '22023','Pincode must match delivery address.','Edit order keeps the pincode and the address in step');
select is(public.save_admin_order(current_setting('test.full_order')::uuid,'{"name":"Full Example","phone":"9800000003","pincode":"415002",
  "lines":[{"product_id":"muesli","size":"250 g","quantity":1}]}')::jsonb->'delivery_address'->>'premises',
  '5 Example Lane','an edit without the address keeps it');
select throws_ok($$select public.update_admin_order(current_setting('test.full_order')::uuid,'{"pincode":"415003"}')$$,
  '22023','Pincode must match delivery address.','a pincode change alone cannot leave the address behind');
select lives_ok($$select public.delete_admin_order(current_setting('test.full_order')::uuid)$$,'a confirmed website order can be deleted');
reset role;
select is((select count(*)::integer from public.website_requests where code='SN-AB236'),0,'deleting the order takes its request with it');
select * from finish();
rollback;
