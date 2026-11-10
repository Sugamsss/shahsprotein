-- Slice A quote snapshots. Values are calculated and retained in the database;
-- clients never supply payable totals.
create table public.website_quotes (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$'),
  auth_user_id uuid references auth.users(id) on delete set null,
  verified_phone text check (verified_phone is null or verified_phone ~ '^[1-9][0-9]{10,14}$'),
  coupon_code text check (coupon_code is null or coupon_code ~ '^[A-Z0-9-]{3,24}$'),
  cart jsonb not null check (jsonb_typeof(cart)='array'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  price_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  valid_at_send_until timestamptz not null,
  submitted_at timestamptz,
  submission_fingerprint text,
  request_id uuid unique references public.website_requests(id) on delete set null,
  confirmed_order_id uuid unique references public.orders(id) on delete set null,
  constraint website_quote_lifetime check (expires_at > created_at and expires_at <= created_at+interval '15 minutes'),
  constraint website_quote_send_grace check (valid_at_send_until=expires_at+interval '2 minutes')
);
create index website_quotes_expiry_idx on public.website_quotes(expires_at);
create table public.order_quote_snapshots (
  order_id uuid primary key references public.orders(id) on delete cascade,
  quote_id uuid not null unique references public.website_quotes(id) on delete restrict,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.order_quote_snapshots enable row level security;
revoke all on public.order_quote_snapshots from public, anon, authenticated;
alter table public.website_quotes enable row level security;
revoke all on public.website_quotes from public, anon, authenticated;

create table private.slice_a_quote_rate_limits (
  request_key text not null,
  attempted_at timestamptz not null default timezone('utc',now())
);
revoke all on private.slice_a_quote_rate_limits from public, anon, authenticated;

create or replace function private.slice_a_quote_ip_key()
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare h text:=current_setting('request.headers',true); ip text:='unknown';
begin
  if h is not null and h<>'' then ip:=coalesce(nullif(trim(h::jsonb->>'cf-connecting-ip'),''),
    nullif(trim(split_part(h::jsonb->>'x-forwarded-for',',',1)),''),'unknown'); end if;
  return left(encode(digest(ip,'sha256'),'hex'),64);
end $$;
revoke all on function private.slice_a_quote_ip_key() from public,anon,authenticated;

create or replace function private.slice_a_quote_rate_limit()
returns void language plpgsql volatile security definer set search_path = public, private as $$
declare k text:=private.slice_a_quote_ip_key(); n integer;
begin
  perform pg_advisory_xact_lock(hashtext('slice_a_quote:'||k));
  delete from private.slice_a_quote_rate_limits where attempted_at < now()-interval '1 hour';
  select count(*) into n from private.slice_a_quote_rate_limits where request_key=k and attempted_at>now()-interval '1 hour';
  if n>=30 then raise exception using message='Too many offer checks. Try again later.',errcode='PT429'; end if;
  insert into private.slice_a_quote_rate_limits(request_key) values(k);
end $$;
revoke all on function private.slice_a_quote_rate_limit() from public,anon,authenticated;

-- The delivery rule belongs to the verified purchase tier, not to a coupon.
create or replace function private.slice_a_delivery_rule(p_tier text)
returns jsonb language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object(
    'min_grams',case p_tier when 'second' then null when 'first' then first_min_grams
      when 'third_plus' then third_min_grams else guest_min_grams end,
    'min_packs',case when p_tier='second' then second_min_packs end,
    'up_to_250',delivery_up_to_250,'above_250',delivery_above_250,'cap',delivery_cap)
  from private.slice_a_offer_policy where singleton;
$$;
revoke all on function private.slice_a_delivery_rule(text) from public,anon,authenticated;

-- Price a saved snapshot at another tier: tier rates with MRP fallback, the
-- new tier's delivery rule, and the promised kind recorded as repriced_from.
create or replace function private.slice_a_reprice_snapshot(p_snapshot jsonb,p_tier text)
returns jsonb language plpgsql stable security definer set search_path = public, private as $$
declare
  pol private.slice_a_offer_policy; item jsonb;
  v_lines jsonb:='[]'::jsonb; v_catalogue jsonb:='[]'::jsonb;
  v_mrp integer; v_price integer; v_qty integer; v_grams integer; v_packs integer;
  v_items integer:=0; v_mrp_total integer:=0; v_grams_total integer:=0; v_packs_total integer:=0;
  v_base integer; v_waived boolean; v_fee integer;
begin
  if p_tier not in ('guest','first','second','third_plus') then
    raise exception using message='Unknown offer tier.',errcode='22023';
  end if;
  select * into pol from private.slice_a_offer_policy where singleton;
  for item in select value from jsonb_array_elements(p_snapshot->'lines') loop
    v_qty:=(item->>'quantity')::integer;
    v_grams:=(item->>'grams')::integer;
    v_mrp:=(item->>'mrp')::integer;
    v_price:=coalesce((select op.price from private.slice_a_offer_prices op
      where op.offer_kind=p_tier and op.product_id=item->>'product_id' and op.size=item->>'size'),v_mrp);
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'product_id',item->>'product_id','size',item->>'size','quantity',v_qty,
      'grams',v_grams,'mrp',v_mrp,'unit_price',v_price,'line_total',v_price*v_qty));
    v_items:=v_items+v_price*v_qty;
    v_mrp_total:=v_mrp_total+v_mrp*v_qty;
    v_grams_total:=v_grams_total+v_grams*v_qty;
    v_packs_total:=v_packs_total+v_qty;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id',pp.product_id,'size',pp.size,'mrp',pp.price,
      'unit_price',coalesce(op.price,pp.price))
      order by pp.product_id,pp.size),'[]'::jsonb)
    into v_catalogue
  from public.product_prices pp
  left join private.slice_a_offer_prices op
    on op.offer_kind=p_tier and op.product_id=pp.product_id and op.size=pp.size;
  v_base:=case when v_grams_total<=250 then pol.delivery_up_to_250
    else least(pol.delivery_above_250,pol.delivery_cap) end;
  v_waived:=case p_tier
    when 'second' then v_packs_total>=pol.second_min_packs
    when 'first' then v_grams_total>=pol.first_min_grams
    when 'third_plus' then v_grams_total>=pol.third_min_grams
    else v_grams_total>=pol.guest_min_grams end;
  v_fee:=case when v_waived then 0 else v_base end;
  return p_snapshot||jsonb_build_object(
    'offer_kind',p_tier,
    'repriced_from',p_snapshot->>'offer_kind',
    'free_delivery_rule',private.slice_a_delivery_rule(p_tier),
    'lines',v_lines,'catalogue',v_catalogue,
    'mrp_total',v_mrp_total,'items_total',v_items,'savings',v_mrp_total-v_items,
    'grams',v_grams_total,'packs',v_packs_total,
    'delivery_base',v_base,'delivery_waived',v_waived,'delivery_fee',v_fee,
    'total',v_items+v_fee);
