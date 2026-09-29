-- Local demo data for the admin: the kitchen flow's shared scenario (see the
-- design brief) plus every payment state, for trying the UI and taking
-- screenshots. LOCAL ONLY. It's not in config.toml's seed paths, so
-- `supabase db reset` doesn't load it and `db push` never sends it.
-- Load it by hand after a reset:
--
--   psql "$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')" -f supabase/seeds/local-demo.sql
--
-- Everyone here is made up: names, phones (9198000000xx), codes and prices.
-- The two sign-ins are local test accounts:
--   username demo  (full admin Home)   password local-demo-pass
--   username cook  (the cook's Home)   password local-demo-pass
-- Dates are relative to now, so "this week" always has something in it.
--
-- The kitchen is built through the real functions, in the order it would
-- have happened: the cook logs the batches, then the orders arrive oldest
-- first and take from spare as they come. Nothing writes allocations by hand.

-- Refuse anywhere with real data: production has users and orders.
do $$
begin
  if exists (select 1 from auth.users) or exists (select 1 from public.orders) then
    raise exception 'local-demo.sql only runs on an empty local database (supabase db reset first).';
  end if;
end;
$$;

-- ─── Sign-ins ───────────────────────────────────────────

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('local-demo-pass', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-8000-00000000d001'::uuid, 'demo@admin.shahsnutrition.food'),
  ('00000000-0000-4000-8000-00000000d002'::uuid, 'cook@admin.shahsnutrition.food')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u;

insert into public.admin_users (id, email, display_name, home_view) values
  ('00000000-0000-4000-8000-00000000d001', 'demo@admin.shahsnutrition.food', 'Demo', 'admin'),
  ('00000000-0000-4000-8000-00000000d002', 'cook@admin.shahsnutrition.food', 'Cook', 'cook');

-- ─── Helpers ────────────────────────────────────────────

-- Act as one of the two sign-ins (the admin RPCs check is_admin()).
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', case p_user when 'cook' then '00000000-0000-4000-8000-00000000d002'
                       else '00000000-0000-4000-8000-00000000d001' end,
    'role', 'authenticated')::text, false);
$$;

-- One order added by hand, as the admin form does it. Lines are
-- [product, size, quantity]; a size of "sample" is a free sample.
create function pg_temp.demo_order(
  p_code text, p_source text, p_status text, p_name text, p_phone text, p_pincode text,
  p_amount integer, p_created interval, p_lines jsonb
) returns uuid language sql as $$
  select (public.save_admin_order(null, jsonb_build_object(
    'source', p_source, 'code', p_code, 'status', p_status, 'name', p_name, 'phone', p_phone,
    'pincode', p_pincode, 'amount', p_amount, 'created_at', now() - p_created,
    'lines', (select jsonb_agg(jsonb_build_object('product_id', l ->> 0, 'size', l ->> 1, 'quantity', (l ->> 2)::integer))
              from jsonb_array_elements(p_lines) l)
  ))::jsonb ->> 'id')::uuid;
$$;

create function pg_temp.move(p_code text, p_status text) returns void language sql as $$
  select public.update_admin_order((select id from public.orders where code = p_code), jsonb_build_object('status', p_status));
$$;

-- One payment: amount (null = paid with no total yet), method, note, how long ago.
create function pg_temp.demo_pay(p_code text, p_amount integer, p_method text, p_note text, p_ago interval)
returns void language sql as $$
  insert into public.order_payments (order_id, amount, method, note, paid_at, created_at, created_by)
  select o.id, p_amount, p_method, p_note, now() - p_ago, now() - p_ago, '00000000-0000-4000-8000-00000000d001'
  from public.orders o where o.code = p_code;
$$;

create function pg_temp.day(p_ago integer) returns text language sql as $$
  select to_char((now() at time zone 'Asia/Kolkata')::date - p_ago, 'YYYY-MM-DD');
$$;

-- ─── The kitchen, before the orders ─────────────────────

