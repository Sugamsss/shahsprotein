-- Slice A public offer privacy and legacy restricted-code gate. All fixtures
-- are synthetic and the transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

delete from private.slice_a_offer_prices;
delete from private.slice_a_restricted_coupon_codes;
delete from public.product_prices;
delete from public.coupon_prices;
delete from public.coupons;
update private.slice_a_offer_policy set configured=false, guest_min_grams=500, first_min_grams=500,
  second_min_packs=2, third_min_grams=500, delivery_up_to_250=50, delivery_above_250=70, delivery_cap=70
  where singleton;

select ok(not has_table_privilege('anon','private.slice_a_offer_prices','select')
  and not has_table_privilege('authenticated','private.slice_a_offer_prices','select'),
  'offer rates stay private');
select ok(not has_table_privilege('anon','private.slice_a_offer_policy','select'),
  'policy stays private');
select is(public.get_website_offer()->>'status','unavailable',
  'guest offer stays unavailable before owner configuration');

insert into public.product_prices(product_id,size,price) values
 ('muesli','250 g',399),('muesli','500 g',699),
 ('raggi-jaggi','250 g',249),('raggi-jaggi','500 g',479),('bites','250 g',319);
insert into private.slice_a_offer_prices(offer_kind,product_id,size,price) values
 ('guest','muesli','250 g',359),('guest','muesli','500 g',629),
 ('guest','raggi-jaggi','250 g',224),('guest','raggi-jaggi','500 g',431),('guest','bites','250 g',287);
update private.slice_a_offer_policy set configured=true where singleton;
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select is(public.get_website_offer()->>'status','ready','complete guest catalogue is ready');
select is(jsonb_array_length(public.get_website_offer()::jsonb->'packs'),5,'guest offer returns all five packs');
select is(public.get_website_offer()::jsonb->'packs'->0->>'price','287','guest prices are ordered and expose only the configured rate');
select is(public.get_website_offer()::jsonb->'delivery',
  '{"min_grams":500,"min_packs":null,"up_to_250":50,"above_250":70,"cap":70}'::jsonb,
  'guest delivery rule comes from the policy, not a coupon');
reset role;

insert into private.slice_a_restricted_coupon_codes(code) values ('EXAMPLE10');
insert into public.coupons(code,description,active) values ('EXAMPLE10','Example offer',true);
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select is(public.check_coupon('EXAMPLE10')::jsonb,'{"valid": false}'::jsonb,
  'legacy coupon validation does not reveal a restricted code');
select is(public.check_coupon('example10')::jsonb,'{"valid": false}'::jsonb,
  'restricted-code matching ignores case');
reset role;
select ok(not has_function_privilege('anon','private.slice_a_purchase_tier(text)','execute'),
  'anon cannot call private tier helper');
select ok(has_function_privilege('anon','public.get_website_offer(text)','execute'),
  'anon can call the stable guest catalogue RPC');
select * from finish();
rollback;
