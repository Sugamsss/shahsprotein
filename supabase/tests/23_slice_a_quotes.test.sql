-- Slice A quote arithmetic, eligibility, snapshot, save/retry, confirmation and
-- admin-read fixtures. Synthetic records only; every write rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

delete from public.order_quote_snapshots;
delete from public.website_quotes;
delete from public.website_requests;
delete from public.orders;
delete from public.order_rate_limits;
delete from public.kitchen_allocations;
delete from public.kitchen_writeoffs;
delete from public.kitchen_batches;
delete from public.product_prices;
delete from public.coupon_prices;
delete from public.coupons;
delete from public.admin_users;
delete from private.slice_a_offer_prices;
delete from private.slice_a_restricted_coupon_codes;
delete from private.slice_a_quote_rate_limits;
update private.slice_a_offer_policy set configured=true, rollout_cutoff='2020-01-01 00:00:00+00',
  guest_min_grams=500, first_min_grams=500, second_min_packs=2, third_min_grams=500,
  delivery_up_to_250=50, delivery_above_250=70, delivery_cap=70
  where singleton;

insert into auth.users(id,email,phone,phone_confirmed_at) values
 ('00000000-0000-4000-8000-000000000001','owner@example.com',null,null),
 ('00000000-0000-4000-8000-000000000002','buyer@example.com','919800000003',now()),
 ('00000000-0000-4000-8000-000000000003','repeat@example.com','919800000005',now());
insert into public.admin_users(id,email,display_name)
values ('00000000-0000-4000-8000-000000000001','owner@example.com','Owner');
insert into public.product_prices(product_id,size,price) values
 ('muesli','250 g',399),('muesli','500 g',699),
 ('raggi-jaggi','250 g',249),('raggi-jaggi','500 g',479),('bites','250 g',319);
insert into private.slice_a_offer_prices(offer_kind,product_id,size,price) values
 ('guest','muesli','250 g',359),('guest','muesli','500 g',629),
 ('guest','raggi-jaggi','250 g',224),('guest','raggi-jaggi','500 g',431),('guest','bites','250 g',287),
 ('first','muesli','250 g',319),('first','muesli','500 g',559),
 ('first','raggi-jaggi','250 g',199),('first','raggi-jaggi','500 g',383),('first','bites','250 g',255),
 ('second','muesli','250 g',279),('second','muesli','500 g',489),
 ('second','raggi-jaggi','250 g',174),('second','raggi-jaggi','500 g',335),('second','bites','250 g',223),
 ('third_plus','muesli','250 g',359),('third_plus','muesli','500 g',629),
 ('third_plus','raggi-jaggi','250 g',224),('third_plus','raggi-jaggi','500 g',431),('third_plus','bites','250 g',287);
-- One confirmed non-site purchase, so this customer quotes at the second tier.
insert into public.orders(code,source,status,name,phone,pincode)
values('SN-TESTA','whatsapp','cooking','Repeat Buyer','919800000005','415001');

select is((select count(*)::integer from private.slice_a_offer_prices where offer_kind='guest'),5,'five guest rates present');
select ok(not has_table_privilege('anon','public.website_quotes','select') and not has_table_privilege('authenticated','public.website_quotes','select'),'quotes are closed to API reads');

-- A guest quote: 250 g Muesli, ₹359 + ₹50 delivery.
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select set_config('test.quote_guest',public.quote_website_order('SN-AB234','[{"product_id":"muesli","size":"250 g","quantity":1}]')::text,true);
select throws_ok($$select public.quote_website_order('SN-AB235','[{"product_id":"muesli","size":"sample","quantity":1}]')$$,'22023','One or more items are not available for this offer.','samples are rejected at the quote boundary');
reset role;
select is(current_setting('test.quote_guest')::jsonb->>'items_total','359','one guest muesli 250 g is ₹359');
select is(current_setting('test.quote_guest')::jsonb->>'delivery_fee','50','250 g guest order has ₹50 delivery');
select is(current_setting('test.quote_guest')::jsonb->>'total','409','guest total includes delivery');
select is(current_setting('test.quote_guest')::jsonb->>'savings','40','guest savings are exact whole rupees');
select is(current_setting('test.quote_guest')::jsonb->>'offer_kind','guest','a signed-out quote is the guest offer');
select is(current_setting('test.quote_guest')::jsonb->>'coupon_code',null::text,'a guest quote names no coupon');
select is(current_setting('test.quote_guest')::jsonb->'free_delivery_rule',
  '{"min_grams":500,"min_packs":null,"up_to_250":50,"above_250":70,"cap":70}'::jsonb,
  'the delivery rule is the policy object, not a string');