-- Pranjali's batches: Date Bites 12 days ago (15-day shelf life, so 3 days
-- left), and Raggi Jaggi and Muesli 5 days ago, enough for Tanvi's order and
-- Anil's samples.
select pg_temp.act_as('cook');
select public.log_admin_batches(jsonb_build_array(
  jsonb_build_object('product_id', 'bites', 'grams', 1565, 'made_on', pg_temp.day(12)),
  jsonb_build_object('product_id', 'raggi-jaggi', 'grams', 520, 'made_on', pg_temp.day(5)),
  jsonb_build_object('product_id', 'muesli', 'grams', 520, 'made_on', pg_temp.day(5))
));

-- ─── Orders, oldest first ───────────────────────────────

select pg_temp.act_as('demo');

-- Done: delivered and paid, in every way. Delivered orders are covered by hand.
select pg_temp.demo_order('SN-B2C3D', 'whatsapp', 'delivered', 'Kiran Sawant', '919800000013', '415004', 480,
  '12 days', '[["muesli","500 g",1]]');
select pg_temp.demo_order('SN-E4F5G', 'whatsapp', 'delivered', 'Deepa Yadav', '919800000014', '415002', 900,
  '11 days', '[["raggi-jaggi","500 g",1],["muesli","500 g",1]]');
select pg_temp.demo_order('SN-N9P2Q', 'whatsapp', 'delivered', 'Anjali Bhosale', '919800000009', '415001', 700,
  '7 days', '[["raggi-jaggi","500 g",1],["bites","250 g",1]]');
select pg_temp.demo_order('SN-Y7Z8A', 'instagram', 'delivered', 'Priya Chavan', '919800000012', '415001', 600,
  '5 days', '[["raggi-jaggi","250 g",1],["muesli","250 g",1],["bites","sample",1]]');
select pg_temp.demo_order('SN-R3S4T', 'call', 'delivered', 'Nikhil Mane', '919800000010', '415002', 350,
  '4 days', '[["muesli","250 g",1]]');
select pg_temp.demo_order('SN-V5W6X', 'whatsapp', 'delivered', 'Sneha Kadam', '919800000011', '415003', null,
  '3 days', '[["bites","250 g",2]]');

-- Delivered, money still due.
select pg_temp.demo_order('SN-J7K8M', 'whatsapp', 'delivered', 'Vikram Salunkhe', '919800000008', '415004', 520,
  '6 days', '[["raggi-jaggi","250 g",2]]');
select pg_temp.demo_order('SN-C3D4E', 'whatsapp', 'delivered', 'Rohan Jadhav', '919800000007', '415003', 1180,
  '5 days', '[["raggi-jaggi","500 g",1],["muesli","500 g",1],["bites","250 g",1]]');
select pg_temp.demo_order('SN-F5G6H', 'in_person', 'delivered', 'Pooja Gaikwad', null, null, null,
  '4 days', '[["muesli","250 g",2]]');

-- Cancelled after an advance.
select pg_temp.demo_order('SN-H6J7K', 'whatsapp', 'cancelled', 'Aditya Nikam', '919800000015', '415003', 400,
  '6 days', '[["bites","250 g",2]]');

-- Farah: Date Bites from the old batch, packed and waiting to be dropped off.
select pg_temp.demo_order('SN-W6X7Y', 'whatsapp', 'cooking', 'Farah Shaikh', '919800000005', '415002', 540,
  '5 days', '[["bites","250 g",3]]');
select pg_temp.move('SN-W6X7Y', 'ready');

-- Tanvi: covered by the Raggi Jaggi and Muesli batch, in Packing.
select pg_temp.demo_order('SN-Z8A2B', 'call', 'cooking', 'Tanvi More', '919800000006', '415001', 930,
  '4 days', '[["raggi-jaggi","500 g",1],["muesli","500 g",1]]');

-- Anil: a free sample of each, packed and ready.
select pg_temp.demo_order('SN-M2N3P', 'in_person', 'cooking', 'Anil Kale', '919800000016', '415002', null,
  '3 days 3 hours', '[["raggi-jaggi","sample",1],["muesli","sample",1],["bites","sample",1]]');
select pg_temp.move('SN-M2N3P', 'ready');

-- Asha, from the website: her Date Bites come from spare, Raggi Jaggi waits.
select public.submit_order('SN-A2B3C',
  '[{"product_id":"raggi-jaggi","size":"500 g","quantity":1},{"product_id":"bites","size":"250 g","quantity":2}]',
  'Asha Patil', '415001');

