-- Slice A offer policy. Offer inputs are private and empty until an owner
-- configures the approved policy and rates; no customer offer is seeded here.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create table private.slice_a_offer_policy (
  singleton boolean primary key default true check (singleton),
  rollout_cutoff timestamptz not null,
  guest_min_grams integer not null default 500 check (guest_min_grams > 0),
  first_min_grams integer not null default 500 check (first_min_grams > 0),
  second_min_packs integer not null default 2 check (second_min_packs > 0),
  third_min_grams integer not null default 500 check (third_min_grams > 0),
  delivery_up_to_250 integer not null default 50 check (delivery_up_to_250 >= 0),
  delivery_above_250 integer not null default 70 check (delivery_above_250 >= delivery_up_to_250),
  delivery_cap integer not null default 70 check (delivery_cap >= delivery_above_250),
  configured boolean not null default false
);
insert into private.slice_a_offer_policy(singleton, rollout_cutoff)
values (true, transaction_timestamp());

create table private.slice_a_source_policy (
  source text primary key check (source in ('site','whatsapp','call','instagram','in_person')),
  offer_kind text not null check (offer_kind in ('guest','first','second','third_plus','repeat','unconfigured')),
  configured boolean not null default false
);
insert into private.slice_a_source_policy(source, offer_kind, configured)
values ('site','guest',true), ('whatsapp','unconfigured',false),
       ('call','unconfigured',false), ('instagram','unconfigured',false),
       ('in_person','unconfigured',false);