end $$;
revoke all on function private.slice_a_reprice_snapshot(jsonb,text) from public,anon,authenticated;

create or replace function public.quote_website_order(p_code text,p_lines jsonb,p_coupon text default null)
returns json language plpgsql security definer set search_path = public, private as $$
declare
  lines_clean jsonb; v_user uuid:=auth.uid(); v_phone text; v_tier text; v_rule jsonb;
  item jsonb; pack record; row_json jsonb; priced jsonb:='[]'::jsonb; total_mrp integer:=0;
  total_auto integer:=0; total_coupon integer:=0;
  grams_total integer:=0; packs_total integer:=0; base_fee integer;
  waive boolean; fee integer; version text; qid uuid; expires timestamptz:=clock_timestamp()+interval '15 minutes';
  coupon text; v_coupon_id uuid; coupon_valid boolean:=false; line_price integer;
  auto_available boolean:=true; chosen text; chosen_total integer; min_value integer; item_count integer; rates jsonb:='[]'::jsonb; catalogue jsonb:='[]'::jsonb; price_row jsonb;
begin
  perform private.slice_a_quote_rate_limit();
  if not exists(select 1 from private.slice_a_offer_policy where singleton and configured) then
    raise exception using message='Offers are not configured.',errcode='22023';
  end if;
  if p_code is null or upper(btrim(p_code)) !~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$' then
    raise exception using message='That order code doesn''t look right.',errcode='22023'; end if;
  lines_clean:=public.order_clean_lines(p_lines,10,true);
  if exists(select 1 from jsonb_array_elements(lines_clean) x
      where coalesce(public.order_size_grams(x->>'size') in (250,500),false)=false
      or not exists(select 1 from public.kitchen_products k where k.product_id=x->>'product_id')) then
    raise exception using message='One or more items are not available for this offer.',errcode='22023'; end if;
  if v_user is not null then
    select nullif(regexp_replace(u.phone,'[^0-9]','','g'),'') into v_phone from auth.users u where u.id=v_user and u.phone_confirmed_at is not null;
  end if;
  v_tier:=case when v_phone is null then 'guest' else private.slice_a_purchase_tier(v_phone) end;
  coupon:=nullif(upper(btrim(p_coupon,E' \t\r\n')),'');
  if coupon is not null and private.slice_a_is_restricted_code(coupon) then coupon:=null; end if;
  if coupon is not null and coupon ~ '^[A-Z0-9-]{3,24}$' then
    select c.id,(c.active and (c.expires_at is null or c.expires_at>now())) into v_coupon_id,coupon_valid
      from public.coupons c where upper(c.code)=coupon;
    coupon_valid:=coalesce(coupon_valid,false);
  else coupon:=null; end if;
  for item in select value from jsonb_array_elements(lines_clean) loop
    select public.order_size_grams(item->>'size') as grams, pp.price as mrp,
      (select op.price from private.slice_a_offer_prices op where op.offer_kind=v_tier
       and op.product_id=item->>'product_id' and op.size=item->>'size') as auto_price,
      (select cp.price from public.coupon_prices cp where cp.coupon_id=v_coupon_id
       and cp.product_id=item->>'product_id' and cp.size=item->>'size') as coupon_price
      into pack from public.product_prices pp where pp.product_id=item->>'product_id' and pp.size=item->>'size';
    if pack.mrp is null then raise exception using message='A price is not available for one of these items.',errcode='22023'; end if;
    if pack.auto_price is null then auto_available:=false; end if;
    item_count:=(item->>'quantity')::integer;
    total_mrp:=total_mrp+pack.mrp*item_count;
    total_auto:=total_auto+coalesce(pack.auto_price,pack.mrp)*item_count;
    total_coupon:=total_coupon+coalesce(pack.coupon_price,pack.mrp)*item_count;
    grams_total:=grams_total+pack.grams*item_count;
    packs_total:=packs_total+item_count;
    row_json:=jsonb_build_object('product_id',item->>'product_id','size',item->>'size','quantity',item_count,
      'grams',pack.grams,'mrp',pack.mrp,'auto_price',pack.auto_price,'coupon_price',coalesce(pack.coupon_price,pack.mrp));
    priced:=priced||jsonb_build_array(row_json);
  end loop;
  if v_tier in ('guest','first','third_plus') then
    min_value:=case v_tier when 'guest' then (select guest_min_grams from private.slice_a_offer_policy where singleton)
      when 'first' then (select first_min_grams from private.slice_a_offer_policy where singleton)
      else (select third_min_grams from private.slice_a_offer_policy where singleton) end;
    waive:=grams_total>=min_value;
  else
    min_value:=(select second_min_packs from private.slice_a_offer_policy where singleton);
    waive:=packs_total>=min_value;
  end if;
  select case when grams_total<=250 then delivery_up_to_250 else least(delivery_above_250,delivery_cap) end
    into base_fee from private.slice_a_offer_policy where singleton;
  fee:=case when waive then 0 else base_fee end;
  v_rule:=private.slice_a_delivery_rule(v_tier);
  -- Compare full-cart payable candidates; never take per-line winners.
  chosen:='mrp'; chosen_total:=total_mrp;
  if coupon_valid and total_coupon+fee<chosen_total+fee then chosen:='coupon'; chosen_total:=total_coupon; end if;
  if auto_available and total_auto+fee<=chosen_total+fee then chosen:='automatic'; chosen_total:=total_auto; end if;
  for price_row in select value from jsonb_array_elements(priced) loop
    line_price:=case chosen when 'automatic' then coalesce((price_row->>'auto_price')::integer,(price_row->>'mrp')::integer)
      when 'coupon' then (price_row->>'coupon_price')::integer else (price_row->>'mrp')::integer end;
    rates:=rates||jsonb_build_array((price_row-'auto_price'-'coupon_price')||jsonb_build_object(
      'unit_price',line_price,'line_total',line_price*(price_row->>'quantity')::integer));
  end loop;
  -- The same candidate prices the whole five-pack catalogue the cards show.
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id',pp.product_id,'size',pp.size,'mrp',pp.price,
      'unit_price',case chosen when 'automatic' then coalesce(op.price,pp.price)
        when 'coupon' then coalesce(cp.price,pp.price) else pp.price end)
      order by pp.product_id,pp.size),'[]'::jsonb)
    into catalogue
  from public.product_prices pp
  left join private.slice_a_offer_prices op
    on op.offer_kind=v_tier and op.product_id=pp.product_id and op.size=pp.size
  left join public.coupon_prices cp
    on cp.coupon_id=v_coupon_id and cp.product_id=pp.product_id and cp.size=pp.size;
  select md5(coalesce(string_agg(offer_kind||':'||product_id||':'||size||':'||price::text,',' order by offer_kind,product_id,size),''))
    into version from private.slice_a_offer_prices;
  insert into public.website_quotes(code,auth_user_id,verified_phone,coupon_code,cart,snapshot,price_version,expires_at,valid_at_send_until)
  values(upper(btrim(p_code)),v_user,v_phone,case when chosen='coupon' and coupon_valid then coupon end,lines_clean,
    jsonb_build_object('quote_id',gen_random_uuid(),'expires_at',expires,'version',version,
      'offer_kind',case when chosen='automatic' then v_tier when chosen='coupon' then 'coupon' else 'mrp' end,
      'coupon_code',case when chosen='coupon' and coupon_valid then coupon end,
      'free_delivery_rule',v_rule,'lines',rates,'catalogue',catalogue,
      'mrp_total',total_mrp,'items_total',chosen_total,
      'savings',total_mrp-chosen_total,'grams',grams_total,'packs',packs_total,'delivery_base',base_fee,
      'delivery_waived',waive,'delivery_fee',fee,'total',chosen_total+fee,'currency','INR'),version,expires,expires+interval '2 minutes') returning id into qid;
  update public.website_quotes set snapshot=jsonb_set(snapshot,'{quote_id}',to_jsonb(qid::text)) where id=qid;
  return (select snapshot from public.website_quotes where id=qid);