-- Still to cook.
select pg_temp.demo_order('SN-D4E5F', 'whatsapp', 'cooking', 'Ravi Deshmukh', '919800000001', '415002', 450,
  '2 days 3 hours', '[["muesli","500 g",1]]');
select pg_temp.demo_order('SN-S4T5V', 'instagram', 'cooking', 'Neha Pawar', '919800000004', null, null,
  '2 days', '[["raggi-jaggi","250 g",2],["muesli","250 g",1]]');
select pg_temp.demo_order('SN-P2Q3R', 'call', 'cooking', 'Sameer Shinde', '919800000003', '415004', 480,
  '1 day', '[["raggi-jaggi","500 g",1],["bites","sample",1]]');
select pg_temp.demo_order('SN-K8M9N', 'whatsapp', 'cooking', 'Meera Kulkarni', '919800000002', '415001', 480,
  '2 hours', '[["raggi-jaggi","500 g",1]]');
-- Meera's order skips the line: nothing is spare for it yet, so this only
-- puts her first for the next Raggi Jaggi.
update public.orders set priority = true where code = 'SN-K8M9N';

-- A small fresh Date Bites batch from yesterday: nobody is waiting on Date
-- Bites, so all of it is spare, next to the old one.
select pg_temp.act_as('cook');
select public.log_admin_batches(jsonb_build_array(
  jsonb_build_object('product_id', 'bites', 'grams', 150, 'made_on', pg_temp.day(1))
));
select set_config('request.jwt.claims', '', false);

-- ─── When things happened ───────────────────────────────

