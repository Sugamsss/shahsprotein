-- Website sends are requests, not active kitchen orders. Confirmation is the
-- only transition that creates an order and invokes the existing kitchen fill.
create table public.website_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}(-([2-9]|[1-9][0-9]{1,2}))?$'),
  message_code text not null check (message_code ~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$'),
  fingerprint text not null,
  name text not null check (char_length(name) between 2 and 60),
  phone text check (phone is null or phone ~ '^[1-9][0-9]{10,14}$'),
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  delivery_address jsonb,
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  coupon_code text check (coupon_code is null or coupon_code ~ '^[A-Z0-9-]{3,24}$'),
  state text not null default 'pending' check (state in ('pending','confirmed','dismissed')),
  is_legacy boolean not null default false,
  created_at timestamptz not null default timezone('utc',now()),
  -- Deleting the order (delete_admin_order) takes its request with it.
  confirmed_order_id uuid unique references public.orders(id) on delete cascade,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,
  constraint website_request_state_fields check (
    (state = 'pending' and confirmed_order_id is null and confirmed_at is null and dismissed_at is null)
    or (state = 'confirmed' and confirmed_order_id is not null and confirmed_at is not null and dismissed_at is null)
    or (state = 'dismissed' and confirmed_order_id is null and confirmed_at is null and dismissed_at is not null)
  ),
  constraint website_request_address_object check (delivery_address is null or jsonb_typeof(delivery_address) = 'object')
);
create index website_requests_state_page_idx on public.website_requests(state,created_at desc,id desc);
create index website_requests_code_prefix_idx on public.website_requests(code text_pattern_ops);
alter table public.website_requests enable row level security;
revoke all on public.website_requests from public, anon, authenticated;

alter table public.orders add column delivery_address jsonb;
alter table public.orders add constraint orders_delivery_address_object check
  (delivery_address is null or jsonb_typeof(delivery_address) = 'object');
-- One pincode per order: the address's is the order's.
alter table public.orders add constraint orders_delivery_address_pincode check
  (delivery_address is null or delivery_address ->> 'pincode' is not distinct from pincode);

-- Reserve code bases across both tables. The same advisory namespace is used
-- by request submission and the pre-existing order-code allocation paths.
create or replace function public.order_code_taken(p_code text)
returns boolean language sql stable set search_path=public as $$
  select exists (select 1 from public.orders o where o.code=p_code or o.code like p_code||'-%')
      or exists (select 1 from public.website_requests r where r.code=p_code or r.code like p_code||'-%');
$$;
revoke all on function public.order_code_taken(text) from public,anon,authenticated;

create or replace function public.website_clean_address(p_address jsonb, p_required boolean)
returns jsonb language plpgsql immutable set search_path=public as $$
declare k text; v text; lim integer;
begin
  if p_address is null or jsonb_typeof(p_address)='null' then
    if p_required then raise exception using message='Complete the delivery address.',errcode='22023'; end if;
    return null;
  end if;
  if jsonb_typeof(p_address)<>'object' or exists(select 1 from jsonb_object_keys(p_address) x where x not in ('premises','area','city','state','pincode','landmark')) then
    raise exception using message='That delivery address does not look right.',errcode='22023';
  end if;
  for k in select unnest(array['premises','area','city','state','pincode','landmark']) loop
    if jsonb_typeof(p_address->k) not in ('string','null') then raise exception using message='That delivery address does not look right.',errcode='22023'; end if;
    if k='pincode' then lim:=6; elsif k in ('city','state') then lim:=80; else lim:=160; end if;
    v:=nullif(btrim(regexp_replace(coalesce(p_address->>k,''),'[\x01-\x1F\x7F-\x9F\u2028\u2029]',' ','g')),'');
     if k='pincode' then
       if v is null or v !~ '^[1-9][0-9]{5}$' then raise exception using message='A pincode is 6 digits.',errcode='22023'; end if;
    elsif k <> 'landmark' and p_required and (v is null or char_length(v)>lim) then
      raise exception using message='Complete the delivery address.',errcode='22023';
    elsif v is not null and char_length(v)>lim then
      raise exception using message='A delivery address field is too long.',errcode='22023';
    end if;
  end loop;
  return jsonb_build_object('premises',nullif(btrim(regexp_replace(coalesce(p_address->>'premises',''),'[\x01-\x1F\x7F-\x9F\u2028\u2029]',' ','g')),''),'area',nullif(btrim(regexp_replace(coalesce(p_address->>'area',''),'[\x01-\x1F\x7F-\x9F\u2028\u2029]',' ','g')),''),
    'city',nullif(btrim(regexp_replace(coalesce(p_address->>'city',''),'[\x01-\x1F\x7F-\x9F\u2028\u2029]',' ','g')),''),'state',nullif(btrim(regexp_replace(coalesce(p_address->>'state',''),'[\x01-\x1F\x7F-\x9F\u2028\u2029]',' ','g')),''),'pincode',btrim(p_address->>'pincode'),
    'landmark',nullif(btrim(regexp_replace(coalesce(p_address->>'landmark',''),'[\x01-\x1F\x7F-\x9F\u2028\u2029]',' ','g')),''));
