-- Local demo data for the admin: an order book with every payment state, for
-- trying the UI and taking screenshots. LOCAL ONLY. It's not in config.toml's
-- seed paths, so `supabase db reset` doesn't load it and `db push` never sends it.
-- Load it by hand after a reset:
--
--   psql "$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')" -f supabase/seeds/local-demo.sql
--
-- Everyone here is made up: names, phones (9198000000xx) and codes. The two
-- sign-ins are local test accounts:
--   username demo  (full admin Home)   password local-demo-pass
--   username cook  (the cook's Home)   password local-demo-pass
-- Dates are relative to now, so "this week" always has something in it.

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

-- ─── Orders ─────────────────────────────────────────────

-- One order with its lines. Every order starts not paid; payments come after.
create function pg_temp.demo_order(
  p_code text, p_source text, p_status text, p_name text, p_phone text, p_pincode text,
  p_amount integer, p_created interval, p_status_changed interval, p_lines jsonb
) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.orders (code, source, status, name, phone, pincode, amount, created_at, status_changed_at, created_by)
  values (p_code, p_source, p_status, p_name, p_phone, p_pincode, p_amount,
    now() - p_created, now() - p_status_changed,
    case when p_source <> 'site' then '00000000-0000-4000-8000-00000000d001'::uuid end)
  returning id into v_id;

  insert into public.order_lines (order_id, product_id, size, quantity)
  select v_id, l ->> 0, l ->> 1, (l ->> 2)::integer from jsonb_array_elements(p_lines) l;

  return v_id;
end;
$$;

-- One payment: amount (null = paid with no total yet), method, note, how long ago.
create function pg_temp.demo_pay(p_code text, p_amount integer, p_method text, p_note text, p_ago interval)
returns void language sql as $$
  insert into public.order_payments (order_id, amount, method, note, paid_at, created_at, created_by)
  select o.id, p_amount, p_method, p_note, now() - p_ago, now() - p_ago, '00000000-0000-4000-8000-00000000d001'
  from public.orders o where o.code = p_code;
$$;

-- To confirm, and one stale site order.
select pg_temp.demo_order('SN-A2B3C', 'site', 'new', 'Asha Patil', null, '415001', null,
  '2 hours', '2 hours', '[["raggi-jaggi","500 g",1],["bites","250 g",2]]');
select pg_temp.demo_order('SN-D4E5F', 'whatsapp', 'new', 'Ravi Deshmukh', '919800000001', '415002', 640,
  '5 hours', '5 hours', '[["muesli","500 g",1]]');
select pg_temp.demo_order('SN-G6H7J', 'site', 'new', 'Kavya Joshi', null, '415003', null,
  '3 days', '3 days', '[["bites","250 g",1]]');

-- To send.
select pg_temp.demo_order('SN-K8M9N', 'whatsapp', 'confirmed', 'Meera Kulkarni', '919800000002', '415001', 780,
  '1 day', '20 hours', '[["raggi-jaggi","250 g",2],["muesli","250 g",1]]');
select pg_temp.demo_order('SN-P2Q3R', 'call', 'confirmed', 'Sameer Shinde', '919800000003', '415004', 1200,
  '1 day', '22 hours', '[["raggi-jaggi","500 g",2],["bites","250 g",2]]');
select pg_temp.demo_order('SN-S4T5V', 'instagram', 'confirmed', 'Neha Pawar', '919800000004', null, null,
  '10 hours', '9 hours', '[["muesli","250 g",1]]');

-- On the way.
select pg_temp.demo_order('SN-W6X7Y', 'whatsapp', 'sent', 'Farah Shaikh', '919800000005', '415002', 450,
  '3 days', '1 day', '[["bites","250 g",3]]');
select pg_temp.demo_order('SN-Z8A2B', 'call', 'sent', 'Tanvi More', '919800000006', '415001', 960,
  '3 days', '1 day', '[["raggi-jaggi","500 g",1],["muesli","500 g",1]]');

-- To collect: delivered, money still due.
select pg_temp.demo_order('SN-C3D4E', 'whatsapp', 'delivered', 'Rohan Jadhav', '919800000007', '415003', 1500,
  '5 days', '2 days', '[["raggi-jaggi","500 g",2],["muesli","500 g",1],["bites","250 g",1]]');
select pg_temp.demo_order('SN-F5G6H', 'in_person', 'delivered', 'Pooja Gaikwad', null, null, null,
  '4 days', '1 day', '[["muesli","250 g",2]]');
select pg_temp.demo_order('SN-J7K8M', 'whatsapp', 'delivered', 'Vikram Salunkhe', '919800000008', '415004', 520,
  '6 days', '3 days', '[["raggi-jaggi","250 g",2]]');

-- Done: delivered and paid, in every way.
select pg_temp.demo_order('SN-N9P2Q', 'whatsapp', 'delivered', 'Anjali Bhosale', '919800000009', '415001', 700,
  '7 days', '2 days', '[["raggi-jaggi","500 g",1],["bites","250 g",1]]');
select pg_temp.demo_order('SN-R3S4T', 'call', 'delivered', 'Nikhil Mane', '919800000010', '415002', 350,
  '4 days', '2 days', '[["muesli","250 g",1]]');
select pg_temp.demo_order('SN-V5W6X', 'whatsapp', 'delivered', 'Sneha Kadam', '919800000011', '415003', null,
  '3 days', '1 day', '[["bites","250 g",2]]');
select pg_temp.demo_order('SN-Y7Z8A', 'instagram', 'delivered', 'Priya Chavan', '919800000012', '415001', 600,
  '5 days', '2 days', '[["raggi-jaggi","250 g",1],["muesli","250 g",1]]');
select pg_temp.demo_order('SN-B2C3D', 'whatsapp', 'delivered', 'Kiran Sawant', '919800000013', '415004', 480,
  '12 days', '9 days', '[["muesli","500 g",1]]');
select pg_temp.demo_order('SN-E4F5G', 'whatsapp', 'delivered', 'Deepa Yadav', '919800000014', '415002', 900,
  '11 days', '8 days', '[["raggi-jaggi","500 g",1],["muesli","500 g",1]]');

-- Cancelled after an advance.
select pg_temp.demo_order('SN-H6J7K', 'whatsapp', 'cancelled', 'Aditya Nikam', '919800000015', '415003', 400,
  '6 days', '5 days', '[["bites","250 g",2]]');

-- ─── Payments ───────────────────────────────────────────

-- Part paid while still new: an advance.
select pg_temp.demo_pay('SN-D4E5F', 300, 'upi', null, '4 hours');
-- Paid in full up front.
select pg_temp.demo_pay('SN-K8M9N', 780, 'upi', null, '20 hours');
-- 75% up front.
select pg_temp.demo_pay('SN-P2Q3R', 900, 'upi', null, '22 hours');
-- Two parts, two methods, still ₹260 due.
select pg_temp.demo_pay('SN-Z8A2B', 500, 'cash', null, '2 days');
select pg_temp.demo_pay('SN-Z8A2B', 200, 'upi', null, '1 day');
-- Delivered with ₹375 still due.
select pg_temp.demo_pay('SN-C3D4E', 1125, 'upi', null, '5 days');
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

-- What you should see.
select o.code, o.status, o.amount,
  (public.admin_order_json(o) ->> 'payment_state') as state,
  (public.admin_order_json(o) ->> 'amount_paid') as paid,
  (public.admin_order_json(o) ->> 'amount_due') as due,
  (public.admin_order_json(o) ->> 'amount_extra') as extra
from public.orders o
order by o.created_at desc;