create table private.slice_a_offer_prices (
  offer_kind text not null check (offer_kind in ('guest','first','second','third_plus','repeat')),
  product_id text not null check (product_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  size text not null check (size in ('250 g','500 g')),
  price integer not null check (price > 0),
  primary key (offer_kind, product_id, size)
);

create table private.slice_a_restricted_coupon_codes (
  code text primary key check (code ~ '^[A-Z0-9-]{3,24}$')
);

revoke all on all tables in schema private from public, anon, authenticated;

-- Eligibility is based only on confirmed, post-cutoff orders: an order from the
-- site counts when its quote belongs to this verified phone, or when it was a
-- guest save and the order carries the phone typed at Send.
create or replace function private.slice_a_purchase_tier(p_phone text)
returns text language plpgsql stable security definer set search_path = public, private as $$
declare n integer;
begin
  if p_phone is null or p_phone !~ '^[1-9][0-9]{10,14}$' then return 'guest'; end if;
  select count(*) into n
  from public.orders o cross join private.slice_a_offer_policy p
  where o.created_at >= p.rollout_cutoff
    and o.status <> 'cancelled' and not o.free_sample
    and (case when o.source='site' then exists (
      select 1 from public.website_quotes q
      where q.confirmed_order_id=o.id
        and (q.verified_phone=p_phone or (q.verified_phone is null and o.phone=p_phone))
    ) else o.phone=p_phone end)
    and not exists (select 1 from public.order_payments pay where pay.order_id=o.id and pay.method='gift');
  return case when n=0 then 'first' when n=1 then 'second' else 'third_plus' end;
end $$;
revoke all on function private.slice_a_purchase_tier(text) from public, anon, authenticated;

-- This gate is shared with legacy coupon checking: private tier codes never
-- become a public code-validation oracle.
create or replace function private.slice_a_is_restricted_code(p_code text)
returns boolean language sql stable security definer set search_path = private as $$
  select exists (select 1 from private.slice_a_restricted_coupon_codes where code=upper(btrim(p_code)))
$$;
revoke all on function private.slice_a_is_restricted_code(text) from public, anon, authenticated;

-- Return the complete guest catalogue from one database snapshot. Empty or
-- partial policy data is unavailable, never a partial set of prices.
create or replace function public.get_website_offer(apikey text default null)
returns json language plpgsql stable security definer set search_path = public, private as $$
declare result json; v_version text; v_time timestamptz := statement_timestamp();
begin
  select md5(coalesce(string_agg(p.product_id||'|'||p.size||'|'||p.price::text,',' order by p.product_id,p.size),''))
    into v_version from private.slice_a_offer_prices p where p.offer_kind='guest';
  if not exists(select 1 from private.slice_a_offer_policy where singleton and configured)
     or (select count(*) from private.slice_a_offer_prices where offer_kind='guest') <> 5
     or exists(select 1 from private.slice_a_offer_prices p left join public.product_prices m using(product_id,size)
                where p.offer_kind='guest' and (m.price is null or p.price>m.price)) then
    return json_build_object('schema_version',1,'status','unavailable','server_time',v_time,'currency','INR');
  end if;
  select json_build_object(
    'schema_version',1,'status','ready','version',v_version,'server_time',v_time,
    'expires_at',v_time+interval '5 minutes','currency','INR',
    'offer',json_build_object('label','Guest','kind','guest'),
    'packs',(select json_agg(json_build_object('product_id',p.product_id,'size',p.size,
       'grams',public.order_size_grams(p.size),'mrp',m.price,'price',p.price) order by p.product_id,p.size)
       from private.slice_a_offer_prices p join public.product_prices m using(product_id,size) where p.offer_kind='guest'),
    'delivery',(select json_build_object('min_grams',guest_min_grams,'min_packs',null,
       'up_to_250',delivery_up_to_250,'above_250',delivery_above_250,'cap',delivery_cap)
       from private.slice_a_offer_policy where singleton)
  ) into result;
  return result;
end $$;
revoke all on function public.get_website_offer(text) from public;
grant execute on function public.get_website_offer(text) to anon, authenticated;

-- A legacy tab cannot validate restricted offer codes. Ordinary coupon behavior
-- remains unchanged and its existing IP limiter still runs first.
create or replace function public.check_coupon(p_code text)
returns json language plpgsql security definer set search_path = public, private, extensions as $$
declare
  request_headers text := current_setting('request.headers', true);
  request_ip text := 'unknown'; request_hash text; v_code text; v_coupon_id uuid;
  v_description text; attempts integer;
begin
  if request_headers is not null and request_headers <> '' then
    request_ip := coalesce(nullif(trim(request_headers::jsonb->>'cf-connecting-ip'),''),
      nullif(trim(split_part(request_headers::jsonb->>'x-forwarded-for',',',1)),''),'unknown');
  end if;
  request_hash := left(encode(digest(request_ip,'sha256'),'hex'),64);
  perform pg_advisory_xact_lock(hashtext('check_coupon:'||request_hash));
  delete from public.coupon_check_rate_limits where attempted_at < timezone('utc',now())-interval '1 hour';
  select count(*) into attempts from public.coupon_check_rate_limits
   where request_key=request_hash and attempted_at>timezone('utc',now())-interval '1 hour';
  if attempts>=30 then raise exception using message='Too many coupon checks. Try again later.',errcode='PT429'; end if;
  insert into public.coupon_check_rate_limits(request_key) values(request_hash);
  v_code:=btrim(p_code,E' \t\r\n');
  if v_code is null or v_code !~ '^[A-Za-z0-9-]{3,24}$' or private.slice_a_is_restricted_code(v_code) then
    return json_build_object('valid',false);
  end if;
  select c.id,c.description into v_coupon_id,v_description from public.coupons c
   where upper(c.code)=upper(v_code) and c.active and (c.expires_at is null or c.expires_at>now());
  if v_description is null then return json_build_object('valid',false); end if;
  return json_build_object('valid',true,'description',v_description,'prices',coalesce((
    select json_agg(json_build_object('product_id',cp.product_id,'size',cp.size,'price',cp.price)
      order by cp.product_id,cp.size) from public.coupon_prices cp where cp.coupon_id=v_coupon_id),'[]'::json));
end $$;
revoke all on function public.check_coupon(text) from public;
grant execute on function public.check_coupon(text) to anon, authenticated;