end $$;
revoke all on function public.website_clean_address(jsonb,boolean) from public,anon,authenticated;

create or replace function public.submit_website_request(
  p_code text,p_lines jsonb,p_name text,p_phone text,p_address jsonb,p_coupon text default null
) returns void language plpgsql security definer set search_path=public,extensions as $$
declare
  h text:=current_setting('request.headers',true); ip text:='unknown'; iphash text;
  code_base text; lines_clean jsonb; nm text; ph text; addr jsonb; coupon text; fp text; used integer; top_suffix integer;
begin
  if h is not null and h<>'' then ip:=coalesce(nullif(trim(h::jsonb->>'cf-connecting-ip'),''),nullif(trim(split_part(h::jsonb->>'x-forwarded-for',',',1)),''),'unknown'); end if;
  if ip<>'unknown' then iphash:=left(encode(digest(ip,'sha256'),'hex'),64); end if;
  code_base:=upper(btrim(p_code,E' \t\r\n'));
  if code_base !~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$' then raise exception using message='That order code doesn''t look right.',errcode='22023'; end if;
  lines_clean:=public.order_clean_lines(p_lines,10,false);
  if exists(select 1 from jsonb_array_elements(lines_clean) x where public.order_size_grams(x->>'size') not between 1 and 1000) then raise exception using message='One of the items doesn''t look right.',errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(lines_clean) x where not exists(select 1 from public.kitchen_products kp where kp.product_id=x->>'product_id')) then raise exception using message='One of the items doesn''t look right.',errcode='22023'; end if;
  nm:=public.order_clean_name(p_name);
  if nm is null or char_length(nm) not between 2 and 60 then raise exception using message='A name is 2 to 60 characters.',errcode='22023'; end if;
  ph:=regexp_replace(coalesce(p_phone,''),'[ +()-]','','g');
  if ph ~ '^[0-9]{10}$' then ph:='91'||ph; end if;
  if ph !~ '^[1-9][0-9]{10,14}$' then raise exception using message='Enter a valid phone number.',errcode='22023'; end if;
  addr:=public.website_clean_address(p_address,true);
  coupon:=upper(btrim(p_coupon,E' \t\r\n'));
  if coupon is not null and coupon !~ '^[A-Z0-9-]{3,24}$' then coupon:=null; end if;
  fp:=md5(lower(nm)||'|'||(addr->>'pincode')||'|'||ph||'|'||addr::text||'|'||
    (select string_agg((x->>'product_id')||':'||(x->>'size')||':'||(x->>'quantity'),',' order by x->>'product_id' collate "C",x->>'size' collate "C") from jsonb_array_elements(lines_clean) x)||'|'||coalesce(coupon,''));
  perform pg_advisory_xact_lock(hashtext('order_code:'||code_base));
  perform pg_advisory_xact_lock(hashtext('website_request_global_quota'));
  if exists(select 1 from public.website_requests where (code=code_base or code like code_base||'-%') and fingerprint=fp) then return; end if;
  if iphash is not null then
    perform pg_advisory_xact_lock(hashtext('submit_order:'||iphash));
    delete from public.order_rate_limits where attempted_at < timezone('utc',now())-interval '1 hour';
    if (select count(*) from public.order_rate_limits where request_key=iphash and attempted_at>timezone('utc',now())-interval '1 hour')>=10 then raise exception using message='Too many orders. Try again later.',errcode='PT429'; end if;
    insert into public.order_rate_limits(request_key) values(iphash);
  end if;
  if (select count(*) from public.website_requests where created_at>now()-interval '1 hour')>=300 then raise exception using message='Too many orders. Try again later.',errcode='PT429'; end if;
  select count(*),max(coalesce(nullif(substring(c from '^SN-[A-Z0-9]{5}-([0-9]+)$'),'')::integer,1)) into used,top_suffix from (
    select o.code c from public.orders o where o.code=code_base or o.code like code_base||'-%'
    union all select r.code from public.website_requests r where r.code=code_base or r.code like code_base||'-%'
  ) q;
  insert into public.website_requests(code,message_code,fingerprint,name,phone,pincode,delivery_address,lines,coupon_code)
  values(case when used=0 then code_base else code_base||'-'||(top_suffix+1) end,code_base,fp,nm,ph,addr->>'pincode',addr,lines_clean,coupon);