end $$;
revoke all on function public.quote_website_order(text,jsonb,text) from public;
grant execute on function public.quote_website_order(text,jsonb,text) to anon,authenticated;

-- Admin source quote uses the owner's explicitly mapped offer. An unconfigured
-- channel is intentionally not assigned a new Slice A discount.
create or replace function public.quote_admin_order(p_source text,p_phone text,p_lines jsonb,p_coupon text default null)
returns json language plpgsql security definer set search_path=public,private as $$
declare
  v_tier text; v_configured boolean; v_lines jsonb; v_item jsonb;
  v_coupon text; v_coupon_id uuid; v_coupon_live boolean:=false;
  v_phone text; v_delivery_tier text; v_pol private.slice_a_offer_policy;
  v_rows jsonb:='[]'::jsonb; v_out jsonb:='[]'::jsonb;
  v_mapped_total integer:=0; v_coupon_total integer:=0; v_mrp_total integer:=0;
  v_grams integer:=0; v_packs integer:=0; v_items integer;
  v_base integer; v_waived boolean; v_fee integer; v_chosen text; v_rule jsonb;
  v_price integer; v_cprice integer; v_mrp integer; v_qty integer; v_grams_each integer;
begin
  if not public.is_admin() then raise exception using message='Unauthorized'; end if;
  if p_source not in ('site','whatsapp','call','instagram','in_person') then
    raise exception using message='Choose where the order came from.',errcode='22023'; end if;
  select offer_kind,configured into v_tier,v_configured from private.slice_a_source_policy where source=p_source;
  select * into v_pol from private.slice_a_offer_policy where singleton;

  v_coupon:=nullif(upper(btrim(p_coupon,E' \t\r\n')),'');
  if v_coupon is not null and v_coupon ~ '^[A-Z0-9-]{3,24}$' then
    select c.id,(c.active and (c.expires_at is null or c.expires_at>now()))
      into v_coupon_id,v_coupon_live
      from public.coupons c where upper(c.code)=v_coupon;
    v_coupon_live:=coalesce(v_coupon_live,false);
  end if;
  if not v_coupon_live then v_coupon_id:=null; end if;

  v_phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if v_phone ~ '^[0-9]{10}$' then v_phone:='91'||v_phone; end if;
  v_delivery_tier:=case
    when p_source='site' then 'guest'
    when v_configured and v_tier in ('guest','first','second','third_plus') then v_tier
    else private.slice_a_purchase_tier(nullif(v_phone,'')) end;

  v_lines:=public.order_clean_lines(p_lines,9999,true);
  for v_item in select value from jsonb_array_elements(v_lines) loop
    v_qty:=(v_item->>'quantity')::integer;
    if v_item->>'size'='sample' then
      v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
        'product_id',v_item->>'product_id','size','sample','quantity',v_qty,
        'grams',null,'mrp',null,'mapped_price',null,'coupon_price',null));
      continue;
    end if;
    v_grams_each:=public.order_size_grams(v_item->>'size');
    select price into v_mrp from public.product_prices
      where product_id=v_item->>'product_id' and size=v_item->>'size';
    if v_mrp is null then
      raise exception using message='A price is not available for one of these items.',errcode='22023';
    end if;
    select price into v_price from private.slice_a_offer_prices
      where offer_kind=case when p_source='site' then 'guest' when v_configured then v_tier else 'repeat' end
        and product_id=v_item->>'product_id' and size=v_item->>'size';
    v_price:=coalesce(v_price,v_mrp);
    v_cprice:=coalesce((select cp.price from public.coupon_prices cp
      where cp.coupon_id=v_coupon_id and cp.product_id=v_item->>'product_id' and cp.size=v_item->>'size'),v_mrp);
    v_mapped_total:=v_mapped_total+v_price*v_qty;
    v_coupon_total:=v_coupon_total+v_cprice*v_qty;
    v_mrp_total:=v_mrp_total+v_mrp*v_qty;
    v_grams:=v_grams+v_grams_each*v_qty;
    v_packs:=v_packs+v_qty;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
      'product_id',v_item->>'product_id','size',v_item->>'size','quantity',v_qty,
      'grams',v_grams_each,'mrp',v_mrp,'mapped_price',v_price,'coupon_price',v_cprice));
  end loop;

  v_chosen:=case when v_coupon_live and v_coupon_total<v_mapped_total then 'coupon' else 'mapped' end;
  v_items:=case when v_chosen='coupon' then v_coupon_total else v_mapped_total end;

  for v_item in select value from jsonb_array_elements(v_rows) loop
    if (v_item->>'size')='sample' then
      v_out:=v_out||jsonb_build_array(jsonb_build_object(
        'product_id',v_item->>'product_id','size','sample','quantity',(v_item->>'quantity')::integer,
        'grams',null,'mrp',null,'unit_price',0,'line_total',0));
    else
      v_price:=case when v_chosen='coupon' then (v_item->>'coupon_price')::integer else (v_item->>'mapped_price')::integer end;
      v_out:=v_out||jsonb_build_array(jsonb_build_object(
        'product_id',v_item->>'product_id','size',v_item->>'size','quantity',(v_item->>'quantity')::integer,
        'grams',(v_item->>'grams')::integer,'mrp',(v_item->>'mrp')::integer,
        'unit_price',v_price,'line_total',v_price*(v_item->>'quantity')::integer));
    end if;
  end loop;

  v_base:=case when v_grams<=250 then v_pol.delivery_up_to_250
    else least(v_pol.delivery_above_250,v_pol.delivery_cap) end;
  v_waived:=case v_delivery_tier
    when 'second' then v_packs>=v_pol.second_min_packs
    when 'first' then v_grams>=v_pol.first_min_grams
    when 'third_plus' then v_grams>=v_pol.third_min_grams
    else v_grams>=v_pol.guest_min_grams end;
  if v_packs=0 then v_base:=0; v_waived:=true; end if;
  v_fee:=case when v_waived then 0 else v_base end;
  v_rule:=private.slice_a_delivery_rule(v_delivery_tier);

  return json_build_object(
    'offer_kind',case when v_chosen='coupon' then 'coupon' when p_source='site' then 'guest'
      when v_configured then v_tier else 'repeat' end,
    'configured',coalesce(v_configured,false),
    'coupon_code',case when v_chosen='coupon' then v_coupon end,
    'lines',v_out,
    'items_total',v_items,
    'mrp_total',v_mrp_total,
    'savings',v_mrp_total-v_items,
    'grams',v_grams,
    'packs',v_packs,
    'delivery_base',v_base,
    'delivery_waived',v_waived,
    'delivery_fee',v_fee,
    'free_delivery_rule',v_rule,
    'total',v_items+v_fee,
    'currency','INR');
