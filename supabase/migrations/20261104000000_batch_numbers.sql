-- Migration: 20261104000000_batch_numbers.sql
-- Batch numbers, Mfg and Exp dates, and choosing which batch an order gets
-- (the owners' ask, 2026-11-04).
--
-- Every batch gets a number when it's logged: the product's letter, then the
-- made-on day as DDMMYY. Raggi Jaggi made on 4 Nov 2026 is R041126, Muesli
-- M041126, and Date Bites 041126 (no letter). A second batch of the same
-- product on the same day is -2, then -3, and so on. The letter lives in
-- kitchen_products.batch_prefix, so a new product's migration sets its own.
--
-- Mfg is made_on. Exp (kitchen_batches.expires_on) is worked out once, when
-- the batch is logged, from the product's shelf life at that moment: it's the
-- date printed on the pack, so a later shelf life change applies to new
-- batches only. Fixing a batch's made-on day works out its number and Exp
-- again. The kitchen's fresh / near / past now reads the batch's own Exp.
--
-- set_admin_order_batch() moves one product of an order onto another batch
-- with enough spare (the fill still picks the oldest batch first; this is the
-- by-hand change at packing). get_admin_batches() lists batches with the
-- orders each one went to.
--
-- Ships after the app: the app shows batch numbers only when the answers
-- carry `code`, and hides Batches and Change batch while their RPCs answer
-- missing.

-- ═══════════════════════════════════════════════════════
-- 1. Columns
-- ═══════════════════════════════════════════════════════

alter table public.kitchen_products
  add column if not exists batch_prefix text not null default '';

alter table public.kitchen_products
  drop constraint if exists kitchen_products_batch_prefix_check;
alter table public.kitchen_products
  add constraint kitchen_products_batch_prefix_check check (batch_prefix ~ '^[A-Z]{0,3}$');

-- Agreed 2026-11-04: Raggi Jaggi R, Muesli M, Date Bites none.
update public.kitchen_products set batch_prefix = 'R' where product_id = 'raggi-jaggi';
update public.kitchen_products set batch_prefix = 'M' where product_id = 'muesli';
update public.kitchen_products set batch_prefix = '' where product_id = 'bites';

alter table public.kitchen_batches
  add column if not exists code text,
  add column if not exists expires_on date;

-- ═══════════════════════════════════════════════════════
-- 2. The number and Exp
-- ═══════════════════════════════════════════════════════

-- R041126, or R041126-2 when another batch already has it.
create or replace function public.kitchen_batch_code(p_product_id text, p_made_on date, p_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text := coalesce((
    select k.batch_prefix from public.kitchen_products k where k.product_id = p_product_id
  ), '') || to_char(p_made_on, 'DDMMYY');
  v_code text := v_base;
  v_n integer := 1;
begin
  while exists (
    select 1 from public.kitchen_batches b where b.code = v_code and b.id is distinct from p_id
  ) loop
    v_n := v_n + 1;
    v_code := v_base || '-' || v_n;
  end loop;
  return v_code;
end;
$$;

revoke all on function public.kitchen_batch_code(text, date, uuid) from public, anon, authenticated;

-- Exp from the product's shelf life now. Null: it never expires.
create or replace function public.kitchen_batch_expires_on(p_product_id text, p_made_on date)
returns date
language sql
stable
set search_path = public
as $$
  select public.kitchen_expires_on(p_made_on, k.shelf_life_amount, k.shelf_life_unit)
  from public.kitchen_products k
  where k.product_id = p_product_id;
$$;

revoke all on function public.kitchen_batch_expires_on(text, date) from public, anon, authenticated;

-- Backfill, oldest first, so the first batch of a day keeps the plain number.
-- Exp from today's shelf life, which is what the kitchen showed until now.
-- Not through the trigger below (it doesn't exist yet), and grams and
-- made-on day don't change, so the cooking history records nothing.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select b.id from public.kitchen_batches b
    where b.code is null
    order by b.made_on, b.created_at, b.id
  loop
    update public.kitchen_batches b
    set code = public.kitchen_batch_code(b.product_id, b.made_on, b.id),
      expires_on = public.kitchen_batch_expires_on(b.product_id, b.made_on)
    where b.id = v_id;
  end loop;
end;
$$;

-- The updates queued the batch room check (deferred); run it now, so the
-- table can be altered in this transaction.
set constraints all immediate;

alter table public.kitchen_batches alter column code set not null;

alter table public.kitchen_batches
  drop constraint if exists kitchen_batches_code_check;
alter table public.kitchen_batches
  add constraint kitchen_batches_code_check check (code ~ '^[A-Z]{0,3}[0-9]{6}(-[0-9]{1,4})?$');

create unique index if not exists kitchen_batches_code_key on public.kitchen_batches (code);

-- Gives a new batch its number and Exp, and works them out again when its
-- made-on day changes. A row that arrives with a number it can keep keeps it
-- (Undo puts a deleted batch back with its old one), and so does an update
-- that sets the number itself.
create or replace function public.kitchen_batch_label()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.code is null or exists (
      select 1 from public.kitchen_batches b where b.code = new.code and b.id <> new.id
    ) then
      new.code := public.kitchen_batch_code(new.product_id, new.made_on, new.id);
    end if;
    if new.expires_on is null then
      new.expires_on := public.kitchen_batch_expires_on(new.product_id, new.made_on);
    end if;
    return new;
  end if;

  if new.made_on is distinct from old.made_on or new.product_id is distinct from old.product_id then
    if new.code is not distinct from old.code then
      new.code := public.kitchen_batch_code(new.product_id, new.made_on, new.id);
    end if;
    if new.expires_on is not distinct from old.expires_on then
      new.expires_on := public.kitchen_batch_expires_on(new.product_id, new.made_on);
    end if;
  end if;

  if new.code is null then
    new.code := public.kitchen_batch_code(new.product_id, new.made_on, new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.kitchen_batch_label() from public, anon, authenticated;

drop trigger if exists trg_kitchen_batches_label on public.kitchen_batches;
create trigger trg_kitchen_batches_label
  before insert or update on public.kitchen_batches
  for each row execute function public.kitchen_batch_label();

-- ═══════════════════════════════════════════════════════
-- 3. The kitchen reads the batch's own Exp, and shows its number
-- ═══════════════════════════════════════════════════════

-- As in 20260929000001, with Exp from the batch itself.
create or replace function public.kitchen_batch_rows(p_product_id text default null)
returns table (
  batch_id uuid, product_id text, grams integer, made_on date, created_at timestamptz,
  created_by uuid, to_orders integer, written_off integer, spare integer,
  expires_on date, days_left integer, state text, usable boolean
)
language sql
stable
set search_path = public
as $$
  select b.id, b.product_id, b.grams, b.made_on, b.created_at, b.created_by,
    coalesce(a.grams, 0)::integer,
    coalesce(w.grams, 0)::integer,
    (b.grams - coalesce(a.grams, 0) - coalesce(w.grams, 0))::integer,
    e.expires_on,
    e.expires_on - public.kitchen_today(),
    public.kitchen_batch_state(b.made_on, e.expires_on, public.kitchen_today()),
    e.expires_on is null or public.kitchen_today() < e.expires_on
  from public.kitchen_batches b
  join public.kitchen_products p on p.product_id = b.product_id
  left join lateral (
    select sum(x.grams) as grams from public.kitchen_allocations x where x.batch_id = b.id
  ) a on true
  left join lateral (
    select sum(x.grams) as grams from public.kitchen_writeoffs x where x.batch_id = b.id
  ) w on true
  -- The batch's own Exp, fixed when it was logged (20261104000000).
  cross join lateral (
    select b.expires_on
  ) e
  where p_product_id is null or b.product_id = p_product_id;
$$;

revoke all on function public.kitchen_batch_rows(text) from public, anon, authenticated;

-- As in 20260929000001, plus each batch's code (and Exp and state on the
-- recent batches).
create or replace function public.kitchen_state_json()
returns jsonb
language sql
stable
set search_path = public
as $$
  with cover as (
    select o.id as order_id, o.code, o.name, o.created_at, o.priority, c.product_id, c.need, c.covered
    from public.orders o
    cross join lateral public.kitchen_order_cover(o.id) c
    where o.status = 'cooking'
  ),
  short as (
    select cv.*, cv.need - cv.covered as short from cover cv where cv.covered < cv.need
  ),
  batches as (
    select r.*, kb.code from public.kitchen_batch_rows(null) r
    join public.kitchen_batches kb on kb.id = r.batch_id
  )
  select jsonb_build_object(
    'can_write_off', public.kitchen_can_write_off(),
    'today', public.kitchen_today(),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_id', k.product_id,
          'sample_grams', k.sample_grams,
          'shelf_life', case when k.shelf_life_amount is null then null
            else jsonb_build_object('amount', k.shelf_life_amount, 'unit', k.shelf_life_unit) end,
          -- Grams still short across Cooking orders.
          'to_cook', coalesce((select sum(s.short) from short s where s.product_id = k.product_id), 0),
          -- The packs those orders hold, for "250 g × 2 · 500 g × 3".
          'waiting_packs', coalesce((
            select jsonb_agg(jsonb_build_object('size', w.size, 'grams_each', w.grams_each, 'packs', w.packs)
              order by (w.size = 'sample'), w.grams_each)
            from (
              select public.order_size_label(l.size, l.grams_each) as size, l.grams_each, sum(l.quantity) as packs
              from public.order_lines l
              where l.product_id = k.product_id
                and l.order_id in (select s.order_id from short s where s.product_id = k.product_id)
              group by 1, 2
            ) w
          ), '[]'::jsonb),
          -- Who it's for, in fill order: priority first, then oldest first.
          'queue', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'order_id', s.order_id, 'code', s.code, 'name', s.name, 'created_at', s.created_at,
                'priority', s.priority,
                'short', s.short,
                'also_waiting', coalesce((
                  select jsonb_agg(x.product_id order by x.product_id)
                  from short x where x.order_id = s.order_id and x.product_id <> s.product_id
                ), '[]'::jsonb),
                -- The order's other products that are already covered, so the
                -- card can say "Asha's order is only waiting on this".
                'covered', coalesce((
                  select jsonb_agg(y.product_id order by y.product_id)
                  from cover y
                  where y.order_id = s.order_id and y.product_id <> s.product_id and y.covered >= y.need
                ), '[]'::jsonb)
              )
              order by s.priority desc, s.created_at, s.order_id
            )
            from short s where s.product_id = k.product_id
          ), '[]'::jsonb),
          -- Usable spare: not past its shelf life.
          'spare', coalesce((
            select sum(b.spare) from batches b
            where b.product_id = k.product_id and b.usable and b.spare > 0
          ), 0),
          -- Every batch with food on the shelf, oldest first, past ones too.
          -- grams is what's left of it.
          'spare_batches', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'batch_id', b.batch_id, 'code', b.code, 'made_on', b.made_on, 'grams', b.spare,
                'expires_on', b.expires_on, 'days_left', b.days_left, 'state', b.state
              )
              order by b.made_on, b.created_at, b.batch_id
            )
            from batches b where b.product_id = k.product_id and b.spare > 0
          ), '[]'::jsonb)
        )
        order by k.product_id
      )
      from public.kitchen_products k
    ), '[]'::jsonb),
    -- Batches made or logged in the last 14 days, newest first, to fix.
    'batches', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.batch_id, 'code', b.code, 'product_id', b.product_id, 'grams', b.grams, 'made_on', b.made_on,
          'expires_on', b.expires_on, 'state', b.state,
          'created_at', b.created_at, 'by_name', coalesce(a.display_name, a.email),
          'to_orders', b.to_orders, 'spare', b.spare, 'written_off', b.written_off,
          -- How many orders its food went to ("covered 4 orders").
          'orders', (select count(distinct x.order_id) from public.kitchen_allocations x where x.batch_id = b.batch_id)
        )
        order by b.made_on desc, b.created_at desc, b.batch_id
      )
      from batches b
      left join public.admin_users a on a.id = b.created_by
      where b.made_on >= public.kitchen_today() - 14
         or b.created_at >= timezone('utc', now()) - interval '14 days'
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.kitchen_state_json() from public, anon, authenticated;

