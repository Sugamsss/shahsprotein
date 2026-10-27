-- 20261027000000: the site reads base prices as its MRPs. get_product_prices()
-- answers every base price to anon, [] when there are none, and never a
-- coupon's price; the tables stay closed. Prices are made up (EXAMPLE10) and
-- everything rolls back at the end.

begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

delete from public.product_prices;
delete from public.coupon_prices;
delete from public.coupons;

select is(public.get_product_prices()::jsonb, '[]'::jsonb, 'no base prices is an empty list');

insert into public.product_prices (product_id, size, price)
values ('muesli', '250 g', 290), ('bites', '250 g', 225);
insert into public.coupons (id, code, description, active)
values ('00000000-0000-4000-c000-000000000001', 'EXAMPLE10', 'A test offer', true);
insert into public.coupon_prices (coupon_id, product_id, size, price)
values ('00000000-0000-4000-c000-000000000001', 'muesli', '250 g', 250);

set local role anon;

select is(
  public.get_product_prices()::jsonb,
  '[{"product_id":"bites","size":"250 g","price":225},{"product_id":"muesli","size":"250 g","price":290}]'::jsonb,
  'anon gets every base price, in product and size order, and no coupon price');
select is(public.get_product_prices('any-key')::jsonb -> 0 ->> 'price', '225', 'the apikey argument is ignored');
select throws_ok('select * from public.product_prices', '42501', null, 'anon still cannot read product_prices');
select throws_ok('select * from public.coupon_prices', '42501', null, 'anon still cannot read coupon_prices');

reset role;
set local role authenticated;

select is(
  public.get_product_prices()::jsonb -> 1 ->> 'price', '290',
  'a signed-in caller gets the same list');

reset role;

select * from finish();
rollback;