end $$;
revoke all on function public.quote_admin_order(text,text,jsonb,text) from public,anon;
grant execute on function public.quote_admin_order(text,text,jsonb,text) to authenticated;

-- Quote IDs are the only priced public save input. Retries repeat-safely while
-- the fingerprint matches, and a taken code gets the legacy -N suffix.
create or replace function public.submit_website_request_v2(
  p_quote_id uuid,p_code text,p_name text,p_phone text,p_address jsonb
) returns json language plpgsql security definer set search_path=public,private as $$
declare q public.website_quotes; nm text; ph text; addr jsonb; fp text; req public.website_requests;
  used integer; top_suffix integer; new_code text;
begin
  select * into q from public.website_quotes where id=p_quote_id for update;
  if not found then raise exception using message='Offer expired. Check your offer again.',errcode='22023'; end if;
  if q.auth_user_id is distinct from auth.uid() then raise exception using message='Offer expired. Check your offer again.',errcode='22023'; end if;
  if q.code<>upper(btrim(p_code)) then raise exception using message='Offer expired. Check your offer again.',errcode='22023'; end if;
  nm:=public.order_clean_name(p_name);
  if nm is null or char_length(nm) not between 2 and 60 then raise exception using message='A name is 2 to 60 characters.',errcode='22023'; end if;
  ph:=regexp_replace(coalesce(p_phone,''),'[ +()-]','','g');
  if ph ~ '^[0-9]{10}$' then ph:='91'||ph; end if;
  if ph !~ '^[1-9][0-9]{10,14}$' then raise exception using message='Enter a valid phone number.',errcode='22023'; end if;
  addr:=public.website_clean_address(p_address,true);
  fp:=md5(q.snapshot::text||'|'||lower(nm)||'|'||ph||'|'||addr::text);
  if q.request_id is not null then
    select * into req from public.website_requests where id=q.request_id;
    if req.id is null or q.submission_fingerprint is distinct from fp then
      raise exception using message='Offer expired. Check your offer again.',errcode='22023';
    end if;
    return json_build_object('id',req.id,'code',req.code,'state',req.state,'quote',q.snapshot);
  end if;
  if clock_timestamp()>q.valid_at_send_until then
    raise exception using message='Offer expired. Check your offer again.',errcode='22023'; end if;
  if q.auth_user_id is not null and q.verified_phone is distinct from (
      select nullif(regexp_replace(u.phone,'[^0-9]','','g'),'') from auth.users u where u.id=q.auth_user_id and u.phone_confirmed_at is not null) then
    raise exception using message='Offer expired. Check your offer again.',errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext('order_code:'||q.code));
  perform pg_advisory_xact_lock(hashtext('website_request_global_quota'));
  if (select count(*) from public.website_requests where created_at>now()-interval '1 hour')>=300 then
    raise exception using message='Too many orders. Try again later.',errcode='PT429'; end if;
  if private.slice_a_quote_ip_key()<>'unknown' then
    perform pg_advisory_xact_lock(hashtext('submit_order:'||private.slice_a_quote_ip_key()));
    if (select count(*) from public.order_rate_limits where request_key=private.slice_a_quote_ip_key() and attempted_at>now()-interval '1 hour')>=10 then
      raise exception using message='Too many orders. Try again later.',errcode='PT429'; end if;
    insert into public.order_rate_limits(request_key) values(private.slice_a_quote_ip_key());
  end if;
  select count(*),max(coalesce(nullif(substring(c from '^SN-[A-Z0-9]{5}-([0-9]+)$'),'')::integer,1)) into used,top_suffix from (
    select o.code c from public.orders o where o.code=q.code or o.code like q.code||'-%'
    union all
    select r.code from public.website_requests r where r.code=q.code or r.code like q.code||'-%'
  ) x;
  new_code:=case when used=0 then q.code else q.code||'-'||(top_suffix+1) end;
  insert into public.website_requests(code,message_code,fingerprint,name,phone,pincode,delivery_address,lines,coupon_code)
  values(new_code,q.code,fp,nm,ph,addr->>'pincode',addr,q.cart,q.coupon_code) returning * into req;
  update public.website_quotes set submitted_at=clock_timestamp(),submission_fingerprint=fp,request_id=req.id where id=q.id;
  return json_build_object('id',req.id,'code',req.code,'state',req.state,'quote',q.snapshot);