-- As in 20260929000001, plus each batch's code and Exp.
create or replace function public.kitchen_effects_json(p_action_id uuid, p_preview boolean)
returns jsonb
language sql
stable
set search_path = public
as $$
  with s as (
    select * from public.kitchen_action_steps where action_id = p_action_id
  ),
  al as (
    select (coalesce(s.new, s.old) ->> 'order_id')::uuid as order_id,
      coalesce(s.new, s.old) ->> 'product_id' as product_id,
      (coalesce(s.new, s.old) ->> 'batch_id')::uuid as batch_id,
      coalesce((s.new ->> 'grams')::integer, 0) - coalesce((s.old ->> 'grams')::integer, 0) as change
    from s where s.tbl = 'kitchen_allocations'
  ),
  st as (
    select (s.new ->> 'id')::uuid as order_id, s.old ->> 'status' as from_status, s.seq
    from s where s.tbl = 'orders'
  ),
  touched as (
    select al.order_id from al union select st.order_id from st
  ),
  order_rows as (
    select o.id, o.code, o.name, o.status, o.created_at,
      coalesce((select st.from_status from st where st.order_id = o.id order by st.seq limit 1), o.status) as from_status,
      coalesce((
        select jsonb_agg(jsonb_build_object('product_id', g.product_id, 'change', g.change) order by g.product_id)
        from (
          select al.product_id, sum(al.change)::integer as change
          from al where al.order_id = o.id and al.batch_id is not null
          group by al.product_id
          having sum(al.change) <> 0
        ) g
      ), '[]'::jsonb) as grams
    from public.orders o
    where o.id in (select t.order_id from touched t)
  ),
  batch_ids as (
    select (coalesce(s.new, s.old) ->> 'id')::uuid as id from s where s.tbl = 'kitchen_batches'
    union
    select al.batch_id from al where al.batch_id is not null
    union
    select (coalesce(s.new, s.old) ->> 'batch_id')::uuid from s where s.tbl = 'kitchen_writeoffs'
  ),
  batch_json as (
    select
      coalesce(r.product_id, gone.old ->> 'product_id') as product_id,
      coalesce(r.made_on, (gone.old ->> 'made_on')::date) as made_on,
      jsonb_build_object(
        'id', i.id,
        'product_id', coalesce(r.product_id, gone.old ->> 'product_id'),
        'grams', coalesce(r.grams, (gone.old ->> 'grams')::integer),
        'code', coalesce(kb.code, gone.old ->> 'code'),
        'made_on', coalesce(r.made_on, (gone.old ->> 'made_on')::date),
        'expires_on', coalesce(r.expires_on, (gone.old ->> 'expires_on')::date),
        'to_orders', coalesce(r.to_orders, 0),
        'spare', coalesce(r.spare, 0),
        'written_off', coalesce(r.written_off, 0),
        'deleted', r.batch_id is null
      ) as j
    from batch_ids i
    left join public.kitchen_batch_rows(null) r on r.batch_id = i.id
    left join public.kitchen_batches kb on kb.id = i.id
    left join lateral (
      select s.old from s
      where s.tbl = 'kitchen_batches' and s.op = 'delete' and (s.old ->> 'id')::uuid = i.id
      order by s.seq desc limit 1
    ) gone on true
  )
  select jsonb_build_object(
    'preview', p_preview,
    'action_id', case when p_preview then null else p_action_id end,
    'batches', coalesce((
      select jsonb_agg(b.j order by b.product_id, b.made_on, b.j ->> 'id') from batch_json b
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id, 'code', r.code, 'name', r.name,
          'from', r.from_status, 'to', r.status,
          'grams', r.grams,
          'waiting', case when r.status = 'cooking' then coalesce((
            select jsonb_agg(c.product_id order by c.product_id)
            from public.kitchen_order_cover(r.id) c where c.covered < c.need
          ), '[]'::jsonb) else '[]'::jsonb end
        )
        order by r.created_at, r.id
      )
      from order_rows r
      where r.from_status <> r.status or r.grams <> '[]'::jsonb
    ), '[]'::jsonb),
    'kitchen', public.kitchen_state_json()
  );
