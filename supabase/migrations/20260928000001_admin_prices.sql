-- Migration: 20260928000001_admin_prices.sql
-- Prices for the admin: a base price for each product and pack size, and an
-- optional price per coupon for each pack size. The admin uses them to work
-- out an order's total. Admin only: nothing public changes. check_coupon()
-- still answers only valid + description, and the site never sees a price.
--
-- 1. product_prices: one row per product and size. A missing row means no
--    price yet.
-- 2. coupon_prices: one row per coupon, product and size. A missing row means
--    that size uses the base price. Goes when its coupon goes.
--    Both are keyed like product_stock (there's no products table), but kept
--    apart from it on purpose: the site reads stock, and prices must never be
--    one join away from it. RLS on, no policies, like every order table.
-- 3. get_admin_prices() and set_admin_prices(). set_admin_prices() takes one
--    change (autosave) or many (a sheet) and saves all of them or none.
--
-- Prices are whole rupees, 1 to 99,999. Validation errors use errcode 22023
-- with a plain message the admin screen shows as-is.

-- ═══════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════

create table if not exists public.product_prices (
  product_id text not null check (product_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  size text not null check (size ~ '^[0-9]{1,5} ?(g|kg)$'),
  price integer not null check (price between 1 and 99999),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (product_id, size)
);

create table if not exists public.coupon_prices (
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  product_id text not null check (product_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  size text not null check (size ~ '^[0-9]{1,5} ?(g|kg)$'),
  price integer not null check (price between 1 and 99999),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (coupon_id, product_id, size)
);

alter table public.product_prices enable row level security;
alter table public.coupon_prices enable row level security;

-- No policies: the only way in is the two admin functions below.
revoke all on public.product_prices from anon, authenticated;
revoke all on public.coupon_prices from anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Read
-- ═══════════════════════════════════════════════════════

-- One place for the shape both RPCs return. Internal.
create or replace function public.admin_prices_json()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'base', coalesce((
      select json_agg(
        json_build_object('product_id', p.product_id, 'size', p.size, 'price', p.price)
        order by p.product_id, p.size
      )
      from public.product_prices p
    ), '[]'::json),
    'coupons', coalesce((
      select json_agg(
        json_build_object('coupon_id', cp.coupon_id, 'product_id', cp.product_id, 'size', cp.size, 'price', cp.price)
        order by c.code, cp.product_id, cp.size
      )
      from public.coupon_prices cp
      join public.coupons c on c.id = cp.coupon_id
    ), '[]'::json)
  );
$$;

revoke all on function public.admin_prices_json() from public, anon, authenticated;

-- {"base": [{product_id, size, price}], "coupons": [{coupon_id, product_id,
-- size, price}]}. Empty lists are [], never null.
create or replace function public.get_admin_prices()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return public.admin_prices_json();
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 3. Save
-- ═══════════════════════════════════════════════════════

-- p_prices: [{coupon_id, product_id, size, price}], 1 to 200 of them, with
-- exactly those keys. coupon_id null is the base price; price null deletes
-- that row, a whole number sets it. The same coupon, product and size twice
-- in one call is an error, so the order of the list never matters. Any bad
-- item and nothing is saved. Returns the same as get_admin_prices().
create or replace function public.set_admin_prices(p_prices jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_coupon_id uuid;
  v_product_id text;
  v_size text;
  v_price integer;
  v_seen text[] := '{}';
  v_key text;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_prices is null or jsonb_typeof(p_prices) <> 'array'
     or jsonb_array_length(p_prices) = 0 then
    raise exception using message = 'There are no prices to save.', errcode = '22023';
  end if;

  if jsonb_array_length(p_prices) > 200 then
    raise exception using message = 'Save at most 200 prices at a time.', errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_prices) loop
    if jsonb_typeof(v_item) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(v_item) k)
          is distinct from array['coupon_id', 'price', 'product_id', 'size'] then
      raise exception using
        message = 'Each price needs coupon_id, product_id, size and price, and nothing else.',
        errcode = '22023';
    end if;

    if jsonb_typeof(v_item -> 'product_id') is distinct from 'string'
       or (v_item ->> 'product_id') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
       or jsonb_typeof(v_item -> 'size') is distinct from 'string'
       or (v_item ->> 'size') !~ '^[0-9]{1,5} ?(g|kg)$' then
      raise exception using message = 'That product or size doesn''t look right.', errcode = '22023';
    end if;

    v_product_id := v_item ->> 'product_id';
    v_size := v_item ->> 'size';

    -- A JSON number with no fraction or exponent: 240, not 240.5, "240" or 2.4e2.
    if jsonb_typeof(v_item -> 'price') = 'null' then
      v_price := null;
    elsif jsonb_typeof(v_item -> 'price') = 'number'
          and (v_item ->> 'price') ~ '^[0-9]{1,5}$'
          and (v_item ->> 'price')::integer between 1 and 99999 then
      v_price := (v_item ->> 'price')::integer;
    else
      raise exception using message = 'Prices are whole rupees from 1 to 99,999.', errcode = '22023';
    end if;

    if jsonb_typeof(v_item -> 'coupon_id') = 'null' then
      v_coupon_id := null;
    elsif jsonb_typeof(v_item -> 'coupon_id') = 'string'
          and (v_item ->> 'coupon_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_coupon_id := (v_item ->> 'coupon_id')::uuid;
      -- key share: the coupon can't be deleted under us before the insert.
      perform 1 from public.coupons where id = v_coupon_id for key share;
      if not found then
        raise exception using message = 'We couldn''t find that code. Refresh the list and try again.', errcode = '22023';
      end if;
    else
      raise exception using message = 'We couldn''t find that code. Refresh the list and try again.', errcode = '22023';
    end if;

    v_key := coalesce(v_coupon_id::text, 'base') || '|' || v_product_id || '|' || v_size;
    if v_key = any (v_seen) then
      raise exception using message = 'The same price is in the list twice.', errcode = '22023';
    end if;
    v_seen := v_seen || v_key;

    -- Writes happen as we go; an error on a later item rolls them all back.
    if v_coupon_id is null then
      if v_price is null then
        delete from public.product_prices
        where product_id = v_product_id and size = v_size;
      else
        insert into public.product_prices as p (product_id, size, price, updated_by)
        values (v_product_id, v_size, v_price, auth.uid())
        on conflict (product_id, size) do update
        set price = excluded.price,
            updated_at = timezone('utc', now()),
            updated_by = excluded.updated_by
        where p.price is distinct from excluded.price;
      end if;
    else
      if v_price is null then
        delete from public.coupon_prices
        where coupon_id = v_coupon_id and product_id = v_product_id and size = v_size;
      else
        insert into public.coupon_prices as p (coupon_id, product_id, size, price, updated_by)
        values (v_coupon_id, v_product_id, v_size, v_price, auth.uid())
        on conflict (coupon_id, product_id, size) do update
        set price = excluded.price,
            updated_at = timezone('utc', now()),
            updated_by = excluded.updated_by
        where p.price is distinct from excluded.price;
      end if;
    end if;
  end loop;

  return public.admin_prices_json();
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 4. Grants
-- ═══════════════════════════════════════════════════════

-- Supabase grants execute on new functions to anon and authenticated by
-- default; admin RPCs are for signed-in admins only (is_admin() inside).
revoke all on function public.get_admin_prices() from public, anon;
grant execute on function public.get_admin_prices() to authenticated;

revoke all on function public.set_admin_prices(jsonb) from public, anon;
grant execute on function public.set_admin_prices(jsonb) to authenticated;