end $$;
revoke all on function public.submit_website_request_v2(uuid,text,text,text,jsonb) from public;
grant execute on function public.submit_website_request_v2(uuid,text,text,text,jsonb) to anon,authenticated;

-- Owner confirmation copies the accepted quote exactly. A promised tier that
-- another confirmation has overtaken needs an explicit honour/adjust decision.
create or replace function public.confirm_admin_website_request(p_id uuid,p_details jsonb default '{}')
returns json language plpgsql security definer set search_path=public,private,extensions as $$
declare r public.website_requests; q public.website_quotes; nm text; ph text; addr jsonb;
  coupon_id uuid; coupon_valid boolean; oid uuid; ord public.orders;
  v_promised text; v_current text; v_decision text;
begin
  if not public.is_admin() then raise exception using message='Unauthorized'; end if;
  select * into r from public.website_requests where id=p_id;
  if not found then raise exception using message='Request not found.',errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtext('order_code:'||r.message_code));
  select * into r from public.website_requests where id=p_id for update;
  if r.state='confirmed' then select * into ord from public.orders where id=r.confirmed_order_id; return json_build_object('state','confirmed','order',public.admin_order_json(ord)); end if;
  if r.state='dismissed' then return json_build_object('state','dismissed','order',null); end if;
  nm:=public.order_clean_name(coalesce(p_details->>'name',r.name));
  if nm is null or char_length(nm) not between 2 and 60 then raise exception using message='A name is 2 to 60 characters.',errcode='22023'; end if;
  ph:=coalesce(p_details->>'phone',r.phone);
  if ph is not null then ph:=regexp_replace(ph,'[ +()-]','','g'); if ph ~ '^[0-9]{10}$' then ph:='91'||ph; end if; end if;
  if ph is null or ph !~ '^[1-9][0-9]{10,14}$' then raise exception using message='Enter a valid phone number.',errcode='22023'; end if;
  addr:=public.website_clean_address(coalesce(p_details->'delivery_address',r.delivery_address),true);
  if p_details ? 'pincode' and p_details->>'pincode' is distinct from addr->>'pincode' then raise exception using message='Pincode must match delivery address.',errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(r.lines) x where not exists(select 1 from public.kitchen_products kp where kp.product_id=x->>'product_id') or public.order_size_grams(x->>'size') not between 1 and 1000) then raise exception using message='One or more items are no longer available.',errcode='22023'; end if;
  if r.coupon_code is not null then select c.id,(c.active and (c.expires_at is null or c.expires_at>now())) into coupon_id,coupon_valid from public.coupons c where upper(c.code)=r.coupon_code; coupon_valid:=coalesce(coupon_valid,false); end if;
  select * into q from public.website_quotes where request_id=r.id;
  -- Eligibility belongs to the verified Auth phone the quote was priced for;
  -- the typed delivery contact is a different person quite often. Lock and
  -- recheck that same phone, never ph.
  if q.id is not null and q.verified_phone is not null then
    perform pg_advisory_xact_lock(hashtext('slice_a_phone:'||q.verified_phone));
    v_current:=private.slice_a_purchase_tier(q.verified_phone);
    v_promised:=q.snapshot->>'offer_kind';
    if v_promised in ('first','second','third_plus') and v_promised<>v_current then
      v_decision:=p_details->>'tier_decision';
      if v_decision='honour' then
        null;
      elsif v_decision='adjust' then
        q.snapshot:=private.slice_a_reprice_snapshot(q.snapshot,v_current);
        update public.website_quotes set snapshot=q.snapshot where id=q.id;
      else
        return json_build_object('state','conflict','promised',v_promised,'current',v_current,'quote',q.snapshot);
      end if;
    end if;
  end if;
  insert into public.orders(code,fingerprint,source,status,name,phone,pincode,delivery_address,coupon_code,coupon_id,coupon_valid,amount)
    values(r.code,r.fingerprint,'site','cooking',nm,ph,addr->>'pincode',addr,r.coupon_code,coupon_id,coupon_valid,
      case when q.id is null then null else (q.snapshot->>'total')::integer end) returning * into ord;
  insert into public.order_lines(order_id,product_id,size,quantity) select ord.id,x->>'product_id',x->>'size',(x->>'quantity')::integer from jsonb_array_elements(r.lines) x;
  if q.id is not null then
    insert into public.order_quote_snapshots(order_id,quote_id,snapshot)
    values(ord.id,q.id,q.snapshot);
  end if;
  perform public.kitchen_lock(); perform public.kitchen_fill_all(public.kitchen_order_products(ord.id));
  select * into ord from public.orders where id=ord.id;
  update public.website_requests set state='confirmed',confirmed_order_id=ord.id,confirmed_at=timezone('utc',now()),confirmed_by=auth.uid() where id=p_id;
  if q.id is not null then update public.website_quotes set confirmed_order_id=ord.id where id=q.id; end if;
  return json_build_object('state','confirmed','order',public.admin_order_json(ord));