end $$;
revoke all on function public.submit_website_request(text,jsonb,text,text,jsonb,text) from public;
grant execute on function public.submit_website_request(text,jsonb,text,text,jsonb,text) to anon,authenticated;

-- Exact legacy signature: old clients now create incomplete pending requests,
-- never active orders. Null delivery values are represented explicitly.
create or replace function public.submit_order(p_code text,p_lines jsonb,p_name text,p_pincode text,p_coupon text default null)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare ip text:='unknown'; h text:=current_setting('request.headers',true); key text; nm text; pin text; lines_clean jsonb; code_base text; fp text; used integer; top_suffix integer; coupon text;
begin
  if h is not null and h<>'' then ip:=coalesce(nullif(trim(h::jsonb->>'cf-connecting-ip'),''),nullif(trim(split_part(h::jsonb->>'x-forwarded-for',',',1)),''),'unknown'); end if;
  if ip<>'unknown' then key:=left(encode(digest(ip,'sha256'),'hex'),64); end if;
  code_base:=upper(btrim(p_code,E' \t\r\n'));
  if code_base !~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$' then raise exception using message='That order code doesn''t look right.',errcode='22023'; end if;
  lines_clean:=public.order_clean_lines(p_lines,10,false);
  if exists(select 1 from jsonb_array_elements(lines_clean) x where public.order_size_grams(x->>'size') not between 1 and 1000) then raise exception using message='One of the items doesn''t look right.',errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(lines_clean) x where not exists(select 1 from public.kitchen_products kp where kp.product_id=x->>'product_id')) then raise exception using message='One of the items doesn''t look right.',errcode='22023'; end if;
  nm:=public.order_clean_name(p_name); if nm is null or char_length(nm) not between 2 and 60 then raise exception using message='A name is 2 to 60 characters.',errcode='22023'; end if;
  pin:=btrim(p_pincode,E' \t\r\n'); if pin !~ '^[1-9][0-9]{5}$' then raise exception using message='A pincode is 6 digits.',errcode='22023'; end if;
  coupon:=upper(btrim(p_coupon,E' \t\r\n')); if coupon is not null and coupon !~ '^[A-Z0-9-]{3,24}$' then coupon:=null; end if;
  fp:=md5(lower(nm)||'|'||pin||'|'||(select string_agg((x->>'product_id')||':'||(x->>'size')||':'||(x->>'quantity'),',' order by x->>'product_id' collate "C",x->>'size' collate "C") from jsonb_array_elements(lines_clean) x)||'|'||coalesce(coupon,''));
  perform pg_advisory_xact_lock(hashtext('order_code:'||code_base));
  perform pg_advisory_xact_lock(hashtext('website_request_global_quota'));
  if exists(select 1 from public.website_requests where (code=code_base or code like code_base||'-%') and fingerprint=fp) then return; end if;
  if exists(select 1 from public.orders o where o.source='site' and (o.code=code_base or o.code like code_base||'-%') and o.fingerprint=fp) then return; end if;
  if key is not null then
    perform pg_advisory_xact_lock(hashtext('submit_order:'||key));
    delete from public.order_rate_limits where attempted_at<timezone('utc',now())-interval '1 hour';
    if (select count(*) from public.order_rate_limits where request_key=key and attempted_at>timezone('utc',now())-interval '1 hour')>=10 then raise exception using message='Too many orders. Try again later.',errcode='PT429'; end if;
    insert into public.order_rate_limits(request_key) values(key);
  end if;
  if (select count(*) from public.website_requests where created_at>now()-interval '1 hour')>=300 then raise exception using message='Too many orders. Try again later.',errcode='PT429'; end if;
  select count(*),max(coalesce(nullif(substring(c from '^SN-[A-Z0-9]{5}-([0-9]+)$'),'')::integer,1)) into used,top_suffix from (
    select o.code c from public.orders o where o.code=code_base or o.code like code_base||'-%' union all
    select r.code from public.website_requests r where r.code=code_base or r.code like code_base||'-%'
  ) q;
  insert into public.website_requests(code,message_code,fingerprint,name,pincode,lines,coupon_code,is_legacy)
  values(case when used=0 then code_base else code_base||'-'||(top_suffix+1) end,code_base,fp,nm,pin,lines_clean,coupon,true);
