-- Migration: 20261027000000_public_prices.sql
-- The site's MRPs now follow the admin (the owners' call, 2026-10-27): the
-- base price per product and pack size set on the admin Products page is the
-- MRP the site shows. Until now product_prices never reached the site, and
-- the MRPs were copied into the code by hand, so the two drifted apart.
--
-- get_product_prices() answers [{product_id, size, price}] for every base
-- price, [] when there are none. Like get_product_stock() it's `stable`, so
-- the site calls it with a plain GET, /rest/v1/rpc/get_product_prices?apikey=
-- <anon key>; the `apikey` parameter is ignored (see 20260926000000).
--
-- Only base prices. Coupon prices still come only from check_coupon(), for a
-- code someone already has, and both tables stay closed to anon: this
-- function is the one way in.

create or replace function public.get_product_prices(apikey text default null)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object('product_id', p.product_id, 'size', p.size, 'price', p.price)
      order by p.product_id, p.size
    ),
    '[]'::json
  )
  from public.product_prices p;
$$;

revoke all on function public.get_product_prices(text) from public, anon;
grant execute on function public.get_product_prices(text) to anon, authenticated;