end $$;
revoke all on function public.confirm_admin_website_request(uuid,jsonb) from public,anon;
grant execute on function public.confirm_admin_website_request(uuid,jsonb) to authenticated;

-- The admin reads carry the saved snapshot beside the request or order.
create or replace function public.get_admin_website_requests(p_state text default 'pending',p_search text default null,p_before timestamptz default null,p_limit integer default 30,p_before_id uuid default null)
returns json language plpgsql security definer set search_path=public as $$
declare result json;
begin
  if not public.is_admin() then raise exception using message='Unauthorized'; end if;
  if p_state not in ('pending','confirmed','dismissed','all') then raise exception using message='Invalid request state.',errcode='22023'; end if;
  select json_build_object('requests',coalesce(json_agg(x.obj order by x.created_at desc,x.id desc) filter (where x.rn<=least(greatest(coalesce(p_limit,30),1),100)),'[]'::json),'next_before',case when count(*)>least(greatest(coalesce(p_limit,30),1),100) then (array_agg(x.created_at order by x.rn desc))[2] end,'next_before_id',case when count(*)>least(greatest(coalesce(p_limit,30),1),100) then (array_agg(x.id order by x.rn desc))[2] end) into result
  from (select r.id,r.created_at,row_number() over(order by r.created_at desc,r.id desc) rn,json_build_object('id',r.id,'code',r.code,'message_code',r.message_code,'name',r.name,'phone',r.phone,'pincode',r.pincode,'delivery_address',r.delivery_address,'lines',r.lines,'coupon_code',r.coupon_code,'quote',(select q.snapshot from public.website_quotes q where q.request_id=r.id),'created_at',r.created_at,'state',r.state,'is_legacy',r.is_legacy) obj
    from public.website_requests r where (p_state='all' or r.state=p_state) and (p_before is null or r.created_at<p_before or (r.created_at=p_before and (p_before_id is null or r.id<p_before_id)))
      and (nullif(btrim(p_search),'') is null or r.code ilike '%'||p_search||'%' or r.name ilike '%'||p_search||'%' or coalesce(r.phone,'') ilike '%'||p_search||'%')
    order by r.created_at desc,r.id desc limit least(greatest(coalesce(p_limit,30),1),100)+1) x;
  return result;
