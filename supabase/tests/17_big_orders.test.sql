-- Big orders (20261026000000): up to 9,999 packs a line by hand, a pack set by hand
-- is 1 g to 10 kg, and the site still sends at most 10 a line. Fake data only;
-- this transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
delete from public.website_requests;
delete from public.orders;
delete from public.order_rate_limits;
delete from public.kitchen_allocations;
delete from public.kitchen_writeoffs;
delete from public.kitchen_batches;
delete from public.admin_users;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','owner@example.com');
insert into public.admin_users(id,email,display_name) values ('00000000-0000-4000-8000-000000000001','owner@example.com','Owner');

set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Big Example","amount":105000,
    "lines":[{"product_id":"raggi-jaggi","size":"250 g","quantity":700}]}')$$,
  'a 700-pack line saves by hand'
);
select lives_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Bigger Example",
    "lines":[{"product_id":"muesli","size":"250 g","quantity":9999}]}')$$,
  '9,999 packs is the most a line takes'
);
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Too Big",
    "lines":[{"product_id":"muesli","size":"250 g","quantity":10000}]}')$$,
  '22023', 'Each item''s quantity is 1 to 9999.', '10,000 packs is refused with the limit'
);
select lives_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Kilo Example","amount":1800,
    "lines":[{"product_id":"raggi-jaggi","size":"1 kg","quantity":3}]}')$$,
  'a 1 kg pack set by hand saves'
);
reset role;
select results_eq(
  $$select l.grams_each, l.quantity from public.order_lines l join public.orders o on o.id = l.order_id where o.name = 'Kilo Example'$$,
  $$values (1000, 3)$$,
  'a 1 kg pack weighs 1000 g in the kitchen'
);
select results_eq(
  $$select l.quantity from public.order_lines l join public.orders o on o.id = l.order_id where o.name = 'Big Example'$$,
  $$values (700)$$,
  'the big line keeps all its packs'
);
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Heavy Example",
    "lines":[{"product_id":"raggi-jaggi","size":"20 kg","quantity":1}]}')$$,
  '22023', 'A pack is 1 g to 10 kg.', 'a pack over 10 kg is refused'
);
select lives_ok(
  $$select public.save_admin_order(null, '{"source":"call","name":"Sample Example",
    "lines":[{"product_id":"muesli","size":"sample","quantity":2}]}')$$,
  'samples are not weighed against the pack limit'
);
reset role;

set local role anon;
set local request.jwt.claims='{"role":"anon"}';
select throws_ok(
  $$select public.submit_website_request('SN-AB237','[{"product_id":"muesli","size":"250 g","quantity":11}]','Site Example','98000 00004',
    '{"premises":"4 Example Lane","area":"Example Nagar","landmark":"","city":"Satara","state":"Maharashtra","pincode":"415001"}',null)$$,
  '22023', 'Each item''s quantity is 1 to 10.', 'the site still sends at most 10 a line'
);
reset role;

select * from finish();
rollback;