end $$;
revoke all on function public.submit_order(text,jsonb,text,text,text) from public;
grant execute on function public.submit_order(text,jsonb,text,text,text) to anon,authenticated;

create or replace function public.get_admin_website_requests(p_state text default 'pending',p_search text default null,p_before timestamptz default null,p_limit integer default 30,p_before_id uuid default null)
returns json language plpgsql security definer set search_path=public as $$
declare result json;
begin
  if not public.is_admin() then raise exception using message='Unauthorized'; end if;
  if p_state not in ('pending','confirmed','dismissed','all') then raise exception using message='Invalid request state.',errcode='22023'; end if;
  select json_build_object('requests',coalesce(json_agg(x.obj order by x.created_at desc,x.id desc) filter (where x.rn<=least(greatest(coalesce(p_limit,30),1),100)),'[]'::json),'next_before',case when count(*)>least(greatest(coalesce(p_limit,30),1),100) then (array_agg(x.created_at order by x.rn desc))[2] end,'next_before_id',case when count(*)>least(greatest(coalesce(p_limit,30),1),100) then (array_agg(x.id order by x.rn desc))[2] end) into result
  from (select r.id,r.created_at,row_number() over(order by r.created_at desc,r.id desc) rn,json_build_object('id',r.id,'code',r.code,'message_code',r.message_code,'name',r.name,'phone',r.phone,'pincode',r.pincode,'delivery_address',r.delivery_address,'lines',r.lines,'coupon_code',r.coupon_code,'created_at',r.created_at,'state',r.state,'is_legacy',r.is_legacy) obj
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
  return jsonb_build_object('id',r.id,'code',r.code,'message_code',r.message_code,'name',r.name,'phone',r.phone,'pincode',r.pincode,'delivery_address',r.delivery_address,'lines',r.lines,'coupon_code',r.coupon_code,'created_at',r.created_at,'state',r.state,'is_legacy',r.is_legacy,'confirmed_order_id',r.confirmed_order_id,'confirmed_at',r.confirmed_at,'dismissed_at',r.dismissed_at)::json;
end $$;
create or replace function public.confirm_admin_website_request(p_id uuid,p_details jsonb default '{}')
returns json language plpgsql security definer set search_path=public,extensions as $$
declare r public.website_requests; nm text; ph text; addr jsonb; coupon_id uuid; coupon_valid boolean; oid uuid; ord public.orders;
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
  insert into public.orders(code,fingerprint,source,status,name,phone,pincode,delivery_address,coupon_code,coupon_id,coupon_valid)
    values(r.code,r.fingerprint,'site','cooking',nm,ph,addr->>'pincode',addr,r.coupon_code,coupon_id,coupon_valid) returning * into ord;
  insert into public.order_lines(order_id,product_id,size,quantity) select ord.id,x->>'product_id',x->>'size',(x->>'quantity')::integer from jsonb_array_elements(r.lines) x;
  perform public.kitchen_lock();
  perform public.kitchen_fill_all(public.kitchen_order_products(ord.id));
  select * into ord from public.orders where id=ord.id;
  update public.website_requests set state='confirmed',confirmed_order_id=ord.id,confirmed_at=timezone('utc',now()),confirmed_by=auth.uid() where id=p_id;
  return json_build_object('state','confirmed','order',public.admin_order_json(ord));
end $$;
create or replace function public.dismiss_admin_website_request(p_id uuid)
returns json language plpgsql security definer set search_path=public as $$
declare r public.website_requests;
begin
  if not public.is_admin() then raise exception using message='Unauthorized'; end if;
  select * into r from public.website_requests where id=p_id for update;
  if not found then raise exception using message='Request not found.',errcode='P0002'; end if;
  if r.state='pending' then update public.website_requests set state='dismissed',dismissed_at=timezone('utc',now()),dismissed_by=auth.uid() where id=p_id; return json_build_object('state','dismissed'); end if;
  return json_build_object('state',r.state);
end $$;
revoke all on function public.get_admin_website_requests(text,text,timestamptz,integer,uuid),public.get_admin_website_request(uuid),public.confirm_admin_website_request(uuid,jsonb),public.dismiss_admin_website_request(uuid) from public,anon;
grant execute on function public.get_admin_website_requests(text,text,timestamptz,integer,uuid),public.get_admin_website_request(uuid),public.confirm_admin_website_request(uuid,jsonb),public.dismiss_admin_website_request(uuid) to authenticated;

-- Keep delivery details in the shared order response and preserve them when
-- owners edit an order. These are the common admin RPC paths.
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
          -- Where its food came from: each batch's made-on day and grams, oldest first.
          'batches', coalesce((
            select json_agg(json_build_object('made_on', b.made_on, 'grams', a.grams)
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


create or replace function public.update_admin_order(p_id uuid, p_changes jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_paid boolean;
  v_method text;
  v_note text;
  v_cover public.order_payments;
  v_order public.orders;
  v_from text;
  v_priority boolean;
  v_changed_at timestamptz;
  v_action uuid;
  v_effects jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception using message = 'Nothing to change.', errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in (
      'status', 'status_changed_at', 'paid', 'paid_method', 'paid_note', 'phone', 'amount', 'note', 'name', 'pincode', 'delivery_address', 'priority'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  if p_changes ? 'status' or p_changes ? 'priority' then
    perform public.kitchen_lock();
  end if;

  select * into v_order from public.orders where id = p_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;
  v_from := v_order.status;

  if p_changes ? 'status' then
    v_order.status := public.order_check_status(p_changes -> 'status');
  end if;

  -- Undo of a status tap sends back when the order entered the old status.
  if p_changes ? 'status_changed_at' then
    if not p_changes ? 'status' then
      raise exception using message = 'status_changed_at goes only with status.', errcode = '22023';
    end if;
    v_changed_at := public.order_check_payment_date(p_changes -> 'status_changed_at');
  end if;

  if p_changes ? 'paid' then
    v_paid := public.order_check_boolean(p_changes -> 'paid', 'paid');
  end if;

  v_priority := v_order.priority;
  if p_changes ? 'priority' then
    v_order.priority := public.order_check_boolean(p_changes -> 'priority', 'priority');
  end if;

  if (p_changes ? 'paid_method' or p_changes ? 'paid_note') and v_paid is not true then
    raise exception using message = 'Mark it paid to say how they paid.', errcode = '22023';
  end if;

  if p_changes ? 'phone' then
    v_order.phone := public.order_check_phone(p_changes -> 'phone');
  end if;

  if p_changes ? 'amount' then
    v_order.amount := public.order_check_amount(p_changes -> 'amount');
  end if;

  if p_changes ? 'note' then
    v_order.note := public.order_check_note(p_changes -> 'note');
  end if;

  if p_changes ? 'name' then
    v_order.name := public.order_check_name(p_changes -> 'name');
  end if;

  if p_changes ? 'pincode' then
    v_order.pincode := public.order_check_pincode(p_changes -> 'pincode');
  end if;

  if p_changes ? 'delivery_address' then v_order.delivery_address := public.website_clean_address(p_changes -> 'delivery_address', true); end if;


  if v_order.source = 'site' and (v_order.name is null or v_order.pincode is null) then
    raise exception using message = 'An order from the site keeps its name and pincode.', errcode = '22023';
  end if;

  if v_order.delivery_address is not null and v_order.pincode is distinct from v_order.delivery_address ->> 'pincode' then
    raise exception using message = 'Pincode must match delivery address.', errcode = '22023';
  end if;

  if v_order.name is null and v_order.phone is null then
    raise exception using message = 'Add a name or a phone number.', errcode = '22023';
  end if;

  if v_paid is false then
    delete from public.order_payments where order_id = p_id;
  end if;

  if v_order.status <> v_from or v_order.priority <> v_priority then
    v_action := public.kitchen_action_start(case when v_order.status <> v_from then 'order_status' else 'priority' end);
  end if;

  update public.orders
  set
    status = v_order.status,
    kitchen_hold = case when v_from in ('packing', 'ready') and v_order.status = 'cooking' then true else kitchen_hold end,
    status_changed_at = coalesce(v_changed_at, status_changed_at),
    priority = v_order.priority,
    phone = v_order.phone,
    amount = v_order.amount,
    note = v_order.note,
    name = v_order.name,
    pincode = v_order.pincode,
    delivery_address = v_order.delivery_address
  where id = p_id
  returning * into v_order;

  if v_action is not null then
    perform public.kitchen_order_moved(p_id, v_from, v_order.status);
    if v_order.priority <> v_priority then
      perform public.kitchen_fill_all(public.kitchen_order_products(p_id));
    end if;

    -- Every status or priority move is undone through undo_admin_kitchen(),
    -- which puts it back exactly (status, when it began, priority) and removes
    -- the history it wrote, so an undone tap leaves no trace.
    v_effects := public.kitchen_effects_json(v_action, false);
    perform public.kitchen_action_finish(v_action);
  end if;

  if v_paid then
    v_cover := public.order_covering_payment(p_id, v_order.amount);

    v_method := case
      when p_changes ? 'paid_method' then public.order_check_paid_method(p_changes -> 'paid_method')
      else v_cover.method
    end;
    v_note := case
      when p_changes ? 'paid_note' then public.order_check_paid_note(p_changes -> 'paid_note')
      when p_changes ? 'paid_method' then null
      else v_cover.note
    end;
    perform public.order_check_paid_pair(v_method, v_note);

    if v_order.paid_at is null then
      perform public.order_pay_rest(p_id, v_method, v_note, null);
    elsif p_changes ? 'paid_method' or p_changes ? 'paid_note' then
      update public.order_payments
      set method = v_method, note = v_note
      where id = v_cover.id;
    end if;
  end if;

  select * into v_order from public.orders where id = p_id;
  return (
    public.admin_order_json(v_order)::jsonb || jsonb_build_object('kitchen_effects', v_effects)
  )::json;
end;
$$;

revoke all on function public.admin_order_json(public.orders) from public, anon, authenticated;
revoke all on function public.update_admin_order(uuid,jsonb) from public, anon;
grant execute on function public.update_admin_order(uuid,jsonb) to authenticated;

-- Edit order keeps a website order's delivery address (20260929000001's
-- function, plus delivery_address, which must agree with the pincode).
create or replace function public.save_admin_order(p_id uuid default null, p_order jsonb default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input jsonb := coalesce(p_order, '{}'::jsonb);
  v_key text;
  v_lines jsonb;
  v_free_sample boolean;
  v_old_grams jsonb;
  v_name text;
  v_phone text;
  v_pincode text;
  v_address jsonb;
  v_note text;
  v_amount integer;
  v_coupon text;
  v_coupon_id uuid;
  v_coupon_valid boolean;
  v_source text;
  v_status text := 'cooking';
  v_priority boolean;
  v_paid boolean := false;
  v_paid_method text;
  v_paid_note text;
  v_created_at timestamptz := timezone('utc', now());
  v_code text;
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if jsonb_typeof(v_input) <> 'object' then
    raise exception using message = 'Add at least one item.', errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(v_input) loop
    if v_key not in (
      'source', 'code', 'name', 'phone', 'pincode', 'delivery_address', 'note', 'amount',
      'coupon', 'lines', 'status', 'paid', 'paid_method', 'paid_note', 'created_at', 'priority'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  v_lines := public.order_clean_lines(v_input -> 'lines', 99, true);
  -- Only products we make (every one has a kitchen_products row, set up by
  -- the migration that adds it).
  if exists (
    select 1 from jsonb_array_elements(v_lines) line
    where not exists (select 1 from public.kitchen_products k where k.product_id = line ->> 'product_id')
  ) then
    raise exception using message = 'We don''t know one of those products.', errcode = '22023';
  end if;
  v_free_sample := not exists (
    select 1 from jsonb_array_elements(v_lines) line where line ->> 'size' <> 'sample'
  );
  v_name := public.order_check_name(v_input -> 'name');
  v_phone := public.order_check_phone(v_input -> 'phone');
  v_pincode := public.order_check_pincode(v_input -> 'pincode');
  if coalesce(jsonb_typeof(v_input -> 'delivery_address'), 'null') <> 'null' then
    v_address := public.website_clean_address(v_input -> 'delivery_address', true);
    if v_pincode is distinct from v_address ->> 'pincode' then
      raise exception using message = 'Pincode must match delivery address.', errcode = '22023';
    end if;
  end if;
  v_note := public.order_check_note(v_input -> 'note');
  v_amount := public.order_check_amount(v_input -> 'amount');
  v_coupon := public.order_check_coupon(v_input -> 'coupon');
  if coalesce(jsonb_typeof(v_input -> 'priority'), 'null') <> 'null' then
    v_priority := public.order_check_boolean(v_input -> 'priority', 'priority');
  end if;

  if p_id is not null then
    perform public.kitchen_lock();
    select * into v_order from public.orders where id = p_id for update;
    if v_order.id is null then
      raise exception using message = 'That order is gone.', errcode = '22023';
    end if;
  end if;

  if p_id is not null and v_order.source = 'site' then
    v_source := 'site';
  elsif p_id is not null and coalesce(jsonb_typeof(v_input -> 'source'), 'null') = 'null' then
    v_source := v_order.source;
  else
    v_source := v_input ->> 'source';
    if v_source is null or v_source not in ('whatsapp', 'call', 'instagram', 'in_person') then
      raise exception using message = 'Choose where the order came from.', errcode = '22023';
    end if;
  end if;

  if v_source = 'site' and (v_name is null or v_pincode is null) then
    raise exception using message = 'An order from the site keeps its name and pincode.', errcode = '22023';
  end if;

  if v_name is null and v_phone is null then
    raise exception using message = 'Add a name or a phone number.', errcode = '22023';
  end if;

  if v_coupon is not null and (p_id is null or v_coupon is distinct from v_order.coupon_code) then
    select c.id, (c.active and (c.expires_at is null or c.expires_at > now()))
    into v_coupon_id, v_coupon_valid
    from public.coupons c
    where upper(c.code) = v_coupon;

    v_coupon_valid := coalesce(v_coupon_valid, false);
  elsif v_coupon is not null then
    v_coupon_id := v_order.coupon_id;
    v_coupon_valid := v_order.coupon_valid;
  end if;

  if p_id is not null then
    -- Edit. Code, status, payments and created_at are left alone.
    select coalesce(jsonb_object_agg(l.product_id || '|' || l.size, l.grams_each), '{}'::jsonb)
    into v_old_grams
    from public.order_lines l
    where l.order_id = p_id;

    update public.orders
    set
      source = v_source,
      name = v_name,
      phone = v_phone,
      pincode = v_pincode,
      -- Left out keeps the saved address; an explicit null clears it.
      delivery_address = case when v_input ? 'delivery_address' then v_address else delivery_address end,
      note = v_note,
      amount = v_amount,
      coupon_code = v_coupon,
      coupon_id = v_coupon_id,
      coupon_valid = v_coupon_valid,
      free_sample = v_free_sample,
      priority = coalesce(v_priority, priority)
    where id = p_id
    returning * into v_order;

    delete from public.order_lines where order_id = p_id;

    -- A sample the order already had keeps the weight it was saved with.
    insert into public.order_lines (order_id, product_id, size, quantity, grams_each)
    select v_order.id, line ->> 'product_id', line ->> 'size', (line ->> 'quantity')::integer,
      case when line ->> 'size' = 'sample'
        then (v_old_grams ->> ((line ->> 'product_id') || '|sample'))::integer
      end
    from jsonb_array_elements(v_lines) line;

    perform public.kitchen_order_rebalance(v_order.id);
    -- A priority change only reorders food not yet given.
    perform public.kitchen_fill_all(public.kitchen_order_products(v_order.id));
  else
    if coalesce(jsonb_typeof(v_input -> 'status'), 'null') <> 'null' then
      v_status := public.order_check_status(v_input -> 'status');
    end if;

    if coalesce(jsonb_typeof(v_input -> 'paid'), 'null') <> 'null' then
      v_paid := public.order_check_boolean(v_input -> 'paid', 'paid');
    end if;

    v_paid_method := public.order_check_paid_method(v_input -> 'paid_method');
    v_paid_note := public.order_check_paid_note(v_input -> 'paid_note');
    if not v_paid and (v_paid_method is not null or v_paid_note is not null) then
      raise exception using message = 'Mark it paid to say how they paid.', errcode = '22023';
    end if;
    perform public.order_check_paid_pair(v_paid_method, v_paid_note);

    if coalesce(jsonb_typeof(v_input -> 'created_at'), 'null') <> 'null' then
      begin
        v_created_at := (v_input ->> 'created_at')::timestamptz;
      exception
        when others then
          raise exception using message = 'That date doesn''t look right.', errcode = '22023';
      end;

      if v_created_at > now() + interval '5 minutes' then
        raise exception using message = 'An order can''t be dated in the future.', errcode = '22023';
      end if;
      v_created_at := least(v_created_at, timezone('utc', now()));
    end if;

    v_code := upper(btrim(regexp_replace(btrim(coalesce(v_input ->> 'code', '')), '^#+', '')));
    if v_code = '' then
      v_code := public.order_new_code();
    else
      if v_code not like 'SN-%' then
        v_code := 'SN-' || v_code;
      end if;

      if v_code !~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$' then
        raise exception using message = 'That order code doesn''t look right.', errcode = '22023';
      end if;

      perform pg_advisory_xact_lock(hashtext('order_code:' || v_code));
      if public.order_code_taken(v_code) then
        raise exception using
          message = format('%s is already an order. Open that one, or leave the code empty and we''ll make one.', v_code),
          errcode = '22023';
      end if;
    end if;

    -- After the code lock, as in submit_order().
    perform public.kitchen_lock();

    insert into public.orders (
      code, source, status, name, pincode, delivery_address, phone, note, amount,
      coupon_code, coupon_id, coupon_valid, free_sample, priority, created_at, created_by
    ) values (
      v_code, v_source, v_status,
      v_name, v_pincode, v_address, v_phone, v_note, v_amount,
      v_coupon, v_coupon_id, v_coupon_valid, v_free_sample, coalesce(v_priority, false), v_created_at, auth.uid()
    ) returning * into v_order;

    insert into public.order_lines (order_id, product_id, size, quantity)
    select v_order.id, line ->> 'product_id', line ->> 'size', (line ->> 'quantity')::integer
    from jsonb_array_elements(v_lines) line;

    if v_paid then
      perform public.order_pay_rest(v_order.id, v_paid_method, v_paid_note, null);
    end if;

    if v_status = 'cooking' then
      perform public.kitchen_fill_all(public.kitchen_order_products(v_order.id));
    elsif v_status <> 'cancelled' then
      perform public.kitchen_cover_by_hand(v_order.id);
    end if;
  end if;

  select * into v_order from public.orders where id = v_order.id;
  return public.admin_order_json(v_order);
end;
$$;

revoke all on function public.save_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.save_admin_order(uuid, jsonb) to authenticated;