end $$;
create or replace function public.get_admin_website_request(p_id uuid)
returns json language plpgsql security definer set search_path=public as $$
declare r public.website_requests;
begin
  if not public.is_admin() then raise exception using message='Unauthorized'; end if;
  select * into r from public.website_requests where id=p_id;
  if not found then return null; end if;
  return jsonb_build_object('id',r.id,'code',r.code,'message_code',r.message_code,'name',r.name,'phone',r.phone,'pincode',r.pincode,'delivery_address',r.delivery_address,'lines',r.lines,'coupon_code',r.coupon_code,'quote',(select q.snapshot from public.website_quotes q where q.request_id=r.id),'created_at',r.created_at,'state',r.state,'is_legacy',r.is_legacy,'confirmed_order_id',r.confirmed_order_id,'confirmed_at',r.confirmed_at,'dismissed_at',r.dismissed_at)::json;
end $$;
revoke all on function public.get_admin_website_requests(text,text,timestamptz,integer,uuid),public.get_admin_website_request(uuid) from public,anon;
grant execute on function public.get_admin_website_requests(text,text,timestamptz,integer,uuid),public.get_admin_website_request(uuid) to authenticated;

-- Find an issued quote by its code (quotes first, then the message code a
-- request kept), so a failed save never loses a priced order.
create or replace function public.get_admin_website_quote(p_code text)
returns json language plpgsql stable security definer set search_path=public as $$
declare v_code text:=upper(btrim(coalesce(p_code,''))); v_quote public.website_quotes;
  v_req public.website_requests; v_order public.orders; v_order_id uuid;
begin
  if not public.is_admin() then raise exception using message='Unauthorized'; end if;
  if v_code='' then raise exception using message='Enter a code.',errcode='22023'; end if;
  select * into v_quote from public.website_quotes q where q.code=v_code order by q.created_at desc limit 1;
  if v_quote.id is not null then
    select * into v_req from public.website_requests r where r.id=v_quote.request_id;
  else
    select * into v_req from public.website_requests r where r.message_code=v_code order by r.created_at desc limit 1;
    if v_req.id is not null then select * into v_quote from public.website_quotes q where q.request_id=v_req.id; end if;
  end if;
  v_order_id:=coalesce(v_quote.confirmed_order_id,v_req.confirmed_order_id);
  if v_order_id is not null then select * into v_order from public.orders o where o.id=v_order_id; end if;
  return json_build_object(
    'code',v_code,
    'quote',v_quote.snapshot,
    'request',case when v_req.id is null then null else json_build_object(
      'id',v_req.id,'code',v_req.code,'state',v_req.state,'name',v_req.name,'phone',v_req.phone,'created_at',v_req.created_at) end,
    'order',case when v_order.id is null then null else json_build_object(
      'id',v_order.id,'code',v_order.code,'status',v_order.status) end);