select is(jsonb_array_length(current_setting('test.quote_guest')::jsonb->'catalogue'),5,'the catalogue carries all five packs');
select is(current_setting('test.quote_guest')::jsonb->'catalogue'->0,
  '{"product_id":"bites","size":"250 g","mrp":319,"unit_price":287}'::jsonb,
  'the catalogue uses the chosen candidate rate and its MRP, sorted by product and size');
select ok((select expires_at-created_at from public.website_quotes
    where id=(current_setting('test.quote_guest')::jsonb->>'quote_id')::uuid)
    between interval '14 minutes 59 seconds' and interval '15 minutes',
  'a quote expires inside the 15-minute lifetime, whatever the two clocks did');

-- The first tier, submitted twice.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('test.quote_first',public.quote_website_order('SN-AB236','[{"product_id":"muesli","size":"500 g","quantity":1}]')::text,true);
select set_config('test.first_req',public.submit_website_request_v2((current_setting('test.quote_first')::jsonb->>'quote_id')::uuid,'SN-AB236','Test Person','9800000003',
  '{"premises":"1 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')::text,true);
select set_config('test.first_req_retry',public.submit_website_request_v2((current_setting('test.quote_first')::jsonb->>'quote_id')::uuid,'SN-AB236','Test Person','9800000003',
  '{"premises":"1 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')::text,true);
reset role;
select is(current_setting('test.quote_first')::jsonb->>'offer_kind','first','verified Auth phone gets first tier without a purchase');
select is(current_setting('test.quote_first')::jsonb->>'items_total','559','first tier uses the stored rate');
select is(current_setting('test.quote_first')::jsonb->>'delivery_fee','0','first tier 500 g minimum waives delivery');
select is(current_setting('test.quote_first')::jsonb->'free_delivery_rule',
  '{"min_grams":500,"min_packs":null,"up_to_250":50,"above_250":70,"cap":70}'::jsonb,
  'first tier uses the weight-based delivery rule');
select is(current_setting('test.first_req')::jsonb->>'state','pending','valid quote saves one pending website request');
select is(current_setting('test.first_req_retry')::jsonb->>'id',current_setting('test.first_req')::jsonb->>'id','same quote retry returns the same request');

-- The 2-minute send grace, and a retry long after Send.
set local role authenticated;
select set_config('test.quote_grace',public.quote_website_order('SN-AB237','[{"product_id":"muesli","size":"250 g","quantity":1}]')::text,true);
reset role;
update public.website_quotes set created_at=now()-interval '15 minutes 30 seconds',
  expires_at=now()-interval '30 seconds', valid_at_send_until=now()+interval '90 seconds'
  where id=(current_setting('test.quote_grace')::jsonb->>'quote_id')::uuid;
set local role authenticated;
select set_config('test.grace_req',public.submit_website_request_v2((current_setting('test.quote_grace')::jsonb->>'quote_id')::uuid,'SN-AB237','Grace Person','9800000004',
  '{"premises":"2 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')::text,true);
reset role;
select is(current_setting('test.grace_req')::jsonb->>'state','pending','a quote inside the 2-minute send grace is accepted');
update public.website_quotes set submitted_at=now()-interval '10 minutes',
  expires_at=now()-interval '10 minutes', valid_at_send_until=now()-interval '8 minutes'
  where id=(current_setting('test.quote_grace')::jsonb->>'quote_id')::uuid;
set local role authenticated;
select set_config('test.grace_retry',public.submit_website_request_v2((current_setting('test.quote_grace')::jsonb->>'quote_id')::uuid,'SN-AB237','Grace Person','9800000004',
  '{"premises":"2 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')::text,true);
select throws_ok($$select public.submit_website_request_v2((current_setting('test.quote_grace')::jsonb->>'quote_id')::uuid,'SN-AB237','Someone Else','9800000004',
  '{"premises":"2 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')$$,
  '22023','Offer expired. Check your offer again.','a changed payload cannot reuse a saved quote');
reset role;
select is(current_setting('test.grace_retry')::jsonb->>'id',current_setting('test.grace_req')::jsonb->>'id','retry after submitted_at + 2 minutes still returns the same request');

