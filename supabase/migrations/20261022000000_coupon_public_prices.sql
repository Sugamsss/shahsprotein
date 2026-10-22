-- Migration: 20261022000000_coupon_public_prices.sql
-- The site now shows MRPs (the founder's call, 2026-10-22), so a coupon the
-- server accepts also tells the order popup its own prices. check_coupon()
-- answers {"valid": true, "description": "...", "prices": [{product_id,
-- size, price}]} or {"valid": false}, as before plus `prices`.
--
-- `prices` lists only that coupon's rows in coupon_prices: a pack without one
-- uses the MRP the site already shows. Base prices (product_prices) and other
-- coupons' prices are never returned, and the tables stay closed to anon. The
-- rate limit is unchanged (30 checks per IP per hour), so prices can only be
-- read for a code someone already has.

create or replace function public.check_coupon(p_code text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_headers text := current_setting('request.headers', true);
  v_request_ip text := 'unknown';
  v_request_hash text;
  v_code text;
  v_coupon_id uuid;
  v_description text;
  attempts integer;
begin
  -- Rate limit first, before looking at the code (see 20260925000000).
  if request_headers is not null and request_headers <> '' then
    v_request_ip := coalesce(
      nullif(trim(request_headers::jsonb ->> 'cf-connecting-ip'), ''),
      nullif(trim(split_part(request_headers::jsonb ->> 'x-forwarded-for', ',', 1)), ''),
      'unknown'
    );
  end if;

  v_request_hash := left(encode(digest(v_request_ip, 'sha256'), 'hex'), 64);

  perform pg_advisory_xact_lock(hashtext('check_coupon:' || v_request_hash));

  delete from public.coupon_check_rate_limits
  where attempted_at < timezone('utc', now()) - interval '1 hour';

  select count(*) into attempts
  from public.coupon_check_rate_limits limits
  where limits.request_key = v_request_hash
    and limits.attempted_at > timezone('utc', now()) - interval '1 hour';

  if attempts >= 30 then
    raise exception using message = 'Too many coupon checks. Try again later.', errcode = 'PT429';
  end if;

  insert into public.coupon_check_rate_limits (request_key)
  values (v_request_hash);

  v_code := btrim(p_code, E' \t\r\n');
  if v_code is null or v_code !~ '^[A-Za-z0-9-]{3,24}$' then
    return json_build_object('valid', false);
  end if;

  select c.id, c.description into v_coupon_id, v_description
  from public.coupons c
  where upper(c.code) = upper(v_code)
    and c.active
    and (c.expires_at is null or c.expires_at > now());

  if v_description is null then
    return json_build_object('valid', false);
  end if;

  return json_build_object(
    'valid', true,
    'description', v_description,
    'prices', coalesce((
      select json_agg(
        json_build_object('product_id', cp.product_id, 'size', cp.size, 'price', cp.price)
        order by cp.product_id, cp.size
      )
      from public.coupon_prices cp
      where cp.coupon_id = v_coupon_id
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.check_coupon(text) from public;
grant execute on function public.check_coupon(text) to anon, authenticated;