end $$;
revoke all on function public.get_admin_website_quote(text) from public,anon;
grant execute on function public.get_admin_website_quote(text) to authenticated;

-- 20261022000001's function, plus the saved quote snapshot for the order.
create or replace function public.admin_order_json(p_order public.orders)
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'id', p_order.id,
    'code', p_order.code,
    'message_code', substring(p_order.code from '^SN-[A-Z0-9]{5}'),
    'source', p_order.source,
    'status', p_order.status,
    'free_sample', p_order.free_sample,
    'priority', p_order.priority,
    'held', p_order.kitchen_hold,
    'paid', p_order.paid_at is not null,
    'paid_at', p_order.paid_at,
    'paid_method', p_order.paid_method,
    'paid_note', p_order.paid_note,
    'payment_state', case
      when p_order.paid_at is not null then 'paid'
      when pay.count > 0 then 'part_paid'
      else 'not_paid'
    end,
    'payments', pay.list,
    'amount_paid', pay.total,
    'amount_due', case when p_order.amount is not null then greatest(p_order.amount - pay.total, 0) end,
    'amount_extra', case when p_order.amount is not null then greatest(pay.total - p_order.amount, 0) end,
    'name', p_order.name,
    'pincode', p_order.pincode,
    'delivery_address', p_order.delivery_address,
    'phone', p_order.phone,
    'note', p_order.note,
    'amount', p_order.amount,
    'quote', (select s.snapshot from public.order_quote_snapshots s where s.order_id = p_order.id),
    'coupon', case
      when p_order.coupon_code is null then null
      else json_build_object(
        'code', p_order.coupon_code,
        'valid', coalesce(p_order.coupon_valid, false),
        'known', p_order.coupon_id is not null,
        'description', (select c.description from public.coupons c where c.id = p_order.coupon_id)
      )
    end,
    'lines', coalesce((
      select json_agg(
        json_build_object('product_id', l.product_id, 'size', l.size, 'quantity', l.quantity, 'grams_each', l.grams_each)
        order by l.product_id, l.size
      )
      from public.order_lines l
      where l.order_id = p_order.id
    ), '[]'::json),
    'packs', coalesce((
      select sum(l.quantity) from public.order_lines l where l.order_id = p_order.id and l.size <> 'sample'
    ), 0),
    'samples', coalesce((
      select sum(l.quantity) from public.order_lines l where l.order_id = p_order.id and l.size = 'sample'
    ), 0),
    'kitchen', coalesce((
      select json_agg(
        json_build_object(
          'product_id', c.product_id, 'need', c.need, 'covered', c.covered, 'by_hand', c.by_hand,
          'waiting', p_order.status = 'cooking' and c.covered < c.need,
          -- Where its food came from: each batch's number, Mfg (made_on), Exp
          -- and grams, oldest first (as in 20261104000000).
          'batches', coalesce((
            select json_agg(json_build_object('batch_id', b.id, 'code', b.code, 'made_on', b.made_on,
                'expires_on', b.expires_on, 'grams', a.grams)
              order by b.made_on, b.created_at, b.id)
            from public.kitchen_allocations a
            join public.kitchen_batches b on b.id = a.batch_id
            where a.order_id = p_order.id and a.product_id = c.product_id
          ), '[]'::json)
        )
        order by c.product_id
      )
      from public.kitchen_order_cover(p_order.id) c
    ), '[]'::json),
    'customer', case
      when p_order.phone is null then null
      else (
        select json_build_object(
          'order_number', count(*) filter (
            where (o.created_at, o.id) < (p_order.created_at, p_order.id)
          ) + 1,
          'orders', count(*)
        )
        from public.orders o
        where o.phone = p_order.phone
          and o.status <> 'cancelled'
      )
    end,
    'created_at', p_order.created_at,
    'updated_at', p_order.updated_at,
    'status_changed_at', p_order.status_changed_at
  )
  from (
    select
      count(*) as count,
      coalesce(sum(p.amount), 0) as total,
      coalesce(json_agg(
        json_build_object(
          'id', p.id,
          'amount', p.amount,
          'method', p.method,
          'note', p.note,
          'paid_at', p.paid_at,
          'created_at', p.created_at,
          'by_name', coalesce(a.display_name, a.email)
        )
        order by p.paid_at, p.created_at, p.id
      ) filter (where p.id is not null), '[]'::json) as list
    from public.order_payments p
    left join public.admin_users a on a.id = p.created_by
    where p.order_id = p_order.id
  ) pay;
$$;

revoke all on function public.admin_order_json(public.orders) from public, anon, authenticated;