-- The second tier: one pack, ₹50 delivery, the pack-count rule.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select set_config('test.quote_second',public.quote_website_order('SN-AB238','[{"product_id":"muesli","size":"250 g","quantity":1}]')::text,true);
reset role;
select is(current_setting('test.quote_second')::jsonb->>'offer_kind','second','one past purchase gives the second tier');
select is(current_setting('test.quote_second')::jsonb->>'items_total','279','second tier uses the stored rate');
select is(current_setting('test.quote_second')::jsonb->>'delivery_fee','50','one pack misses the two-pack minimum');
select is(current_setting('test.quote_second')::jsonb->'free_delivery_rule',
  '{"min_grams":null,"min_packs":2,"up_to_250":50,"above_250":70,"cap":70}'::jsonb,
  'second tier waives by packs, not grams');

-- A guest save counts toward the phone typed at Send.
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select set_config('test.quote_guest_save',public.quote_website_order('SN-AB239','[{"product_id":"muesli","size":"250 g","quantity":1}]')::text,true);
select set_config('test.guest_req',public.submit_website_request_v2((current_setting('test.quote_guest_save')::jsonb->>'quote_id')::uuid,'SN-AB239','Guest Example','9800000006',
  '{"premises":"3 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')::text,true);
reset role;
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.confirm_admin_website_request((current_setting('test.guest_req')::jsonb->>'id')::uuid);
reset role;
select is(private.slice_a_purchase_tier('919800000006'),'second','a guest site purchase counts toward the typed phone');
select is((select amount from public.orders where phone='919800000006'),409,'the confirmed guest order keeps the saved snapshot total');

-- A promised tier the next confirmation overtook: conflict, then honour.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select set_config('test.quote_conflict',public.quote_website_order('SN-AB23A','[{"product_id":"muesli","size":"500 g","quantity":1}]')::text,true);
select set_config('test.conflict_req',public.submit_website_request_v2((current_setting('test.quote_conflict')::jsonb->>'quote_id')::uuid,'SN-AB23A','Test Person','9800000003',
  '{"premises":"1 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')::text,true);
reset role;
insert into public.orders(code,source,status,name,phone,pincode)
values('SN-TESTB','whatsapp','cooking','Test Person','919800000003','415001');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.conflict_answer',public.confirm_admin_website_request((current_setting('test.conflict_req')::jsonb->>'id')::uuid)::text,true);
reset role;
select is(current_setting('test.conflict_answer')::jsonb->>'state','conflict','an overtaken promise returns conflict');
select is(current_setting('test.conflict_answer')::jsonb->>'promised','first','the conflict keeps the promised tier');
select is(current_setting('test.conflict_answer')::jsonb->>'current','second','the conflict names the current tier');
select is((select count(*)::integer from public.orders where code='SN-AB23A'),0,'a conflict creates no order');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.honour_answer',public.confirm_admin_website_request((current_setting('test.conflict_req')::jsonb->>'id')::uuid,'{"tier_decision":"honour"}')::text,true);
reset role;
select is(current_setting('test.honour_answer')::jsonb->>'state','confirmed','honour confirms the request');
select is((select amount from public.orders where code='SN-AB23A'),559,'honour keeps the saved snapshot as the amount');
select is((select snapshot->>'offer_kind' from public.website_quotes where code='SN-AB23A' order by created_at desc limit 1),'first','honour leaves the saved snapshot untouched');

-- Adjust reprices the same accepted order at the current tier.
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select set_config('test.quote_adjust',public.quote_website_order('SN-AB23B','[{"product_id":"muesli","size":"250 g","quantity":1}]')::text,true);
select set_config('test.adjust_req',public.submit_website_request_v2((current_setting('test.quote_adjust')::jsonb->>'quote_id')::uuid,'SN-AB23B','Repeat Buyer','9800000005',
  '{"premises":"4 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')::text,true);
reset role;
insert into public.orders(code,source,status,name,phone,pincode)
values('SN-TESTC','whatsapp','cooking','Repeat Buyer','919800000005','415001');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.adjust_answer',public.confirm_admin_website_request((current_setting('test.adjust_req')::jsonb->>'id')::uuid,'{"tier_decision":"adjust"}')::text,true);
reset role;
select is(current_setting('test.adjust_answer')::jsonb->>'state','confirmed','adjust confirms the request');
select is((select amount from public.orders where code='SN-AB23B'),409,'adjust reprices at the current tier');
select is((select snapshot->>'offer_kind' from public.website_quotes where code='SN-AB23B' order by created_at desc limit 1),'third_plus','adjust saves the current tier');
select is((select snapshot->>'repriced_from' from public.website_quotes where code='SN-AB23B' order by created_at desc limit 1),'second','adjust records the promised tier');