-- The functions stamp everything "now". Put each order's times where the
-- story has them: Asha ordered on the site 3 days ago, and each order has
-- sat in its stage since (Farah's has been Ready for 4 days).
update public.orders set created_at = now() - interval '3 days' where code = 'SN-A2B3C';

update public.orders o set status_changed_at = coalesce(now() - d.ago, o.created_at)
from (values
  ('SN-A2B3C', null::interval), ('SN-D4E5F', null), ('SN-S4T5V', null), ('SN-P2Q3R', null), ('SN-K8M9N', null),
  ('SN-Z8A2B', null), ('SN-W6X7Y', interval '4 days'), ('SN-M2N3P', interval '1 day'),
  ('SN-F5G6H', interval '1 day'), ('SN-C3D4E', interval '2 days'), ('SN-J7K8M', interval '3 days'),
  ('SN-N9P2Q', interval '2 days'), ('SN-R3S4T', interval '2 days'), ('SN-V5W6X', interval '1 day'),
  ('SN-Y7Z8A', interval '2 days'), ('SN-B2C3D', interval '9 days'), ('SN-E4F5G', interval '8 days'),
  ('SN-H6J7K', interval '5 days')
) as d(code, ago)
where o.code = d.code;

-- History: spread each order's events from when it was made to when it
-- reached its stage, in the order they happened.
update public.order_events e
set at = x.at
from (
  select e2.id,
    o.created_at + (o.status_changed_at - o.created_at)
      * (row_number() over (partition by e2.order_id order by e2.id) - 1)
      / greatest(count(*) over (partition by e2.order_id) - 1, 1) as at
  from public.order_events e2
  join public.orders o on o.id = e2.order_id
) x
where e.id = x.id;

-- ─── Payments ───────────────────────────────────────────

-- An advance on an order still cooking.
select pg_temp.demo_pay('SN-D4E5F', 300, 'upi', null, '2 days');
-- Paid in full up front.
select pg_temp.demo_pay('SN-K8M9N', 480, 'upi', null, '1 hour');
-- 75% up front.
select pg_temp.demo_pay('SN-P2Q3R', 360, 'upi', null, '22 hours');
-- Two parts, two methods, still ₹230 due.
select pg_temp.demo_pay('SN-Z8A2B', 500, 'cash', null, '4 days');
select pg_temp.demo_pay('SN-Z8A2B', 200, 'upi', null, '1 day');
-- Delivered with ₹375 still due.
select pg_temp.demo_pay('SN-C3D4E', 805, 'upi', null, '5 days');
-- Paid in two parts, the rest on delivery.
select pg_temp.demo_pay('SN-N9P2Q', 525, 'bank', null, '7 days');
select pg_temp.demo_pay('SN-N9P2Q', 175, 'cash', null, '2 days');
-- ₹50 extra.
select pg_temp.demo_pay('SN-R3S4T', 400, 'upi', null, '2 days');
-- Paid with no total typed.
select pg_temp.demo_pay('SN-V5W6X', null, 'cash', null, '1 day');
-- Other, with a note.
select pg_temp.demo_pay('SN-Y7Z8A', 600, 'other', 'Paid by her brother', '2 days');
-- Paid before methods existed (no method), last week.
select pg_temp.demo_pay('SN-B2C3D', 480, null, null, '9 days');
-- Paid last week by bank transfer.
select pg_temp.demo_pay('SN-E4F5G', 900, 'bank', null, '8 days');
-- An advance on an order that was cancelled later.
select pg_temp.demo_pay('SN-H6J7K', 200, 'upi', null, '6 days');

-- ─── Prices ─────────────────────────────────────────────

-- Made-up prices, not the real ones. One demo coupon: its price for two
-- packs, and base prices for the rest. Safe to run again on its own.
insert into public.coupons (id, code, description, internal_note) values
  ('00000000-0000-4000-c000-00000000d010', 'EXAMPLE10', '10% off your order', 'Local demo code')
on conflict do nothing;

insert into public.product_prices (product_id, size, price, updated_by) values
  ('raggi-jaggi', '250 g', 260, '00000000-0000-4000-8000-00000000d001'),
  ('raggi-jaggi', '500 g', 480, '00000000-0000-4000-8000-00000000d001'),
  ('muesli', '250 g', 240, '00000000-0000-4000-8000-00000000d001'),
  ('muesli', '500 g', 450, '00000000-0000-4000-8000-00000000d001'),
  ('bites', '250 g', 180, '00000000-0000-4000-8000-00000000d001')
on conflict do nothing;

insert into public.coupon_prices (coupon_id, product_id, size, price, updated_by) values
  ('00000000-0000-4000-c000-00000000d010', 'raggi-jaggi', '250 g', 235, '00000000-0000-4000-8000-00000000d001'),
  ('00000000-0000-4000-c000-00000000d010', 'muesli', '250 g', 215, '00000000-0000-4000-8000-00000000d001')
on conflict do nothing;

-- ─── What you should see ────────────────────────────────

-- Orders by stage, oldest first. "food" is per product: ✓ covered, or what's
-- still waiting. Cooking: Asha (Date Bites ✓, Raggi Jaggi waiting), Ravi,
-- Neha, Sameer (sample ✓), Meera (priority). Packing: Tanvi. Ready: Farah (4 days) and
-- Anil's free samples. Delivered, not paid: Pooja (no total), Rohan (₹375
-- due), Vikram. Then the done ones and Aditya, cancelled.
select o.code, o.name, o.status,
  case when o.free_sample then 'free sample' else public.admin_order_json(o) ->> 'payment_state' end as money,
  (public.admin_order_json(o) ->> 'amount_due') as due,
  case when o.status <> 'cancelled' then (
    select string_agg(c.product_id || case when c.covered >= c.need then ' ✓' else ' waiting ' || (c.need - c.covered) || ' g' end,
      ', ' order by c.product_id)
    from public.kitchen_order_cover(o.id) c) end as food
from public.orders o
order by array_position(array['cooking', 'packing', 'ready', 'delivered', 'cancelled'], o.status),
  (o.status = 'delivered' and o.paid_at is not null), o.created_at;

-- The kitchen: Raggi Jaggi 2 kg to cook for 4 orders, Muesli 750 g for 2,
-- Date Bites nothing. Spare: Date Bites 285 g made 12 days ago (near, 3 days
-- left) and 150 g from yesterday.
select p ->> 'product_id' as product, (p ->> 'to_cook')::integer as to_cook,
  jsonb_array_length(p -> 'queue') as orders_waiting, (p ->> 'spare')::integer as spare,
  (select string_agg((b ->> 'grams') || ' g made ' || (b ->> 'made_on') || ' (' || (b ->> 'state') || ', '
     || (b ->> 'days_left') || ' days left)', '; ')
   from jsonb_array_elements(p -> 'spare_batches') b) as on_the_shelf
from jsonb_array_elements(public.kitchen_state_json() -> 'products') p;