$$;

revoke all on function public.kitchen_effects_json(uuid, boolean) from public, anon, authenticated;

-- As in 20261022000001, plus each batch's id, code and Exp under kitchen.
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
          -- Where its food came from: each batch's number, Mfg (made_on), Exp
          -- and grams, oldest first.
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

-- ═══════════════════════════════════════════════════════
-- 4. Change an order's batch
-- ═══════════════════════════════════════════════════════

-- Moves everything one order holds of one product (batch grams and the
-- by-hand part) onto one batch. The old batches get their grams back as
-- spare, and the fill runs, so a short Cooking order can take them.
create or replace function public.kitchen_run_set_order_batch(p_order_id uuid, p_product_id text, p_batch_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders;
  v_need integer;
  v_covered integer;
  v_batch record;
  v_held integer;
  v_move integer;
  v_row record;
  v_action uuid;
  v_effects jsonb;
begin
  perform public.kitchen_lock();

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;
  if v_order.status = 'cancelled' then
    raise exception using message = 'A cancelled order has no food to pick a batch for.', errcode = '22023';
  end if;

  select c.need, c.covered into v_need, v_covered
  from public.kitchen_order_cover(p_order_id) c
  where c.product_id = p_product_id;
  if coalesce(v_need, 0) = 0 then
    raise exception using message = 'That isn''t on this order.', errcode = '22023';
  end if;
  if v_covered < v_need then
    raise exception using message = 'This is still being cooked. Pick its batch once it''s ready.', errcode = '22023';
  end if;

  perform 1 from public.kitchen_batches where id = p_batch_id for update;
  select r.*, b.code into v_batch
  from public.kitchen_batch_rows(null) r
  join public.kitchen_batches b on b.id = r.batch_id
  where r.batch_id = p_batch_id;
  if v_batch.batch_id is null then
    raise exception using message = 'That batch is gone.', errcode = '22023';
  end if;
  if v_batch.product_id <> p_product_id then
    raise exception using message = 'That batch is a different product.', errcode = '22023';
  end if;
  -- Past food never goes out. A delivered order can still be put right.
  if not v_batch.usable and v_order.status <> 'delivered' then
    raise exception using message = format('Batch %s is past its Exp date.', v_batch.code), errcode = '22023';
  end if;

  v_held := coalesce((
    select a.grams from public.kitchen_allocations a
    where a.order_id = p_order_id and a.product_id = p_product_id and a.batch_id = p_batch_id
  ), 0);
  v_move := v_covered - v_held;
  if v_move <= 0 then
    raise exception using message = format('This already comes from batch %s.', v_batch.code), errcode = '22023';
  end if;
  if v_batch.spare < v_move then
    raise exception using
      message = format('Batch %s has %s g spare, and this needs %s g.', v_batch.code, greatest(v_batch.spare, 0), v_move),
      errcode = '22023';
  end if;

  v_action := public.kitchen_action_start('set_batch');

  for v_row in
    select a.id, a.grams from public.kitchen_allocations a
    where a.order_id = p_order_id and a.product_id = p_product_id
      and a.batch_id is distinct from p_batch_id
  loop
    perform public.kitchen_take(v_row.id, v_row.grams);
  end loop;
  perform public.kitchen_give(p_order_id, p_product_id, p_batch_id, v_move);

  perform public.kitchen_fill(p_product_id);

  select * into v_order from public.orders where id = p_order_id;
  v_effects := public.kitchen_effects_json(v_action, false)
    || jsonb_build_object('order', public.admin_order_json(v_order)::jsonb);
  perform public.kitchen_action_finish(v_action);
  return v_effects;
end;
$$;

revoke all on function public.kitchen_run_set_order_batch(uuid, text, uuid) from public, anon, authenticated;

-- "Change batch" on an order: p_product_id of p_order_id now comes from
-- p_batch_id. The order must be ready on that product (not Cooking and
-- short), and the batch must have the spare for it and not be past its Exp
-- (unless the order is delivered: then it's putting the record right).
-- Returns the kitchen effects plus `order`; Undo with undo_admin_kitchen().
create or replace function public.set_admin_order_batch(p_order_id uuid, p_product_id text, p_batch_id uuid)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if p_order_id is null or p_product_id is null or p_batch_id is null then
    raise exception using message = 'Choose a batch.', errcode = '22023';
  end if;

  return public.kitchen_run_set_order_batch(p_order_id, p_product_id, p_batch_id)::json;
end;
$$;

revoke all on function public.set_admin_order_batch(uuid, text, uuid) from public, anon;
grant execute on function public.set_admin_order_batch(uuid, text, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 5. Batches: every batch, and who it went to
-- ═══════════════════════════════════════════════════════

-- Newest made first. p_search matches a batch number, or an order's code,
-- name or phone (4 digits or more) that got food from it. p_limit 1 to 500
-- (default 60); `more` says there are older ones. by_name is the display
-- name only.
create or replace function public.get_admin_batches(
  p_search text default null,
  p_product_id text default null,
  p_limit integer default 60
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 500);
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_digits text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
  v_result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  with found as (
    select r.*, b.code
    from public.kitchen_batch_rows(nullif(btrim(coalesce(p_product_id, '')), '')) r
    join public.kitchen_batches b on b.id = r.batch_id
    where v_search is null
      or strpos(lower(b.code), v_search) > 0
      or exists (
        select 1
        from public.kitchen_allocations a
        join public.orders o on o.id = a.order_id
        where a.batch_id = r.batch_id
          and (
            strpos(lower(o.code), v_search) > 0
            or strpos(lower(coalesce(o.name, '')), v_search) > 0
            or (length(v_digits) >= 4 and strpos(coalesce(o.phone, ''), v_digits) > 0)
          )
      )
  ),
  page as (
    select f.* from found f
    order by f.made_on desc, f.created_at desc, f.batch_id desc
    limit v_limit
  )
  select json_build_object(
    'today', public.kitchen_today(),
    'batches', coalesce((
      select json_agg(
        json_build_object(
          'id', p.batch_id,
          'code', p.code,
          'product_id', p.product_id,
          'grams', p.grams,
          'made_on', p.made_on,
          'expires_on', p.expires_on,
          'days_left', p.days_left,
          'state', p.state,
          'to_orders', p.to_orders,
          'spare', p.spare,
          'written_off', p.written_off,
          'created_at', p.created_at,
          'by_name', u.display_name,
          -- Who it went to, oldest order first, with the order's packs of
          -- this product. grams is what came from this batch.
          'orders', coalesce((
            select json_agg(
              json_build_object(
                'order_id', o.id, 'code', o.code, 'name', o.name, 'status', o.status,
                'created_at', o.created_at, 'grams', x.grams,
                'packs', coalesce((
                  select json_agg(json_build_object('size', l.size, 'quantity', l.quantity, 'grams_each', l.grams_each)
                    order by (l.size = 'sample'), l.grams_each)
                  from public.order_lines l
                  where l.order_id = o.id and l.product_id = p.product_id
                ), '[]'::json)
              )
              order by o.created_at, o.id
            )
            from (
              select a.order_id, sum(a.grams)::integer as grams
              from public.kitchen_allocations a
              where a.batch_id = p.batch_id
              group by a.order_id
            ) x
            join public.orders o on o.id = x.order_id
          ), '[]'::json)
        )
        order by p.made_on desc, p.created_at desc, p.batch_id desc
      )
      from page p
      left join public.admin_users u on u.id = p.created_by
    ), '[]'::json),
    'more', (select count(*) from found) > v_limit
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_batches(text, text, integer) from public, anon;
grant execute on function public.get_admin_batches(text, text, integer) to authenticated;