-- A code another request already holds gets the legacy -N suffix.
insert into public.website_requests(code,message_code,fingerprint,name,phone,pincode,lines)
values('SN-AB23C','SN-AB23C','collision-fixture','Collision Holder','919800000099','415001',
  '[{"product_id":"muesli","size":"250 g","quantity":1}]');
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select set_config('test.quote_collision',public.quote_website_order('SN-AB23C','[{"product_id":"muesli","size":"250 g","quantity":1}]')::text,true);
select set_config('test.collision_req',public.submit_website_request_v2((current_setting('test.quote_collision')::jsonb->>'quote_id')::uuid,'SN-AB23C','Collision Buyer','9800000007',
  '{"premises":"5 Example Road","area":"Example Area","city":"Satara","state":"Maharashtra","pincode":"415001"}')::text,true);
reset role;
select is(current_setting('test.collision_req')::jsonb->>'code','SN-AB23C-2','a taken code gets the next suffix');
select is((select message_code from public.website_requests where code='SN-AB23C-2'),'SN-AB23C','the message keeps the quote''s code');

-- An admin quote shares the policy, prices every paid line and refuses a gap.
insert into public.coupons(code,description,active) values ('EXAMPLE10','Example offer',true);
insert into public.coupon_prices(coupon_id,product_id,size,price)
select id,'muesli','250 g',299 from public.coupons where code='EXAMPLE10';
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.admin_quote',public.quote_admin_order('site',null,'[{"product_id":"muesli","size":"250 g","quantity":1}]')::text,true);
select set_config('test.admin_coupon_quote',public.quote_admin_order('site',null,'[{"product_id":"muesli","size":"250 g","quantity":1}]','EXAMPLE10')::text,true);
select throws_ok($$select public.quote_admin_order('site',null,'[{"product_id":"bites","size":"500 g","quantity":1}]')$$,'22023','A price is not available for one of these items.','an admin quote refuses a paid line with no base price');
reset role;
select is(current_setting('test.admin_quote')::jsonb->>'total','409','an admin site quote prices delivery from the policy');
select is(current_setting('test.admin_quote')::jsonb->'lines'->0->>'unit_price','359','an admin quote carries each paid line''s unit price');
select is(current_setting('test.admin_coupon_quote')::jsonb->>'offer_kind','coupon','a live coupon wins when the whole cart is cheaper');
select is(current_setting('test.admin_coupon_quote')::jsonb->>'total','349','the coupon quote adds the same delivery');
select ok(not has_function_privilege('anon','public.quote_admin_order(text,text,jsonb,text)','execute'),'anon cannot ask for an admin quote');

-- The admin reads, and the find-by-code recovery.
select ok(not has_function_privilege('anon','public.get_admin_website_quote(text)','execute'),'anon cannot find a quote by code');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$select public.get_admin_website_quote('SN-AB23A')$$,'P0001','Unauthorized','a non-admin cannot find a quote by code');
reset role;
select set_config('test.honour_req_id',(select id::text from public.website_requests where code='SN-AB23A'),true);
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select set_config('test.recovered',public.get_admin_website_quote('SN-AB23A')::text,true);
select set_config('test.request_quote',public.get_admin_website_request(current_setting('test.honour_req_id')::uuid)::text,true);
select set_config('test.request_list',public.get_admin_website_requests('confirmed')::text,true);
reset role;
select is(current_setting('test.recovered')::jsonb->'quote'->>'total','559','the admin finds the saved snapshot by code');
select is(current_setting('test.recovered')::jsonb->'request'->>'code','SN-AB23A','the recovered quote names its request');
select is(current_setting('test.recovered')::jsonb->'order'->>'status','cooking','the recovered quote names its order');
select is(current_setting('test.request_quote')::jsonb->'quote'->>'total','559','the request read carries the saved snapshot');
select is((select x->'quote'->>'offer_kind' from jsonb_array_elements(current_setting('test.request_list')::jsonb->'requests') x where x->>'code'='SN-AB23B'),'third_plus','the request list carries each saved snapshot');
select is(public.admin_order_json((select o from public.orders o where o.code='SN-AB23A'))::jsonb->'quote'->>'total','559','the order read carries the saved snapshot');
select * from finish();
rollback;
