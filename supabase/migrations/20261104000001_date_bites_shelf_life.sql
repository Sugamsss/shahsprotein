-- Date Bites keep 21 days (was 15), the owners' call on 2026-11-04.
--
-- Only the product's shelf life changes. A batch's expires_on is fixed when it's
-- logged (20261104000000), so batches already logged keep the Exp they were
-- given (and that may already be on their labels); batches logged from now on
-- get made-on day + 21. Near now starts with 4 days left (a fifth of 21).
--
-- Guarded on the old value, so a shelf life someone has already changed on the
-- Products page is left alone.
update public.kitchen_products
   set shelf_life_amount = 21,
       updated_at = timezone('utc', now())
 where product_id = 'bites'
   and shelf_life_amount = 15
   and shelf_life_unit = 'days';
