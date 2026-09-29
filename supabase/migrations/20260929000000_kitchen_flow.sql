-- Migration: 20260929000000_kitchen_flow.sql
-- The kitchen flow: order stages follow the kitchen (Cooking → Packing →
-- Ready → Delivered → Done), cooking batches fill orders oldest first, food
-- left over is spare stock with its made-on date and shelf life, and a free
-- sample is a third pack size. Admin only, except that submit_order() now
-- lands orders in Cooking and fills them from spare (same signature, same
-- answers; the landing page doesn't change). temp/kitchen-flow/tech-plan.md
-- has the decisions; this file builds exactly that.
--
-- One file on purpose: db push is all or nothing, and the status rename has
-- no down migration (back up the order tables first).
--
--  1. Stages. orders.status is cooking, packing, ready, delivered or
--     cancelled (default cooking). new and confirmed become cooking, sent
--     becomes ready. A site order that is stale today (it never came through
--     on WhatsApp) becomes cancelled, with an auto "cancelled" event. There's
--     no confirm step any more, so kept_at, order_is_stale() and every stale
--     and to_confirm number go.
--  2. Samples. order_lines.size may be 'sample' (admin only; submit_order()
--     still refuses it). order_lines.grams_each is filled on insert: '250 g'
--     is 250, a sample is its product's sample weight at that moment. An edit
--     keeps the old weight for lines it keeps. orders.free_sample (every line
--     a sample) has no total, no coupon and no payments.
--  3. Kitchen tables: kitchen_products (sample weight, shelf life),
--     kitchen_batches, kitchen_allocations (grams given to an order; a null
--     batch means covered by hand), kitchen_writeoffs (used up / thrown out),
--     kitchen_actions and kitchen_action_steps (the undo log, kept 7 days).
--     RLS on, no policies, all grants revoked, like every order table.
--  4. History: order_events gains cooking, packing, ready and an auto flag,
--     so an order moved by a batch says so. Old events stay as they are.
--  5. The rules (internal functions). Spare = batch grams − given to orders
--     − written off. One fill rule, run after every change that adds food or
--     need: per product, short Cooking orders, oldest first, take from usable
--     spare (not past its shelf life), oldest batch first; a Cooking order
--     covered on every product moves to Packing. Past Cooking an order is
--     always fully covered: batch grams where they came from a batch, a
--     by-hand row for the rest.
--     Priority orders ("skip the line") fill first, oldest first among
--     them, then everyone else oldest first. A priority order still short
--     then takes food from non-priority Cooking orders (newest first). Food
--     in packed pouches (Packing, Ready) only moves when someone says yes
--     (give_admin_priority()); Delivered orders are never touched.
--  6. Every kitchen call is one action. Triggers record each row change on
--     the kitchen tables (and each order status change) while an action is
--     open; Undo replays them backwards and refuses if a row has moved since.
--     Preview runs the real code and rolls it back, so they can't drift.
--  7-11. RPCs: new kitchen ones, and every order RPC that knew the old
--     stages. See supabase/README.md for the list.
--
-- Locks: every path that touches allocations takes one advisory lock per
-- kitchen product, all of them, in sorted order, before it locks any order
-- row. At this shop's size one queue is simplest, and it can't deadlock.
--
-- People-facing errors use errcode 22023 with a short plain sentence;
-- not an admin is 'Unauthorized' (P0001), as everywhere else.

-- ═══════════════════════════════════════════════════════
-- 1. Stages: rename, and move the existing orders
-- ═══════════════════════════════════════════════════════

alter table public.order_events
  add column if not exists auto boolean not null default false;

alter table public.order_events drop constraint if exists order_events_event_check;
alter table public.order_events add constraint order_events_event_check check (event in (
  'created', 'cooking', 'packing', 'ready', 'delivered', 'cancelled', 'paid', 'unpaid',
  -- Old events, kept as history.
  'new', 'confirmed', 'sent', 'kept', 'unkept'
));

-- The old stage to the new one. stale is order_is_stale() on the old row
-- (a site order that never came through): it's cancelled rather than cooked.
-- Kept (not dropped) so the mapping has a test.
create or replace function public.kitchen_migrated_status(p_status text, p_stale boolean)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_status = 'new' and coalesce(p_stale, false) then 'cancelled'
    when p_status in ('new', 'confirmed') then 'cooking'
    when p_status = 'sent' then 'ready'
    else p_status
  end;
$$;

revoke all on function public.kitchen_migrated_status(text, boolean) from public, anon, authenticated;

alter table public.orders drop constraint if exists orders_status_check;

-- Stale site orders get an auto "cancelled" event, so their history says why.
-- The other moves are a rename, not a change: no event, and status_changed_at
-- keeps its moment (a sent order has been Ready since it was sent).
insert into public.order_events (order_id, event, by, auto)
select o.id, 'cancelled', null, true
from public.orders o
where o.status = 'new' and public.order_is_stale(o);

alter table public.orders disable trigger user;

update public.orders o
set status = public.kitchen_migrated_status(o.status, public.order_is_stale(o))
where o.status in ('new', 'confirmed', 'sent');

alter table public.orders enable trigger user;

alter table public.orders
  alter column status set default 'cooking',
  add constraint orders_status_check
    check (status in ('cooking', 'packing', 'ready', 'delivered', 'cancelled'));

-- No stale, no Keep.
drop function if exists public.order_is_stale(public.orders);

-- History, without kept/unkept. A change made by the kitchen rules (not by a
-- person choosing it) has auto = true: set shahs.order_auto to 'on' around
-- the update, as kitchen_set_status() does.
create or replace function public.log_order_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, event, by)
    values (new.id, 'created', v_by);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events (order_id, event, by, auto)
    values (new.id, new.status, v_by, coalesce(current_setting('shahs.order_auto', true), '') = 'on');
  end if;

  if old.paid_at is null and new.paid_at is not null then
    insert into public.order_events (order_id, event, by) values (new.id, 'paid', v_by);
  elsif old.paid_at is not null and new.paid_at is null then
    insert into public.order_events (order_id, event, by) values (new.id, 'unpaid', v_by);
  end if;

  return null;
end;
$$;

revoke all on function public.log_order_events() from public, anon, authenticated;

alter table public.orders drop column if exists kept_at;

create or replace function public.order_check_status(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_value is null
     or jsonb_typeof(p_value) <> 'string'
     or (p_value #>> '{}') not in ('cooking', 'packing', 'ready', 'delivered', 'cancelled') then
    raise exception using message = 'Unknown status.', errcode = '22023';
  end if;

  return p_value #>> '{}';
end;
$$;

revoke all on function public.order_check_status(jsonb) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Samples, line weights, free sample orders
-- ═══════════════════════════════════════════════════════

-- '250 g' is 250, '1 kg' is 1000, anything else (a sample) is null.
create or replace function public.order_size_grams(p_size text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_size ~ '^[0-9]{1,5} ?(g|kg)$' then
      (substring(p_size from '^([0-9]+)'))::integer * case when p_size ~ 'kg$' then 1000 else 1 end
  end;
$$;

revoke all on function public.order_size_grams(text) from public, anon, authenticated;

-- How a size reads in totals: 'sample', or '<n> g' / '<n> kg' by weight, so
-- '250g' and '250 g' are one size.
create or replace function public.order_size_label(p_size text, p_grams_each integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_size = 'sample' then 'sample'
    when p_grams_each >= 1000 and p_grams_each % 1000 = 0 then (p_grams_each / 1000) || ' kg'
    else p_grams_each || ' g'
  end;
$$;

revoke all on function public.order_size_label(text, integer) from public, anon, authenticated;

alter table public.order_lines drop constraint if exists order_lines_size_check;
alter table public.order_lines add constraint order_lines_size_check
  check (size ~ '^[0-9]{1,5} ?(g|kg)$' or size = 'sample');

alter table public.order_lines add column if not exists grams_each integer;
update public.order_lines set grams_each = public.order_size_grams(size) where grams_each is null;
alter table public.order_lines
  alter column grams_each set not null,
  add constraint order_lines_grams_each_check check (grams_each >= 0);

-- Every line of the order is a sample. Set by save_admin_order().
-- priority: fills before the others (see kitchen_fill()). Harmless once the
-- order has left Cooking.
alter table public.orders
  add column if not exists priority boolean not null default false,
  add column if not exists free_sample boolean not null default false,
  add constraint orders_free_sample_no_money
    check (not free_sample or (amount is null and coupon_code is null));

-- The checks above, with the admin's words, before the constraint fires.
create or replace function public.check_free_sample_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.free_sample then
    if new.amount is not null then
      raise exception using message = 'A free sample order has no total.', errcode = '22023';
    end if;
    if new.coupon_code is not null then
      raise exception using message = 'A free sample order has no coupon.', errcode = '22023';
    end if;
    if tg_op = 'UPDATE' and not old.free_sample
       and exists (select 1 from public.order_payments p where p.order_id = new.id) then
      raise exception using
        message = 'This order has payments, so it can''t be only samples. Remove the payments first.',
        errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.check_free_sample_order() from public, anon, authenticated;

drop trigger if exists trg_orders_free_sample on public.orders;
create trigger trg_orders_free_sample
  before insert or update on public.orders
  for each row execute function public.check_free_sample_order();

-- Every payment path (Mark paid, part payment, paid: true, Undo) inserts a
-- payment, so one trigger refuses them all on a free sample order.
create or replace function public.refuse_free_sample_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.orders o where o.id = new.order_id and o.free_sample) then
    raise exception using message = 'A free sample order has nothing to pay.', errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.refuse_free_sample_payment() from public, anon, authenticated;

drop trigger if exists trg_order_payments_free_sample on public.order_payments;
create trigger trg_order_payments_free_sample
  before insert on public.order_payments
  for each row execute function public.refuse_free_sample_payment();

-- Checks the lines' shape and returns them merged and sorted, as before.
-- p_samples lets 'sample' through as a size (the admin); the site sends false.
drop function if exists public.order_clean_lines(jsonb, integer);

create or replace function public.order_clean_lines(
  p_lines jsonb,
  p_max_quantity integer,
  p_samples boolean default false
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_line jsonb;
  v_quantity integer;
  v_result jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using message = 'Add at least one item.', errcode = '22023';
  end if;

  if jsonb_array_length(p_lines) > 20 then
    raise exception using message = 'Keep it to 20 items or fewer.', errcode = '22023';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object'
       or jsonb_typeof(v_line -> 'product_id') is distinct from 'string'
       or jsonb_typeof(v_line -> 'size') is distinct from 'string'
       or jsonb_typeof(v_line -> 'quantity') is distinct from 'number'
       or (v_line ->> 'product_id') !~ '^[a-z0-9][a-z0-9-]{0,39}$'
       or not (
         (v_line ->> 'size') ~ '^[0-9]{1,5} ?(g|kg)$'
         or (coalesce(p_samples, false) and (v_line ->> 'size') = 'sample')
       )
       or (v_line ->> 'quantity') !~ '^[0-9]{1,3}$' then
      raise exception using message = 'One of the items doesn''t look right.', errcode = '22023';
    end if;

    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity < 1 or v_quantity > p_max_quantity then
      raise exception using
        message = format('Each item''s quantity is 1 to %s.', p_max_quantity),
        errcode = '22023';
    end if;
  end loop;

  select jsonb_agg(
    jsonb_build_object('product_id', merged.product_id, 'size', merged.size, 'quantity', merged.quantity)
    order by merged.product_id collate "C", merged.size collate "C"
  ) into v_result
  from (
    select
      line ->> 'product_id' as product_id,
      line ->> 'size' as size,
      least(sum((line ->> 'quantity')::integer), p_max_quantity)::integer as quantity
    from jsonb_array_elements(p_lines) line
    group by 1, 2
  ) merged;

  return v_result;
end;
$$;

revoke all on function public.order_clean_lines(jsonb, integer, boolean) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. Kitchen tables
-- ═══════════════════════════════════════════════════════

create table if not exists public.kitchen_products (
  product_id text primary key check (product_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  -- Grams in one free sample. A line snapshots it when it's saved.
  sample_grams integer not null check (sample_grams between 1 and 500),
  -- "6 months" is calendar months. Both null: no shelf life, never expires.
  shelf_life_amount integer,
  shelf_life_unit text check (shelf_life_unit in ('days', 'months')),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id) on delete set null,
  constraint kitchen_products_shelf_life_check check (
    (shelf_life_amount is null and shelf_life_unit is null)
    or (shelf_life_unit = 'days' and shelf_life_amount between 1 and 365)
    or (shelf_life_unit = 'months' and shelf_life_amount between 1 and 24)
  )
);

create table if not exists public.kitchen_batches (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.kitchen_products(product_id),
  grams integer not null check (grams between 1 and 50000),
  -- India date. Not in the future, not more than 60 days back (the RPCs check).
  made_on date not null,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists kitchen_batches_product_idx
  on public.kitchen_batches (product_id, made_on, created_at, id);

-- Grams of one product given to one order, from one batch (null: by hand).
create table if not exists public.kitchen_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null check (product_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  batch_id uuid references public.kitchen_batches(id),
  grams integer not null check (grams > 0),
  created_at timestamptz not null default timezone('utc', now()),
  constraint kitchen_allocations_one_row
    unique nulls not distinct (order_id, product_id, batch_id)
);

create index if not exists kitchen_allocations_batch_idx
  on public.kitchen_allocations (batch_id) where batch_id is not null;

create table if not exists public.kitchen_writeoffs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.kitchen_batches(id),
  grams integer not null check (grams > 0),
  reason text not null check (reason in ('used_up', 'thrown_out')),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists kitchen_writeoffs_batch_idx
  on public.kitchen_writeoffs (batch_id);

-- The undo log. One action per kitchen call, one step per row change.
create table if not exists public.kitchen_actions (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null
);

create index if not exists kitchen_actions_created_at_idx
  on public.kitchen_actions (created_at);

create table if not exists public.kitchen_action_steps (
  action_id uuid not null references public.kitchen_actions(id) on delete cascade,
  seq integer not null,
  tbl text not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  old jsonb,
  new jsonb,
  primary key (action_id, seq)
);

alter table public.kitchen_products enable row level security;
alter table public.kitchen_batches enable row level security;
alter table public.kitchen_allocations enable row level security;
alter table public.kitchen_writeoffs enable row level security;
alter table public.kitchen_actions enable row level security;
alter table public.kitchen_action_steps enable row level security;

-- No policies: the only ways in are the security definer functions below.
revoke all on public.kitchen_products from anon, authenticated;
revoke all on public.kitchen_batches from anon, authenticated;
revoke all on public.kitchen_allocations from anon, authenticated;
revoke all on public.kitchen_writeoffs from anon, authenticated;
revoke all on public.kitchen_actions from anon, authenticated;
revoke all on public.kitchen_action_steps from anon, authenticated;

-- Starting values (agreed 2026-09-29). Changed on the Products page.
insert into public.kitchen_products (product_id, sample_grams, shelf_life_amount, shelf_life_unit) values
  ('raggi-jaggi', 20, 6, 'months'),
  ('muesli', 20, 6, 'months'),
  ('bites', 15, 15, 'days')
on conflict (product_id) do nothing;

-- A line's weight: from the size, or the product's sample weight now. A line
-- that arrives with grams_each (a sample kept by an edit) keeps it.
create or replace function public.set_order_line_grams()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.size = 'sample' then
    if new.grams_each is null then
      select k.sample_grams into new.grams_each
      from public.kitchen_products k where k.product_id = new.product_id;

      if new.grams_each is null then
        raise exception using
          message = 'That product has no sample weight yet. Set one on the Products page.',
          errcode = '22023';
      end if;
    end if;
  else
    new.grams_each := public.order_size_grams(new.size);
  end if;
  return new;
end;
$$;

revoke all on function public.set_order_line_grams() from public, anon, authenticated;

drop trigger if exists trg_order_lines_grams on public.order_lines;
create trigger trg_order_lines_grams
  before insert on public.order_lines
  for each row execute function public.set_order_line_grams();

-- Safety net: a batch never gives out more than it holds, and a batch's
-- grams only go to its own product. Deferred, so a call can pass through a
-- middle state; the functions check first and say it plainly.
-- security definer: a deferred trigger runs at commit, after the RPC has
-- returned, as the caller's own role (anon on the site, authenticated in the
-- admin), which can't read the kitchen tables.
create or replace function public.kitchen_check_batch_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
begin
  if tg_table_name = 'kitchen_batches' then
    v_batch := new.id;
  else
    v_batch := new.batch_id;
  end if;

  if v_batch is null then
    return null;
  end if;

  -- Nested, not "and": plpgsql resolves new.product_id even when the first
  -- half is false, and a write-off row has no product_id.
  if tg_table_name = 'kitchen_allocations' then
    if exists (
      select 1 from public.kitchen_batches b where b.id = v_batch and b.product_id <> new.product_id
    ) then
      raise exception using message = 'A batch only fills its own product.', errcode = '23514';
    end if;
  end if;

  if exists (
    select 1 from public.kitchen_batches b
    where b.id = v_batch
      and b.grams < coalesce((select sum(a.grams) from public.kitchen_allocations a where a.batch_id = b.id), 0)
                  + coalesce((select sum(w.grams) from public.kitchen_writeoffs w where w.batch_id = b.id), 0)
  ) then
    raise exception using message = 'A batch can''t give out more than it holds.', errcode = '23514';
  end if;

  return null;
end;
$$;

revoke all on function public.kitchen_check_batch_room() from public, anon, authenticated;

drop trigger if exists trg_kitchen_allocations_room on public.kitchen_allocations;
create constraint trigger trg_kitchen_allocations_room
  after insert or update on public.kitchen_allocations
  deferrable initially deferred
  for each row execute function public.kitchen_check_batch_room();

drop trigger if exists trg_kitchen_writeoffs_room on public.kitchen_writeoffs;
create constraint trigger trg_kitchen_writeoffs_room
  after insert or update on public.kitchen_writeoffs
  deferrable initially deferred
  for each row execute function public.kitchen_check_batch_room();

drop trigger if exists trg_kitchen_batches_room on public.kitchen_batches;
create constraint trigger trg_kitchen_batches_room
  after insert or update on public.kitchen_batches
  deferrable initially deferred
  for each row execute function public.kitchen_check_batch_room();

-- ═══════════════════════════════════════════════════════
-- 4. The undo log: triggers record each row change
-- ═══════════════════════════════════════════════════════

-- Records one step under the open action (shahs.kitchen_action), if any.
-- Orders record only their id, status and priority.
create or replace function public.kitchen_log_step()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_action uuid := nullif(current_setting('shahs.kitchen_action', true), '')::uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if v_action is null then
    return null;
  end if;

  if tg_table_name = 'orders' then
    v_old := jsonb_build_object('id', old.id, 'status', old.status, 'priority', old.priority);
    v_new := jsonb_build_object('id', new.id, 'status', new.status, 'priority', new.priority);
  else
    if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  end if;

  insert into public.kitchen_action_steps (action_id, seq, tbl, op, old, new)
  values (
    v_action,
    coalesce((select max(s.seq) from public.kitchen_action_steps s where s.action_id = v_action), 0) + 1,
    tg_table_name, lower(tg_op), v_old, v_new
  );

  return null;
end;
$$;

revoke all on function public.kitchen_log_step() from public, anon, authenticated;

drop trigger if exists trg_kitchen_allocations_log on public.kitchen_allocations;
create trigger trg_kitchen_allocations_log
  after insert or update or delete on public.kitchen_allocations
  for each row execute function public.kitchen_log_step();

drop trigger if exists trg_kitchen_batches_log on public.kitchen_batches;
create trigger trg_kitchen_batches_log
  after insert or update or delete on public.kitchen_batches
  for each row execute function public.kitchen_log_step();

drop trigger if exists trg_kitchen_writeoffs_log on public.kitchen_writeoffs;
create trigger trg_kitchen_writeoffs_log
  after insert or update or delete on public.kitchen_writeoffs
  for each row execute function public.kitchen_log_step();

drop trigger if exists trg_orders_kitchen_log on public.orders;
create trigger trg_orders_kitchen_log
  after update of status, priority on public.orders
  for each row
  when (old.status is distinct from new.status or old.priority is distinct from new.priority)
  execute function public.kitchen_log_step();

-- Opens an action and returns its id. Old actions (over 7 days) go first.
create or replace function public.kitchen_action_start(p_kind text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  delete from public.kitchen_actions where created_at < timezone('utc', now()) - interval '7 days';

  insert into public.kitchen_actions (kind, created_by)
  values (p_kind, auth.uid())
  returning id into v_id;

  perform set_config('shahs.kitchen_action', v_id::text, true);
  return v_id;
end;
$$;

revoke all on function public.kitchen_action_start(text) from public, anon, authenticated;

-- Closes the action. One that recorded nothing is deleted. True when it has
-- steps (so its id is worth returning for Undo).
create or replace function public.kitchen_action_finish(p_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  perform set_config('shahs.kitchen_action', '', true);

  if exists (select 1 from public.kitchen_action_steps s where s.action_id = p_id) then
    return true;
  end if;

  delete from public.kitchen_actions where id = p_id;
  return false;
end;
$$;

revoke all on function public.kitchen_action_finish(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 5. The rules (internal)
-- ═══════════════════════════════════════════════════════

create or replace function public.kitchen_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Kolkata')::date;
$$;

revoke all on function public.kitchen_today() from public, anon, authenticated;

-- One advisory lock per kitchen product, every product, in sorted order.
-- Taken before any order row is locked.
create or replace function public.kitchen_lock()
returns void
language plpgsql
set search_path = public
as $$
declare
  v_product text;
begin
  for v_product in
    select k.product_id from public.kitchen_products k order by k.product_id collate "C"
  loop
    perform pg_advisory_xact_lock(hashtext('kitchen:' || v_product));
  end loop;
end;
$$;

revoke all on function public.kitchen_lock() from public, anon, authenticated;

create or replace function public.kitchen_expires_on(p_made_on date, p_amount integer, p_unit text)
returns date
language sql
immutable
set search_path = public
as $$
  select case
    when p_amount is null then null
    when p_unit = 'days' then p_made_on + p_amount
    else (p_made_on + make_interval(months => p_amount))::date
  end;
$$;

revoke all on function public.kitchen_expires_on(date, integer, text) from public, anon, authenticated;

-- Past from the expiry date. Near when a fifth of the shelf life or less is
-- left (at least 2 days): Date Bites 3 days, 6 months about 5 weeks.
create or replace function public.kitchen_batch_state(p_made_on date, p_expires_on date, p_today date)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_expires_on is null then 'fresh'
    when p_today >= p_expires_on then 'past'
    when p_expires_on - p_today <= greatest(2, (p_expires_on - p_made_on) / 5) then 'near'
    else 'fresh'
  end;
$$;

revoke all on function public.kitchen_batch_state(date, date, date) from public, anon, authenticated;

-- Every batch (or one product's) with what it gave, what's written off, its
-- spare and its shelf life. usable: not past its shelf life.
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
  cross join lateral (
    select public.kitchen_expires_on(b.made_on, p.shelf_life_amount, p.shelf_life_unit) as expires_on
  ) e
  where p_product_id is null or b.product_id = p_product_id;
$$;

revoke all on function public.kitchen_batch_rows(text) from public, anon, authenticated;

-- Per product of one order: grams it needs, grams covered (batch and by
-- hand) and the by-hand part.
create or replace function public.kitchen_order_cover(p_order_id uuid)
returns table (product_id text, need integer, covered integer, by_hand integer)
language sql
stable
set search_path = public
as $$
  select p.product_id,
    coalesce((
      select sum(l.quantity * l.grams_each) from public.order_lines l
      where l.order_id = p_order_id and l.product_id = p.product_id
    ), 0)::integer,
    coalesce((
      select sum(a.grams) from public.kitchen_allocations a
      where a.order_id = p_order_id and a.product_id = p.product_id
    ), 0)::integer,
    coalesce((
      select sum(a.grams) from public.kitchen_allocations a
      where a.order_id = p_order_id and a.product_id = p.product_id and a.batch_id is null
    ), 0)::integer
  from (
    select l.product_id from public.order_lines l where l.order_id = p_order_id
    union
    select a.product_id from public.kitchen_allocations a where a.order_id = p_order_id
  ) p;
$$;

revoke all on function public.kitchen_order_cover(uuid) from public, anon, authenticated;

create or replace function public.kitchen_short(p_order_id uuid, p_product_id text)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((
    select greatest(c.need - c.covered, 0)
    from public.kitchen_order_cover(p_order_id) c
    where c.product_id = p_product_id
  ), 0);
$$;

revoke all on function public.kitchen_short(uuid, text) from public, anon, authenticated;

-- Adds grams to an order from a batch (null: by hand).
create or replace function public.kitchen_give(p_order_id uuid, p_product_id text, p_batch_id uuid, p_grams integer)
returns void
language plpgsql
set search_path = public
as $$
begin
  if coalesce(p_grams, 0) <= 0 then
    return;
  end if;

  insert into public.kitchen_allocations (order_id, product_id, batch_id, grams)
  values (p_order_id, p_product_id, p_batch_id, p_grams)
  on conflict (order_id, product_id, batch_id)
  do update set grams = public.kitchen_allocations.grams + excluded.grams;
end;
$$;

revoke all on function public.kitchen_give(uuid, text, uuid, integer) from public, anon, authenticated;

-- Takes grams off one allocation row; the row goes when it reaches zero.
create or replace function public.kitchen_take(p_allocation_id uuid, p_grams integer)
returns void
language plpgsql
set search_path = public
as $$
begin
  if coalesce(p_grams, 0) <= 0 then
    return;
  end if;

  delete from public.kitchen_allocations where id = p_allocation_id and grams <= p_grams;
  if not found then
    update public.kitchen_allocations set grams = grams - p_grams where id = p_allocation_id;
  end if;
end;
$$;

revoke all on function public.kitchen_take(uuid, integer) from public, anon, authenticated;

-- A status change made by the rules, logged as auto in the history.
create or replace function public.kitchen_set_status(p_order_id uuid, p_status text, p_auto boolean)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('shahs.order_auto', case when p_auto then 'on' else '' end, true);
  update public.orders set status = p_status where id = p_order_id and status <> p_status;
  perform set_config('shahs.order_auto', '', true);
end;
$$;

revoke all on function public.kitchen_set_status(uuid, text, boolean) from public, anon, authenticated;

-- Cooking orders (one, or all with that product) covered on every product
-- move to Packing.
create or replace function public.kitchen_promote(p_product_id text default null, p_order_id uuid default null)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in
    select o.id
    from public.orders o
    where o.status = 'cooking'
      and (p_order_id is null or o.id = p_order_id)
      and (p_product_id is null or exists (
        select 1 from public.order_lines l where l.order_id = o.id and l.product_id = p_product_id
      ))
      and exists (select 1 from public.order_lines l where l.order_id = o.id)
      and not exists (
        select 1 from public.kitchen_order_cover(o.id) c where c.covered < c.need
      )
    order by o.priority desc, o.created_at, o.id
    for update of o
  loop
    perform public.kitchen_set_status(v_id, 'packing', true);
  end loop;
end;
$$;

revoke all on function public.kitchen_promote(text, uuid) from public, anon, authenticated;

-- Tops one order up from usable spare, oldest batch first. Returns what's
-- still short.
create or replace function public.kitchen_top_up(p_order_id uuid, p_product_id text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_short integer := public.kitchen_short(p_order_id, p_product_id);
  v_batch record;
  v_take integer;
begin
  if v_short <= 0 then
    return 0;
  end if;

  for v_batch in
    select r.batch_id, r.spare
    from public.kitchen_batch_rows(p_product_id) r
    where r.usable and r.spare > 0
    order by r.made_on, r.created_at, r.batch_id
  loop
    v_take := least(v_short, v_batch.spare);
    perform public.kitchen_give(p_order_id, p_product_id, v_batch.batch_id, v_take);
    v_short := v_short - v_take;
    exit when v_short = 0;
  end loop;

  return v_short;
end;
$$;

revoke all on function public.kitchen_top_up(uuid, text) from public, anon, authenticated;

-- Moves p_grams of one product from one order to another, keeping each
-- gram's batch (so its made-on day goes with it): batch grams first, oldest
-- made first, then by-hand grams (unless p_batch_only). Returns grams moved.
create or replace function public.kitchen_move_grams(
  p_from uuid, p_to uuid, p_product_id text, p_grams integer, p_batch_only boolean default false
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_left integer := p_grams;
  v_row record;
  v_take integer;
begin
  for v_row in
    select a.id, a.batch_id, a.grams
    from public.kitchen_allocations a
    left join public.kitchen_batches b on b.id = a.batch_id
    where a.order_id = p_from and a.product_id = p_product_id
      and (not p_batch_only or a.batch_id is not null)
    order by (a.batch_id is null), b.made_on, b.created_at, b.id
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_row.grams);
    perform public.kitchen_take(v_row.id, v_take);
    perform public.kitchen_give(p_to, p_product_id, v_row.batch_id, v_take);
    v_left := v_left - v_take;
  end loop;
  return p_grams - v_left;
end;
$$;

revoke all on function public.kitchen_move_grams(uuid, uuid, text, integer, boolean) from public, anon, authenticated;

-- The one fill rule, for one product: short Cooking orders, priority ones
-- first, oldest first within each, take usable spare, oldest batch first.
-- Then a priority order still short takes food from non-priority Cooking
-- orders, newest first (they wait for the next batch instead). Then covered
-- orders go to Packing.
create or replace function public.kitchen_fill(p_product_id text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_short integer;
  v_donor uuid;
begin
  for v_id in
    select o.id
    from public.orders o
    where o.status = 'cooking'
      and exists (
        select 1 from public.order_lines l where l.order_id = o.id and l.product_id = p_product_id
      )
    order by o.priority desc, o.created_at, o.id
    for update of o
  loop
    exit when not exists (
      select 1 from public.kitchen_batch_rows(p_product_id) r where r.usable and r.spare > 0
    );
    perform public.kitchen_top_up(v_id, p_product_id);
  end loop;

  for v_id in
    select o.id
    from public.orders o
    where o.status = 'cooking' and o.priority
      and exists (
        select 1 from public.order_lines l where l.order_id = o.id and l.product_id = p_product_id
      )
    order by o.created_at, o.id
  loop
    v_short := public.kitchen_short(v_id, p_product_id);
    continue when v_short = 0;

    for v_donor in
      select d.id
      from public.orders d
      where d.status = 'cooking' and not d.priority
        and exists (
          select 1 from public.kitchen_allocations a
          where a.order_id = d.id and a.product_id = p_product_id and a.batch_id is not null
        )
      order by d.created_at desc, d.id desc
      for update of d
    loop
      v_short := v_short - public.kitchen_move_grams(v_donor, v_id, p_product_id, v_short, true);
      exit when v_short = 0;
    end loop;
  end loop;

  perform public.kitchen_promote(p_product_id);
end;
$$;

revoke all on function public.kitchen_fill(text) from public, anon, authenticated;

create or replace function public.kitchen_fill_all(p_products text[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_product text;
begin
  for v_product in
    select distinct p from unnest(p_products) p where p is not null order by 1
  loop
    perform public.kitchen_fill(v_product);
  end loop;
end;
$$;

revoke all on function public.kitchen_fill_all(text[]) from public, anon, authenticated;

create or replace function public.kitchen_order_products(p_order_id uuid)
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct x.product_id), '{}')
  from (
    select l.product_id from public.order_lines l where l.order_id = p_order_id
    union
    select a.product_id from public.kitchen_allocations a where a.order_id = p_order_id
  ) x;
$$;

revoke all on function public.kitchen_order_products(uuid) from public, anon, authenticated;

-- Covers whatever an order is short "by hand". Never takes spare.
create or replace function public.kitchen_cover_by_hand(p_order_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_cover record;
begin
  for v_cover in
    select c.product_id, c.need - c.covered as short
    from public.kitchen_order_cover(p_order_id) c
    where c.covered < c.need
  loop
    perform public.kitchen_give(p_order_id, v_cover.product_id, null, v_cover.short);
  end loop;
end;
$$;

revoke all on function public.kitchen_cover_by_hand(uuid) from public, anon, authenticated;

-- Takes grams off one order's product: by hand first, then the newest batch
-- grams (unless p_by_hand_only).
create or replace function public.kitchen_trim(
  p_order_id uuid, p_product_id text, p_grams integer, p_by_hand_only boolean default false
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_left integer := p_grams;
  v_row record;
  v_take integer;
begin
  for v_row in
    select a.id, a.grams
    from public.kitchen_allocations a
    left join public.kitchen_batches b on b.id = a.batch_id
    where a.order_id = p_order_id and a.product_id = p_product_id
      and (not p_by_hand_only or a.batch_id is null)
    order by (a.batch_id is not null), b.made_on desc, b.created_at desc, b.id desc
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_row.grams);
    perform public.kitchen_take(v_row.id, v_take);
    v_left := v_left - v_take;
  end loop;
end;
$$;

revoke all on function public.kitchen_trim(uuid, text, integer, boolean) from public, anon, authenticated;

-- A batch shrank (or went): takes p_grams back from its orders, the
-- reverse of the fill: normal orders before priority ones, youngest first. Cooking/Packing orders lose them (a Packing order goes back to
-- Cooking). Ready and Delivered orders are packed, so they keep the grams as
-- "by hand". The caller runs the fill after.
create or replace function public.kitchen_take_back(p_batch_id uuid, p_grams integer)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_left integer := p_grams;
  v_product text;
  v_row record;
  v_take integer;
begin
  if coalesce(v_left, 0) <= 0 then
    return;
  end if;

  select b.product_id into v_product from public.kitchen_batches b where b.id = p_batch_id;

  for v_row in
    select a.id, a.order_id, a.grams, o.status
    from public.kitchen_allocations a
    join public.orders o on o.id = a.order_id
    where a.batch_id = p_batch_id
    order by o.priority, o.created_at desc, o.id desc
    for update of a, o
  loop
    v_take := least(v_left, v_row.grams);
    perform public.kitchen_take(v_row.id, v_take);

    if v_row.status in ('ready', 'delivered', 'cancelled') then
      perform public.kitchen_give(v_row.order_id, v_product, null, v_take);
    elsif v_row.status = 'packing' then
      perform public.kitchen_set_status(v_row.order_id, 'cooking', true);
    end if;

    v_left := v_left - v_take;
    exit when v_left = 0;
  end loop;
end;
$$;

revoke all on function public.kitchen_take_back(uuid, integer) from public, anon, authenticated;

-- What a status change does to the kitchen. The order's status is already
-- p_to; the caller holds the kitchen lock and the order row.
--   → cancelled from Cooking/Packing/Ready: batch grams back to spare (with
--     their made-on date), by-hand rows go, the fill runs. From Delivered:
--     nothing (the food left).
--   → cooking from Packing/Ready/Delivered: the by-hand part goes, batch
--     grams stay, the fill runs. Refused when batch grams cover it all.
--   → packing/ready/delivered from Cooking (or Cancelled): the short part is
--     covered by hand. Never takes spare.
create or replace function public.kitchen_order_moved(p_order_id uuid, p_from text, p_to text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_products text[];
begin
  if p_from = p_to then
    return;
  end if;

  if p_to = 'cancelled' then
    if p_from <> 'delivered' then
      v_products := public.kitchen_order_products(p_order_id);
      delete from public.kitchen_allocations where order_id = p_order_id;
      perform public.kitchen_fill_all(v_products);
    end if;
  elsif p_to = 'cooking' then
    if p_from in ('packing', 'ready', 'delivered')
       and exists (select 1 from public.order_lines l where l.order_id = p_order_id)
       and not exists (
         select 1 from public.kitchen_order_cover(p_order_id) c where c.covered - c.by_hand < c.need
       ) then
      raise exception using message = 'Its food is already logged. Undo, or fix the batch.', errcode = '22023';
    end if;

    delete from public.kitchen_allocations where order_id = p_order_id and batch_id is null;
    perform public.kitchen_fill_all(public.kitchen_order_products(p_order_id));
  elsif p_from in ('cooking', 'cancelled') then
    perform public.kitchen_cover_by_hand(p_order_id);
  end if;
end;
$$;

revoke all on function public.kitchen_order_moved(uuid, text, text) from public, anon, authenticated;

-- After an edit replaced an order's lines, per product:
--   need went down: the extra goes back, by hand first, then the newest batch
--     grams, and the fill runs (the grams may go to the next order).
--   need went up: top up from spare; still short → back to Cooking, waiting
--     only for the missing grams.
--   Delivered (or cancelled after delivery): just the by-hand part moves.
-- A cancelled order with nothing given is left alone.
create or replace function public.kitchen_order_rebalance(p_order_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_done boolean;
  v_cover record;
  v_release text[] := '{}';
  v_back boolean := false;
begin
  select o.status into v_status from public.orders o where o.id = p_order_id;

  if v_status = 'cancelled' and not exists (
    select 1 from public.kitchen_allocations a where a.order_id = p_order_id
  ) then
    return;
  end if;

  v_done := v_status in ('delivered', 'cancelled');

  for v_cover in
    select c.* from public.kitchen_order_cover(p_order_id) c order by c.product_id
  loop
    if v_cover.covered > v_cover.need then
      if v_done then
        perform public.kitchen_trim(p_order_id, v_cover.product_id,
          least(v_cover.by_hand, v_cover.covered - v_cover.need), true);
      else
        perform public.kitchen_trim(p_order_id, v_cover.product_id, v_cover.covered - v_cover.need);
        v_release := v_release || v_cover.product_id;
      end if;
    elsif v_cover.covered < v_cover.need then
      if v_done then
        perform public.kitchen_give(p_order_id, v_cover.product_id, null, v_cover.need - v_cover.covered);
      elsif public.kitchen_top_up(p_order_id, v_cover.product_id) > 0 and v_status <> 'cooking' then
        v_back := true;
      end if;
    end if;
  end loop;

  if v_back then
    perform public.kitchen_set_status(p_order_id, 'cooking', true);
  end if;

  perform public.kitchen_fill_all(v_release);
  perform public.kitchen_promote(null, p_order_id);
end;
$$;

revoke all on function public.kitchen_order_rebalance(uuid) from public, anon, authenticated;

-- Only the cook marks spare used up or thrown out. With nobody set as cook,
-- any admin can.
create or replace function public.kitchen_can_write_off()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.admin_users a where a.id = auth.uid() and a.home_view = 'cook')
    or not exists (select 1 from public.admin_users a where a.home_view = 'cook');
$$;

revoke all on function public.kitchen_can_write_off() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 6. What the kitchen looks like, and what a call did
-- ═══════════════════════════════════════════════════════

-- The get_admin_kitchen() object. get_admin_totals() embeds it, and every
-- kitchen call returns it in its effects.
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
    select r.* from public.kitchen_batch_rows(null) r
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
                'batch_id', b.batch_id, 'made_on', b.made_on, 'grams', b.spare,
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
          'id', b.batch_id, 'product_id', b.product_id, 'grams', b.grams, 'made_on', b.made_on,
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

-- What one action did, from its steps:
--   batches  every batch it touched, as it is now (deleted: true and zeros if
--            it's gone)
--   orders   every order whose status or batch grams changed: from/to status,
--            the net batch grams per product (change), and what a Cooking
--            order still waits for. By-hand rows aren't food, so they show
--            only through the status.
--   kitchen  kitchen_state_json() after it.
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
        'made_on', coalesce(r.made_on, (gone.old ->> 'made_on')::date),
        'to_orders', coalesce(r.to_orders, 0),
        'spare', coalesce(r.spare, 0),
        'written_off', coalesce(r.written_off, 0),
        'deleted', r.batch_id is null
      ) as j
    from batch_ids i
    left join public.kitchen_batch_rows(null) r on r.batch_id = i.id
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

-- ═══════════════════════════════════════════════════════
-- 7. Undo: replay the steps backwards
-- ═══════════════════════════════════════════════════════

-- Reverses one step if its row is still exactly as the step left it (the
-- columns that matter). False means something moved since.
create or replace function public.kitchen_undo_step(p_step public.kitchen_action_steps)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_old jsonb := p_step.old;
  v_new jsonb := p_step.new;
  v_id uuid := (coalesce(p_step.new, p_step.old) ->> 'id')::uuid;
begin
  if p_step.tbl = 'orders' then
    update public.orders
    set status = v_old ->> 'status', priority = (v_old ->> 'priority')::boolean
    where id = v_id and status = v_new ->> 'status' and priority = (v_new ->> 'priority')::boolean;
    return found;
  end if;

  if p_step.tbl = 'kitchen_allocations' then
    if p_step.op = 'insert' then
      delete from public.kitchen_allocations where id = v_id and grams = (v_new ->> 'grams')::integer;
      return found;
    elsif p_step.op = 'update' then
      update public.kitchen_allocations set grams = (v_old ->> 'grams')::integer
      where id = v_id and grams = (v_new ->> 'grams')::integer;
      return found;
    end if;

    if exists (
      select 1 from public.kitchen_allocations a
      where a.id = v_id
         or (a.order_id, a.product_id, a.batch_id) is not distinct from
            ((v_old ->> 'order_id')::uuid, v_old ->> 'product_id', (v_old ->> 'batch_id')::uuid)
    )
    or not exists (select 1 from public.orders o where o.id = (v_old ->> 'order_id')::uuid)
    or (v_old ->> 'batch_id' is not null and not exists (
      select 1 from public.kitchen_batches b where b.id = (v_old ->> 'batch_id')::uuid
    )) then
      return false;
    end if;

    insert into public.kitchen_allocations
    select (jsonb_populate_record(null::public.kitchen_allocations, v_old)).*;
    return true;
  end if;

  if p_step.tbl = 'kitchen_batches' then
    if p_step.op = 'insert' then
      if exists (select 1 from public.kitchen_allocations a where a.batch_id = v_id)
         or exists (select 1 from public.kitchen_writeoffs w where w.batch_id = v_id) then
        return false;
      end if;
      delete from public.kitchen_batches
      where id = v_id and grams = (v_new ->> 'grams')::integer and made_on = (v_new ->> 'made_on')::date;
      return found;
    elsif p_step.op = 'update' then
      update public.kitchen_batches
      set grams = (v_old ->> 'grams')::integer,
        made_on = (v_old ->> 'made_on')::date,
        updated_at = (v_old ->> 'updated_at')::timestamptz,
        updated_by = (v_old ->> 'updated_by')::uuid
      where id = v_id and grams = (v_new ->> 'grams')::integer and made_on = (v_new ->> 'made_on')::date;
      return found;
    end if;

    if exists (select 1 from public.kitchen_batches b where b.id = v_id) then
      return false;
    end if;
    insert into public.kitchen_batches
    select (jsonb_populate_record(null::public.kitchen_batches, v_old)).*;
    return true;
  end if;

  if p_step.tbl = 'kitchen_writeoffs' then
    if p_step.op = 'insert' then
      delete from public.kitchen_writeoffs where id = v_id and grams = (v_new ->> 'grams')::integer;
      return found;
    elsif p_step.op = 'update' then
      update public.kitchen_writeoffs set grams = (v_old ->> 'grams')::integer
      where id = v_id and grams = (v_new ->> 'grams')::integer;
      return found;
    end if;

    if exists (select 1 from public.kitchen_writeoffs w where w.id = v_id)
       or not exists (select 1 from public.kitchen_batches b where b.id = (v_old ->> 'batch_id')::uuid) then
      return false;
    end if;
    insert into public.kitchen_writeoffs
    select (jsonb_populate_record(null::public.kitchen_writeoffs, v_old)).*;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.kitchen_undo_step(public.kitchen_action_steps) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 8. Order JSON, filters, detail
-- ═══════════════════════════════════════════════════════

-- As in 20260928000000, without kept and stale, plus free_sample, grams_each
-- per line, samples (packs counts the rest), and kitchen: per product what
-- it needs, what's covered (by hand included), the by-hand part, and whether
-- it's waiting (Cooking and short), and the batches its food came from.
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

revoke all on function public.admin_order_json(public.orders) from public, anon, authenticated;

-- The same as 20260926000001 plus auto on each history event.
create or replace function public.get_admin_order(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(regexp_replace(btrim(coalesce(p_code, '')), '^#+', '')));
  v_order public.orders;
  v_history json;
  v_suggestion json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if v_code not like 'SN-%' then
    v_code := 'SN-' || v_code;
  end if;

  select * into v_order from public.orders o where o.code = v_code;
  if v_order.id is null then
    return null;
  end if;

  select coalesce(json_agg(
    json_build_object(
      'event', e.event,
      'at', e.at,
      'by_name', coalesce(a.display_name, a.email),
      -- Moved by the kitchen rules (a batch, spare, an edit), not chosen.
      'auto', e.auto
    )
    order by e.at, e.id
  ), '[]'::json) into v_history
  from public.order_events e
  left join public.admin_users a on a.id = e.by
  where e.order_id = v_order.id;

  if v_order.phone is null and v_order.name is not null and v_order.pincode is not null then
    select json_build_object('phone', o.phone, 'code', o.code, 'created_at', o.created_at)
    into v_suggestion
    from public.orders o
    where o.id <> v_order.id
      and o.phone is not null
      and lower(o.name) = lower(v_order.name)
      and o.pincode = v_order.pincode
    order by o.created_at desc, o.id desc
    limit 1;
  end if;

  return (
    public.admin_order_json(v_order)::jsonb
    || jsonb_build_object('history', v_history, 'phone_suggestion', v_suggestion)
  )::json;
end;
$$;

revoke all on function public.get_admin_order(text) from public, anon;
grant execute on function public.get_admin_order(text) to authenticated;

-- get_admin_orders() gains p_free_sample and p_samples, so both are dropped
-- and made again.
drop function if exists public.get_admin_orders(
  text, text[], boolean, text, text, text, timestamptz, timestamptz, timestamptz, integer, text
);
drop function if exists public.admin_filter_orders(
  text, text[], boolean, text, timestamptz, timestamptz, timestamptz, boolean, text, text, text, text, text
);

-- As in 20260926000006, with the new stages. Done = delivered and (paid in
-- full, or a free sample order), or cancelled. p_free_sample: true keeps only
-- free sample orders, false leaves them out, null doesn't filter. p_samples:
-- true keeps orders carrying at least one sample (free sample orders and
-- paid orders with a free taster: the Free samples list), false keeps orders
-- with none, null doesn't filter.
create function public.admin_filter_orders(
  p_view text,
  p_status text[],
  p_paid boolean,
  p_source text,
  p_from timestamptz,
  p_to timestamptz,
  p_before timestamptz,
  p_phone_given boolean,
  p_phone text,
  p_code_like text,
  p_name_like text,
  p_digits_like text,
  p_product text,
  p_free_sample boolean,
  p_samples boolean
)
returns setof public.orders
language sql
stable
set search_path = public
as $$
  select o.*
  from public.orders o
  where (
      p_view = 'all'
      or (p_view = 'todo' and (
        o.status in ('cooking', 'packing', 'ready')
        or (o.status = 'delivered' and o.paid_at is null and not o.free_sample)
      ))
      or (p_view = 'done' and (
        (o.status = 'delivered' and (o.paid_at is not null or o.free_sample))
        or o.status = 'cancelled'
      ))
    )
    and (p_status is null or o.status = any (p_status))
    and (p_paid is null or (o.paid_at is not null) = p_paid)
    and (p_free_sample is null or o.free_sample = p_free_sample)
    and (p_samples is null or p_samples = exists (
      select 1 from public.order_lines l where l.order_id = o.id and l.size = 'sample'
    ))
    and (p_source is null or o.source = p_source)
    and (p_from is null or o.created_at >= p_from)
    and (p_to is null or o.created_at < p_to)
    and (p_before is null or o.created_at < p_before)
    and (not p_phone_given or o.phone = p_phone)
    and (
      (p_code_like is null and p_name_like is null and p_digits_like is null)
      or o.code like p_code_like
      or o.name ilike p_name_like
      or o.phone like p_digits_like
    )
    and (p_product is null or exists (
      select 1 from public.order_lines l
      where l.order_id = o.id and l.product_id = p_product
    ));
$$;

revoke all on function public.admin_filter_orders(text, text[], boolean, text, timestamptz, timestamptz, timestamptz, boolean, text, text, text, text, text, boolean, boolean)
  from public, anon, authenticated;

create function public.get_admin_orders(
  p_view text default 'todo',
  p_status text[] default null,
  p_paid boolean default null,
  p_search text default null,
  p_phone text default null,
  p_source text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_before timestamptz default null,
  p_limit integer default 50,
  p_product text default null,
  p_free_sample boolean default null,
  p_samples boolean default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_view text := coalesce(p_view, 'todo');
  v_status text[] := nullif(p_status, '{}'::text[]);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_product text := nullif(btrim(p_product), '');
  v_search text;
  v_upper text;
  v_digits text;
  v_code_like text;
  v_name_like text;
  v_digits_like text;
  v_phone_given boolean := nullif(btrim(p_phone), '') is not null;
  v_phone text;
  v_boundary timestamptz;
  v_next_before timestamptz;
  v_orders json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if v_view not in ('todo', 'done', 'all') then
    raise exception using message = 'Unknown view.', errcode = '22023';
  end if;

  if v_status is not null and exists (
    select 1 from unnest(v_status) s
    where s is null or s not in ('cooking', 'packing', 'ready', 'delivered', 'cancelled')
  ) then
    raise exception using message = 'Unknown status.', errcode = '22023';
  end if;

  if p_source is not null and p_source not in ('site', 'whatsapp', 'call', 'instagram', 'in_person') then
    raise exception using message = 'Unknown source.', errcode = '22023';
  end if;

  if v_phone_given then
    v_phone := public.order_try_normalize_phone(p_phone);
  end if;

  v_search := btrim(regexp_replace(btrim(coalesce(p_search, '')), '^#+', ''));
  if v_search <> '' then
    v_upper := upper(v_search);
    if v_upper ~ '^[A-Z0-9-]+$' then
      v_code_like := case when v_upper like 'SN-%' then v_upper else 'SN-' || v_upper end || '%';
    end if;

    v_name_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';

    v_digits := regexp_replace(v_search, '[^0-9]', '', 'g');
    if char_length(v_digits) >= 4 then
      v_digits_like := '%' || v_digits || '%';
    end if;
  end if;

  select f.created_at into v_boundary
  from public.admin_filter_orders(
    v_view, v_status, p_paid, p_source, p_from, p_to, p_before,
    v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like, v_product, p_free_sample, p_samples
  ) f
  order by f.created_at desc, f.id desc
  offset v_limit - 1
  limit 1;

  select coalesce(json_agg(public.admin_order_json(f) order by f.created_at desc, f.id desc), '[]'::json)
  into v_orders
  from public.admin_filter_orders(
    v_view, v_status, p_paid, p_source, p_from, p_to, p_before,
    v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like, v_product, p_free_sample, p_samples
  ) f
  where v_boundary is null or f.created_at >= v_boundary;

  if v_boundary is not null and exists (
    select 1
    from public.admin_filter_orders(
      v_view, v_status, p_paid, p_source, p_from, p_to, v_boundary,
      v_phone_given, v_phone, v_code_like, v_name_like, v_digits_like, v_product, p_free_sample, p_samples
    )
  ) then
    v_next_before := v_boundary;
  end if;

  return json_build_object('orders', v_orders, 'next_before', v_next_before);
end;
$$;

revoke all on function public.get_admin_orders(text, text[], boolean, text, text, text, timestamptz, timestamptz, timestamptz, integer, text, boolean, boolean) from public, anon;
grant execute on function public.get_admin_orders(text, text[], boolean, text, text, text, timestamptz, timestamptz, timestamptz, integer, text, boolean, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 9. Orders in: the site, and the admin
-- ═══════════════════════════════════════════════════════

-- The popup's Send. Same signature and answers as 20260926000000; the order
-- now lands in Cooking and takes from spare (oldest batch first). Covered on
-- every product, it goes straight to Packing. Samples are still refused.
create or replace function public.submit_order(
  p_code text,
  p_lines jsonb,
  p_name text,
  p_pincode text,
  p_coupon text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  request_headers text := current_setting('request.headers', true);
  v_request_ip text := 'unknown';
  v_request_hash text;
  attempts integer;
  recent_orders integer;
  v_code text;
  v_lines jsonb;
  v_name text;
  v_pincode text;
  v_coupon text;
  v_coupon_id uuid;
  v_coupon_valid boolean;
  v_fingerprint text;
  v_taken_count integer;
  v_top_suffix integer;
  v_order_id uuid;
begin
  if request_headers is not null and request_headers <> '' then
    v_request_ip := coalesce(
      nullif(trim(request_headers::jsonb ->> 'cf-connecting-ip'), ''),
      nullif(trim(split_part(request_headers::jsonb ->> 'x-forwarded-for', ',', 1)), ''),
      'unknown'
    );
  end if;

  if v_request_ip <> 'unknown' then
    v_request_hash := left(encode(digest(v_request_ip, 'sha256'), 'hex'), 64);

    perform pg_advisory_xact_lock(hashtext('submit_order:' || v_request_hash));

    delete from public.order_rate_limits
    where attempted_at < timezone('utc', now()) - interval '1 hour';

    select count(*) into attempts
    from public.order_rate_limits limits
    where limits.request_key = v_request_hash
      and limits.attempted_at > timezone('utc', now()) - interval '1 hour';

    if attempts >= 10 then
      raise exception using message = 'Too many orders. Try again later.', errcode = 'PT429';
    end if;

    insert into public.order_rate_limits (request_key)
    values (v_request_hash);
  end if;

  select count(*) into recent_orders
  from public.orders o
  where o.source = 'site'
    and o.created_at > now() - interval '1 hour';

  if recent_orders >= 300 then
    raise exception using message = 'Too many orders. Try again later.', errcode = 'PT429';
  end if;

  v_code := upper(btrim(p_code, E' \t\r\n'));
  if v_code is null or v_code !~ '^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$' then
    raise exception using message = 'That order code doesn''t look right.', errcode = '22023';
  end if;

  -- No samples from the site.
  v_lines := public.order_clean_lines(p_lines, 10, false);

  v_name := public.order_clean_name(p_name);
  if v_name is null or char_length(v_name) not between 2 and 60 then
    raise exception using message = 'A name is 2 to 60 characters.', errcode = '22023';
  end if;

  v_pincode := btrim(p_pincode, E' \t\r\n');
  if v_pincode is null or v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception using message = 'A pincode is 6 digits.', errcode = '22023';
  end if;

  v_coupon := upper(btrim(p_coupon, E' \t\r\n'));
  if v_coupon is not null and v_coupon !~ '^[A-Z0-9-]{3,24}$' then
    v_coupon := null;
  end if;

  v_fingerprint := md5(
    lower(v_name) || '|' || v_pincode || '|' ||
    (
      select string_agg(
        (line ->> 'product_id') || ':' || (line ->> 'size') || ':' || (line ->> 'quantity'),
        ',' order by line ->> 'product_id' collate "C", line ->> 'size' collate "C"
      )
      from jsonb_array_elements(v_lines) line
    ) || '|' || coalesce(v_coupon, '')
  );

  perform pg_advisory_xact_lock(hashtext('order_code:' || v_code));

  if exists (
    select 1 from public.orders o
    where (o.code = v_code or o.code like v_code || '-%')
      and o.fingerprint = v_fingerprint
  ) then
    return;
  end if;

  select
    count(*),
    max(coalesce(nullif(substring(o.code from '^SN-[A-Z0-9]{5}-([0-9]+)$'), '')::integer, 1))
  into v_taken_count, v_top_suffix
  from public.orders o
  where o.code = v_code or o.code like v_code || '-%';

  if v_taken_count > 0 then
    v_code := v_code || '-' || (v_top_suffix + 1);
  end if;

  if v_coupon is not null then
    select c.id, (c.active and (c.expires_at is null or c.expires_at > now()))
    into v_coupon_id, v_coupon_valid
    from public.coupons c
    where upper(c.code) = v_coupon;

    v_coupon_valid := coalesce(v_coupon_valid, false);
  end if;

  insert into public.orders (
    code, fingerprint, source, status, name, pincode,
    coupon_code, coupon_id, coupon_valid
  ) values (
    v_code, v_fingerprint, 'site', 'cooking', v_name, v_pincode,
    v_coupon, v_coupon_id, v_coupon_valid
  ) returning id into v_order_id;

  insert into public.order_lines (order_id, product_id, size, quantity)
  select v_order_id, line ->> 'product_id', line ->> 'size', (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) line;

  -- Take from spare. The code lock comes first here and in save_admin_order(),
  -- so the two never wait on each other the other way round.
  perform public.kitchen_lock();
  perform public.kitchen_fill_all(public.kitchen_order_products(v_order_id));
end;
$$;

revoke all on function public.submit_order(text, jsonb, text, text, text) from public, anon;
grant execute on function public.submit_order(text, jsonb, text, text, text) to anon, authenticated;

-- Add by hand (p_id null) or a full edit, as in 20260928000000, plus:
--   Lines may be samples ({"size": "sample"}). free_sample is set when every
--   line is one; such an order has no total, coupon or payments.
--   A new order starts in Cooking (or the status sent) and takes from spare.
--   Sent further along (Packing, Ready, Delivered), it's covered by hand.
--   An edit keeps each kept line's weight and re-balances the kitchen
--   (kitchen_order_rebalance). Not undoable, as before.
--   priority (true/false, optional): skip the line. Left out, a new order
--   isn't priority and an edit keeps what it had.
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
      'source', 'code', 'name', 'phone', 'pincode', 'note', 'amount',
      'coupon', 'lines', 'status', 'paid', 'paid_method', 'paid_note', 'created_at', 'priority'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  v_lines := public.order_clean_lines(v_input -> 'lines', 99, true);
  v_free_sample := not exists (
    select 1 from jsonb_array_elements(v_lines) line where line ->> 'size' <> 'sample'
  );
  v_name := public.order_check_name(v_input -> 'name');
  v_phone := public.order_check_phone(v_input -> 'phone');
  v_pincode := public.order_check_pincode(v_input -> 'pincode');
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
      code, source, status, name, pincode, phone, note, amount,
      coupon_code, coupon_id, coupon_valid, free_sample, priority, created_at, created_by
    ) values (
      v_code, v_source, v_status,
      v_name, v_pincode, v_phone, v_note, v_amount,
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

-- Quick changes, as in 20260928000000, with the new stages and without kept.
-- A status change is a kitchen action (see kitchen_order_moved()), and so is
-- priority (true/false): it re-runs the fill for food not yet given, never
-- taking grams from another order. The answer
-- is the order plus kitchen_effects: what it did to the kitchen, with an
-- action_id for undo_admin_kitchen(), or null when only this order's status
-- changed (undo that with the old status, as before).
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
      'status', 'paid', 'paid_method', 'paid_note', 'phone', 'amount', 'note', 'name', 'pincode', 'priority'
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

  if v_order.source = 'site' and (v_order.name is null or v_order.pincode is null) then
    raise exception using message = 'An order from the site keeps its name and pincode.', errcode = '22023';
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
    priority = v_order.priority,
    phone = v_order.phone,
    amount = v_order.amount,
    note = v_order.note,
    name = v_order.name,
    pincode = v_order.pincode
  where id = p_id
  returning * into v_order;

  if v_action is not null then
    perform public.kitchen_order_moved(p_id, v_from, v_order.status);
    if v_order.priority <> v_priority then
      perform public.kitchen_fill_all(public.kitchen_order_products(p_id));
    end if;

    -- Worth an Undo of its own only when more than this order's status moved.
    if exists (
      select 1 from public.kitchen_action_steps s
      where s.action_id = v_action
        and not (s.tbl = 'orders' and (s.new ->> 'id')::uuid = p_id)
    ) then
      v_effects := public.kitchen_effects_json(v_action, false);
      perform public.kitchen_action_finish(v_action);
    else
      perform public.kitchen_action_finish(v_action);
      delete from public.kitchen_actions where id = v_action;
    end if;
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

revoke all on function public.update_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.update_admin_order(uuid, jsonb) to authenticated;

-- Deletes one order for good, like cancelling it first: its batch grams go
-- back to spare and the fill runs. A delivered order's food left, so its
-- batch grams are recorded as used up and spare doesn't grow. A missing id
-- does nothing.
create or replace function public.delete_admin_order(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_products text[];
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  perform public.kitchen_lock();

  select * into v_order from public.orders where id = p_id for update;
  if v_order.id is null then
    return;
  end if;

  if v_order.status in ('delivered', 'cancelled') then
    insert into public.kitchen_writeoffs (batch_id, grams, reason, created_by)
    select a.batch_id, a.grams, 'used_up', auth.uid()
    from public.kitchen_allocations a
    where a.order_id = p_id and a.batch_id is not null;
  end if;

  v_products := public.kitchen_order_products(p_id);
  delete from public.orders where id = p_id;
  perform public.kitchen_fill_all(v_products);
end;
$$;

revoke all on function public.delete_admin_order(uuid) from public, anon;
grant execute on function public.delete_admin_order(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 10. Kitchen RPCs
-- ═══════════════════════════════════════════════════════

-- Grams in a batch: 1 g to 50 kg, a JSON number or digits.
create or replace function public.kitchen_check_grams(p_value jsonb)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text;
begin
  v_text := case when jsonb_typeof(p_value) in ('string', 'number') then btrim(p_value #>> '{}') end;
  if v_text is null or v_text !~ '^[0-9]{1,5}$' or v_text::integer not between 1 and 50000 then
    raise exception using message = 'A batch is 1 g to 50 kg.', errcode = '22023';
  end if;
  return v_text::integer;
end;
$$;

revoke all on function public.kitchen_check_grams(jsonb) from public, anon, authenticated;

-- A made-on day: 'YYYY-MM-DD', null for today. Not after today (India), not
-- more than 60 days back.
create or replace function public.kitchen_check_made_on(p_value jsonb)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_day date;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return public.kitchen_today();
  end if;

  if jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      v_day := (p_value #>> '{}')::date;
    exception
      when others then
        v_day := null;
    end;
  end if;

  if v_day is null then
    raise exception using message = 'That date doesn''t look right.', errcode = '22023';
  end if;

  if v_day > public.kitchen_today() then
    raise exception using message = 'A batch can''t be made in the future.', errcode = '22023';
  end if;

  if v_day < public.kitchen_today() - 60 then
    raise exception using message = 'That''s more than 60 days ago. Pick a later day.', errcode = '22023';
  end if;

  return v_day;
end;
$$;

revoke all on function public.kitchen_check_made_on(jsonb) from public, anon, authenticated;

-- A product the kitchen knows.
create or replace function public.kitchen_check_product(p_value jsonb)
returns text
language plpgsql
stable
set search_path = public
as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string'
     or not exists (select 1 from public.kitchen_products k where k.product_id = p_value #>> '{}') then
    raise exception using message = 'We don''t know that product.', errcode = '22023';
  end if;
  return p_value #>> '{}';
end;
$$;

revoke all on function public.kitchen_check_product(jsonb) from public, anon, authenticated;

-- The kitchen: what to cook, for whom, spare with its age, recent batches.
create or replace function public.get_admin_kitchen()
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

  return public.kitchen_state_json()::json;
end;
$$;

-- The work behind log_admin_batches(), with checked input.
create or replace function public.kitchen_run_log_batches(p_batches jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_action uuid;
  v_item jsonb;
  v_effects jsonb;
begin
  perform public.kitchen_lock();
  v_action := public.kitchen_action_start('log_batches');

  for v_item in select value from jsonb_array_elements(p_batches) loop
    insert into public.kitchen_batches (product_id, grams, made_on, created_by)
    values (v_item ->> 'product_id', (v_item ->> 'grams')::integer, (v_item ->> 'made_on')::date, auth.uid());
  end loop;

  perform public.kitchen_fill_all(array(select value ->> 'product_id' from jsonb_array_elements(p_batches)));

  v_effects := public.kitchen_effects_json(v_action, false);
  perform public.kitchen_action_finish(v_action);
  return v_effects;
end;
$$;

revoke all on function public.kitchen_run_log_batches(jsonb) from public, anon, authenticated;

-- "Log a batch": p_batches = [{product_id, grams, made_on?}], 1 to 10.
-- p_preview: work it out and put everything back. Returns the effects.
create or replace function public.log_admin_batches(p_batches jsonb, p_preview boolean default false)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_clean jsonb := '[]'::jsonb;
  v_item jsonb;
  v_effects jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_batches is null or jsonb_typeof(p_batches) <> 'array' or jsonb_array_length(p_batches) = 0 then
    raise exception using message = 'Add at least one batch.', errcode = '22023';
  end if;
  if jsonb_array_length(p_batches) > 10 then
    raise exception using message = 'Keep it to 10 batches at a time.', errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_batches) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception using message = 'That batch doesn''t look right.', errcode = '22023';
    end if;
    perform public.order_check_keys(v_item, array['product_id', 'grams', 'made_on']);
    v_clean := v_clean || jsonb_build_object(
      'product_id', public.kitchen_check_product(v_item -> 'product_id'),
      'grams', public.kitchen_check_grams(v_item -> 'grams'),
      'made_on', public.kitchen_check_made_on(v_item -> 'made_on')
    );
  end loop;

  if coalesce(p_preview, false) then
    begin
      v_effects := public.kitchen_run_log_batches(v_clean);
      raise exception using errcode = 'KXPRV';
    exception
      when sqlstate 'KXPRV' then
        null;
    end;
    return (v_effects || jsonb_build_object('preview', true, 'action_id', null))::json;
  end if;

  return public.kitchen_run_log_batches(v_clean)::json;
end;
$$;

create or replace function public.kitchen_run_update_batch(p_id uuid, p_grams integer, p_made_on date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_row record;
  v_action uuid;
  v_effects jsonb;
begin
  perform public.kitchen_lock();

  perform 1 from public.kitchen_batches where id = p_id for update;
  select * into v_row from public.kitchen_batch_rows(null) r where r.batch_id = p_id;
  if v_row.batch_id is null then
    raise exception using message = 'That batch is gone.', errcode = '22023';
  end if;

  if coalesce(p_grams, v_row.grams) < v_row.written_off then
    raise exception using
      message = format('%s g of it is already used up or thrown out, so it can''t be less than that.', v_row.written_off),
      errcode = '22023';
  end if;

  v_action := public.kitchen_action_start('update_batch');

  update public.kitchen_batches
  set grams = coalesce(p_grams, grams),
    made_on = coalesce(p_made_on, made_on),
    updated_at = timezone('utc', now()),
    updated_by = auth.uid()
  where id = p_id;

  perform public.kitchen_take_back(p_id, v_row.to_orders + v_row.written_off - coalesce(p_grams, v_row.grams));
  perform public.kitchen_fill(v_row.product_id);

  v_effects := public.kitchen_effects_json(v_action, false);
  perform public.kitchen_action_finish(v_action);
  return v_effects;
end;
$$;

revoke all on function public.kitchen_run_update_batch(uuid, integer, date) from public, anon, authenticated;

-- "Fix a batch": p_changes {grams?, made_on?}. Smaller than what it gave out:
-- grams come back from the youngest orders (see kitchen_take_back()).
create or replace function public.update_admin_batch(p_id uuid, p_changes jsonb, p_preview boolean default false)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_grams integer;
  v_made_on date;
  v_effects jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
     or not (p_changes ? 'grams' or p_changes ? 'made_on') then
    raise exception using message = 'Nothing to change.', errcode = '22023';
  end if;
  perform public.order_check_keys(p_changes, array['grams', 'made_on']);

  if p_changes ? 'grams' then
    v_grams := public.kitchen_check_grams(p_changes -> 'grams');
  end if;
  if p_changes ? 'made_on' then
    v_made_on := public.kitchen_check_made_on(p_changes -> 'made_on');
  end if;

  if coalesce(p_preview, false) then
    begin
      v_effects := public.kitchen_run_update_batch(p_id, v_grams, v_made_on);
      raise exception using errcode = 'KXPRV';
    exception
      when sqlstate 'KXPRV' then
        null;
    end;
    return (v_effects || jsonb_build_object('preview', true, 'action_id', null))::json;
  end if;

  return public.kitchen_run_update_batch(p_id, v_grams, v_made_on)::json;
end;
$$;

create or replace function public.kitchen_run_delete_batch(p_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_row record;
  v_action uuid;
  v_effects jsonb;
begin
  perform public.kitchen_lock();

  perform 1 from public.kitchen_batches where id = p_id for update;
  select * into v_row from public.kitchen_batch_rows(null) r where r.batch_id = p_id;
  if v_row.batch_id is null then
    raise exception using message = 'That batch is gone.', errcode = '22023';
  end if;

  v_action := public.kitchen_action_start('delete_batch');

  delete from public.kitchen_writeoffs where batch_id = p_id;
  perform public.kitchen_take_back(p_id, v_row.to_orders);
  delete from public.kitchen_batches where id = p_id;
  perform public.kitchen_fill(v_row.product_id);

  v_effects := public.kitchen_effects_json(v_action, false);
  perform public.kitchen_action_finish(v_action);
  return v_effects;
end;
$$;

revoke all on function public.kitchen_run_delete_batch(uuid) from public, anon, authenticated;

-- Deletes a batch logged by mistake, with its used up / thrown out rows.
-- Its grams come back from the orders it filled, as when a batch shrinks.
create or replace function public.delete_admin_batch(p_id uuid, p_preview boolean default false)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_effects jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if coalesce(p_preview, false) then
    begin
      v_effects := public.kitchen_run_delete_batch(p_id);
      raise exception using errcode = 'KXPRV';
    exception
      when sqlstate 'KXPRV' then
        null;
    end;
    return (v_effects || jsonb_build_object('preview', true, 'action_id', null))::json;
  end if;

  return public.kitchen_run_delete_batch(p_id)::json;
end;
$$;

-- "Used up" / "Thrown out" for one batch's spare: p_grams (null: all of its
-- spare), p_reason 'used_up' or 'thrown_out'. Only the cook, unless nobody is
-- set as cook. Returns the effects; Undo with undo_admin_kitchen().
create or replace function public.write_off_admin_spare(p_batch_id uuid, p_grams integer default null, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_grams integer;
  v_action uuid;
  v_effects jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if not public.kitchen_can_write_off() then
    raise exception using message = 'Only the cook marks spare as used up or thrown out.', errcode = '22023';
  end if;

  if p_reason is null or p_reason not in ('used_up', 'thrown_out') then
    raise exception using message = 'Choose Used up or Thrown out.', errcode = '22023';
  end if;

  perform public.kitchen_lock();

  perform 1 from public.kitchen_batches where id = p_batch_id for update;
  select * into v_row from public.kitchen_batch_rows(null) r where r.batch_id = p_batch_id;
  if v_row.batch_id is null then
    raise exception using message = 'That batch is gone.', errcode = '22023';
  end if;

  if v_row.spare <= 0 then
    raise exception using message = 'There''s nothing spare in that batch.', errcode = '22023';
  end if;

  v_grams := coalesce(p_grams, v_row.spare);
  if v_grams < 1 or v_grams > v_row.spare then
    raise exception using message = format('There''s only %s g spare in that batch.', v_row.spare), errcode = '22023';
  end if;

  v_action := public.kitchen_action_start('write_off');

  insert into public.kitchen_writeoffs (batch_id, grams, reason, created_by)
  values (p_batch_id, v_grams, p_reason, auth.uid());

  v_effects := public.kitchen_effects_json(v_action, false);
  perform public.kitchen_action_finish(v_action);
  return v_effects::json;
end;
$$;

-- The work behind give_admin_priority(): a priority order in Cooking still
-- short takes whole packed pouches from non-priority orders in Packing or
-- Ready. A pouch matches when it's the same product and the same pack size
-- as one the priority order is missing (nothing is repacked), and it only
-- goes where it fits in what's still short. Newest order first. Delivered and
-- priority orders are never touched. An order that gives a pouch goes back to
-- Cooking, unless it's still covered some other way. Returns the effects with
-- pouches: [{order_id, code, name, from, product_id, size, grams_each, count}].
create or replace function public.kitchen_run_give_priority(p_order_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders;
  v_action uuid;
  v_cover record;
  v_line record;
  v_donor record;
  v_short integer;
  v_want integer;
  v_n integer;
  v_pouches jsonb := '[]'::jsonb;
  v_effects jsonb;
begin
  perform public.kitchen_lock();

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;
  if not v_order.priority or v_order.status <> 'cooking' then
    raise exception using message = 'Only a priority order in Cooking can take packed food.', errcode = '22023';
  end if;

  v_action := public.kitchen_action_start('give_priority');

  for v_cover in
    select c.* from public.kitchen_order_cover(p_order_id) c where c.covered < c.need order by c.product_id
  loop
    v_short := v_cover.need - v_cover.covered;

    -- Its own packs of this product, biggest first.
    for v_line in
      select l.size, l.grams_each, l.quantity
      from public.order_lines l
      where l.order_id = p_order_id and l.product_id = v_cover.product_id and l.grams_each > 0
      order by l.grams_each desc, l.size
    loop
      v_want := least(v_line.quantity, v_short / v_line.grams_each);
      continue when v_want <= 0;

      for v_donor in
        select d.id, d.code, d.name, d.status, l.quantity
        from public.orders d
        join public.order_lines l on l.order_id = d.id
        where d.status in ('packing', 'ready') and not d.priority and d.id <> p_order_id
          and l.product_id = v_cover.product_id
          and l.grams_each = v_line.grams_each
          and (l.size = 'sample') = (v_line.size = 'sample')
        order by d.created_at desc, d.id desc
        for update of d
      loop
        exit when v_want = 0;
        v_n := least(v_want, v_donor.quantity);
        v_n := public.kitchen_move_grams(v_donor.id, p_order_id, v_cover.product_id, v_n * v_line.grams_each)
          / v_line.grams_each;
        continue when v_n = 0;

        if exists (select 1 from public.kitchen_order_cover(v_donor.id) c where c.covered < c.need) then
          perform public.kitchen_set_status(v_donor.id, 'cooking', true);
        end if;

        v_pouches := v_pouches || jsonb_build_object(
          'order_id', v_donor.id, 'code', v_donor.code, 'name', v_donor.name, 'from', v_donor.status,
          'product_id', v_cover.product_id, 'size', v_line.size, 'grams_each', v_line.grams_each, 'count', v_n
        );
        v_want := v_want - v_n;
        v_short := v_short - v_n * v_line.grams_each;
      end loop;
    end loop;
  end loop;

  -- No fill after: a priority order that's still short means there's no
  -- usable spare, and a fill would let it take (and split) the other pouches
  -- of an order that just went back to Cooking, without asking.
  perform public.kitchen_promote(null, p_order_id);

  v_effects := public.kitchen_effects_json(v_action, false) || jsonb_build_object('pouches', v_pouches);
  if not public.kitchen_action_finish(v_action) then
    v_effects := v_effects || jsonb_build_object('action_id', null);
  end if;
  return v_effects;
end;
$$;

revoke all on function public.kitchen_run_give_priority(uuid) from public, anon, authenticated;

-- "Give it to Meera": packed pouches from orders in Packing or Ready to a
-- priority order in Cooking (see kitchen_run_give_priority()). The app asks
-- with p_preview first (nothing changes; pouches lists what would move, []
-- when nothing matches), then commits on yes. Returns the effects plus
-- pouches; Undo with undo_admin_kitchen(action_id).
create or replace function public.give_admin_priority(p_order_id uuid, p_preview boolean default false)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_effects jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if coalesce(p_preview, false) then
    begin
      v_effects := public.kitchen_run_give_priority(p_order_id);
      raise exception using errcode = 'KXPRV';
    exception
      when sqlstate 'KXPRV' then
        null;
    end;
    return (v_effects || jsonb_build_object('preview', true, 'action_id', null))::json;
  end if;

  return public.kitchen_run_give_priority(p_order_id)::json;
end;
$$;

-- Undo of any kitchen action: its steps, newest first, each only if its row
-- is still as the action left it; otherwise nothing changes and it says so.
-- A second tap returns quietly. Returns { undone, kitchen }.
create or replace function public.undo_admin_kitchen(p_action_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.kitchen_actions;
  v_step public.kitchen_action_steps;
  v_products text[];
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  perform public.kitchen_lock();

  select * into v_action from public.kitchen_actions where id = p_action_id for update;
  if v_action.id is null then
    raise exception using message = 'That can''t be undone any more.', errcode = '22023';
  end if;

  if v_action.undone_at is not null then
    return json_build_object('undone', true, 'kitchen', public.kitchen_state_json());
  end if;

  -- Nothing Undo does is itself recorded.
  perform set_config('shahs.kitchen_action', '', true);

  perform 1 from public.orders o
  where o.id in (
    select (coalesce(s.new, s.old) ->> 'order_id')::uuid from public.kitchen_action_steps s
    where s.action_id = p_action_id and s.tbl = 'kitchen_allocations'
    union
    select (s.new ->> 'id')::uuid from public.kitchen_action_steps s
    where s.action_id = p_action_id and s.tbl = 'orders'
  )
  order by o.id
  for update;

  for v_step in
    select * from public.kitchen_action_steps s where s.action_id = p_action_id order by s.seq desc
  loop
    if not public.kitchen_undo_step(v_step) then
      raise exception using message = 'Something changed since, so this can''t be undone.', errcode = '22023';
    end if;
  end loop;

  -- A batch that gave its grams to someone else in the meantime can't take
  -- them back.
  if exists (
    select 1 from public.kitchen_batch_rows(null) r where r.spare < 0
  ) then
    raise exception using message = 'Something changed since, so this can''t be undone.', errcode = '22023';
  end if;

  update public.kitchen_actions
  set undone_at = timezone('utc', now()), undone_by = auth.uid()
  where id = p_action_id;

  -- Anything that arrived meanwhile gets its fair share of what's back.
  select coalesce(array_agg(distinct coalesce(s.new, s.old) ->> 'product_id'), '{}')
  into v_products
  from public.kitchen_action_steps s
  where s.action_id = p_action_id and s.tbl in ('kitchen_allocations', 'kitchen_batches');
  perform public.kitchen_fill_all(v_products);

  return json_build_object('undone', true, 'kitchen', public.kitchen_state_json());
end;
$$;

-- Products page: p_settings {sample_grams?, shelf_life?: {amount, unit} or
-- null}. A new sample weight applies to lines saved from now on. Returns the
-- kitchen (a longer shelf life can make spare usable again, so the fill runs).
create or replace function public.set_admin_kitchen_product(p_product_id text, p_settings jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product text;
  v_sample integer;
  v_amount integer;
  v_unit text;
  v_text text;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  v_product := public.kitchen_check_product(to_jsonb(p_product_id));
  if p_settings is null or jsonb_typeof(p_settings) <> 'object'
     or not (p_settings ? 'sample_grams' or p_settings ? 'shelf_life') then
    raise exception using message = 'Nothing to change.', errcode = '22023';
  end if;
  perform public.order_check_keys(p_settings, array['sample_grams', 'shelf_life']);

  if p_settings ? 'sample_grams' then
    v_text := case when jsonb_typeof(p_settings -> 'sample_grams') in ('string', 'number')
      then btrim(p_settings ->> 'sample_grams') end;
    if v_text is null or v_text !~ '^[0-9]{1,3}$' or v_text::integer not between 1 and 500 then
      raise exception using message = 'A sample is 1 g to 500 g.', errcode = '22023';
    end if;
    v_sample := v_text::integer;
  end if;

  if p_settings ? 'shelf_life' and jsonb_typeof(p_settings -> 'shelf_life') <> 'null' then
    if jsonb_typeof(p_settings -> 'shelf_life') <> 'object' then
      raise exception using message = 'Choose days or months.', errcode = '22023';
    end if;
    perform public.order_check_keys(p_settings -> 'shelf_life', array['amount', 'unit']);
    v_unit := p_settings #>> '{shelf_life,unit}';
    if v_unit is null or v_unit not in ('days', 'months') then
      raise exception using message = 'Choose days or months.', errcode = '22023';
    end if;
    v_text := case when jsonb_typeof(p_settings #> '{shelf_life,amount}') in ('string', 'number')
      then btrim(p_settings #>> '{shelf_life,amount}') end;
    if v_text is null or v_text !~ '^[0-9]{1,3}$'
       or (v_unit = 'days' and v_text::integer not between 1 and 365)
       or (v_unit = 'months' and v_text::integer not between 1 and 24) then
      raise exception using
        message = case v_unit when 'days' then 'Keep the shelf life between 1 and 365 days.'
          else 'Keep the shelf life between 1 and 24 months.' end,
        errcode = '22023';
    end if;
    v_amount := v_text::integer;
  end if;

  perform public.kitchen_lock();

  update public.kitchen_products
  set sample_grams = coalesce(v_sample, sample_grams),
    shelf_life_amount = case when p_settings ? 'shelf_life' then v_amount else shelf_life_amount end,
    shelf_life_unit = case when p_settings ? 'shelf_life' then v_unit else shelf_life_unit end,
    updated_at = timezone('utc', now()),
    updated_by = auth.uid()
  where product_id = v_product;

  perform public.kitchen_fill(v_product);

  return public.kitchen_state_json()::json;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 11. Home: overview, totals, customers, coupon use
-- ═══════════════════════════════════════════════════════

-- The queue with the new stages (see the header of this file), and free
-- samples. Weeks, selling and coupons count every order that isn't
-- cancelled or a free sample; packs leave samples out. Everything else is
-- as in 20260928000000.
create or replace function public.get_admin_overview()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_week_start_date date := date_trunc('week', v_today)::date;
  v_week_start timestamptz := v_week_start_date::timestamp at time zone 'Asia/Kolkata';
  v_week_end timestamptz := (v_week_start_date + 7)::timestamp at time zone 'Asia/Kolkata';
  v_last_week_start timestamptz := (v_week_start_date - 7)::timestamp at time zone 'Asia/Kolkata';
  v_month_start timestamptz := date_trunc('month', v_today)::timestamp at time zone 'Asia/Kolkata';
  v_since_30 timestamptz := now() - interval '30 days';
  v_queue json;
  v_week json;
  v_selling json;
  v_coupons json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select json_build_object(
    'cooking', json_build_object(
      'count', count(*) filter (where o.status = 'cooking'),
      'oldest', min(o.created_at) filter (where o.status = 'cooking')
    ),
    'packing', json_build_object(
      'count', count(*) filter (where o.status = 'packing'),
      'paid', count(*) filter (where o.status = 'packing' and o.paid_at is not null),
      'part_paid', count(*) filter (where o.status = 'packing' and o.paid_at is null and pay.count > 0)
    ),
    'ready', json_build_object(
      'count', count(*) filter (where o.status = 'ready'),
      'not_paid', count(*) filter (where o.status = 'ready' and o.paid_at is null and not o.free_sample),
      'part_paid', count(*) filter (where o.status = 'ready' and o.paid_at is null and pay.count > 0),
      -- How long the oldest has waited to be dropped off, and whose it is
      -- ("Farah's has waited 4 days").
      'oldest_since', min(o.status_changed_at) filter (where o.status = 'ready'),
      'oldest', (
        select json_build_object('code', r.code, 'name', r.name, 'since', r.status_changed_at)
        from public.orders r
        where r.status = 'ready'
        order by r.status_changed_at, r.created_at, r.id
        limit 1
      )
    ),
    'to_collect', json_build_object(
      'count', count(*) filter (where o.status = 'delivered' and o.paid_at is null and not o.free_sample),
      'amount', coalesce(sum(o.amount) filter (where o.status = 'delivered' and o.paid_at is null and not o.free_sample), 0),
      'amount_due', coalesce(sum(greatest(o.amount - pay.total, 0)) filter (
        where o.status = 'delivered' and o.paid_at is null and o.amount is not null
      ), 0),
      'part_paid', count(*) filter (where o.status = 'delivered' and o.paid_at is null and pay.count > 0),
      'without_amount', count(*) filter (
        where o.status = 'delivered' and o.paid_at is null and o.amount is null and not o.free_sample
      ),
      'people', count(distinct coalesce(o.phone, 'name:' || lower(o.name))) filter (
        where o.status = 'delivered' and o.paid_at is null and not o.free_sample
      ),
      'oldest', (
        select json_build_object('code', d.code, 'name', d.name, 'since', d.status_changed_at)
        from public.orders d
        where d.status = 'delivered' and d.paid_at is null and not d.free_sample
        order by d.status_changed_at, d.created_at
        limit 1
      )
    ),
    -- Orders carrying samples (free sample orders and paid orders with a
    -- taster), as the Free samples list: on their way, and delivered this
    -- month (India time).
    'free_samples', json_build_object(
      'open', count(*) filter (where o.status in ('cooking', 'packing', 'ready') and exists (
        select 1 from public.order_lines l where l.order_id = o.id and l.size = 'sample'
      )),
      'sent_this_month', (
        select count(*) from public.orders f
        where f.status = 'delivered' and f.status_changed_at >= v_month_start
          and exists (select 1 from public.order_lines l where l.order_id = f.id and l.size = 'sample')
      ),
      -- Grams of samples in those orders.
      'grams_this_month', (
        select coalesce(sum(l.quantity * l.grams_each), 0) from public.orders f
        join public.order_lines l on l.order_id = f.id and l.size = 'sample'
        where f.status = 'delivered' and f.status_changed_at >= v_month_start
      )
    )
  ) into v_queue
  from public.orders o
  cross join lateral (
    select count(*) as count, coalesce(sum(p.amount), 0) as total
    from public.order_payments p
    where p.order_id = o.id
  ) pay
  where o.status in ('cooking', 'packing', 'ready', 'delivered');

  with order_packs as (
    select
      o.id,
      o.phone,
      o.status,
      o.created_at,
      (o.created_at at time zone 'Asia/Kolkata')::date as day,
      coalesce((
        select sum(l.quantity) from public.order_lines l where l.order_id = o.id and l.size <> 'sample'
      ), 0) as packs
    from public.orders o
    where o.created_at >= v_last_week_start and o.created_at < v_week_end
      and o.status <> 'cancelled' and not o.free_sample
  ),
  this_week as (
    select * from order_packs where created_at >= v_week_start
  )
  select json_build_object(
    'starts_on', v_week_start_date,
    'days', (
      select json_agg(
        json_build_object(
          'date', v_week_start_date + d.i,
          'orders', (select count(*) from this_week t where t.day = v_week_start_date + d.i),
          'packs', (select coalesce(sum(t.packs), 0) from this_week t where t.day = v_week_start_date + d.i)
        )
        order by d.i
      )
      from generate_series(0, 6) as d(i)
    ),
    'orders', (select count(*) from this_week),
    'packs', (select coalesce(sum(packs), 0) from this_week),
    'delivered', (
      select count(*) from public.orders o
      where o.status = 'delivered'
        and o.status_changed_at >= v_week_start and o.status_changed_at < v_week_end
    ),
    'cancelled', (
      select count(*) from public.orders o
      where o.status = 'cancelled'
        and o.status_changed_at >= v_week_start and o.status_changed_at < v_week_end
    ),
    'repeat_customers', (
      select count(distinct t.phone)
      from this_week t
      where t.phone is not null
        and exists (
          select 1 from public.orders p
          where p.phone = t.phone
            and p.status <> 'cancelled'
            and not p.free_sample
            and (p.created_at, p.id) < (t.created_at, t.id)
        )
    ),
    'last_week', (
      select json_build_object('orders', count(*), 'packs', coalesce(sum(packs), 0))
      from order_packs
      where created_at < v_week_start
    )
  ) into v_week;

  select coalesce(json_agg(
    json_build_object('product_id', s.product_id, 'size', s.size, 'packs', s.packs, 'orders', s.orders)
    order by s.packs desc, s.orders desc, s.product_id, s.size
  ), '[]'::json) into v_selling
  from (
    select l.product_id, l.size, sum(l.quantity) as packs, count(distinct o.id) as orders
    from public.orders o
    join public.order_lines l on l.order_id = o.id
    where o.status <> 'cancelled'
      and l.size <> 'sample'
      and o.created_at >= v_since_30
    group by l.product_id, l.size
  ) s;

  select coalesce(json_agg(
    json_build_object('code', c.code, 'orders', c.orders, 'last_used_at', c.last_used_at)
    order by c.orders desc, c.last_used_at desc, c.code
  ), '[]'::json) into v_coupons
  from (
    select o.coupon_code as code, count(*) as orders, max(o.created_at) as last_used_at
    from public.orders o
    where o.status <> 'cancelled'
      and o.created_at >= v_since_30
      and o.coupon_code is not null
    group by o.coupon_code
  ) c;

  return json_build_object(
    'queue', v_queue,
    -- All time, the same rules as get_admin_orders' done view.
    'done', (
      select json_build_object(
        'delivered_paid', count(*) filter (where o.status = 'delivered' and o.paid_at is not null),
        'free_samples', count(*) filter (where o.status = 'delivered' and o.free_sample),
        'cancelled', count(*) filter (where o.status = 'cancelled')
      )
      from public.orders o
      where o.status in ('delivered', 'cancelled')
    ),
    'week', v_week,
    'selling', v_selling,
    'coupons', v_coupons,
    'email', json_build_object(
      'active', (
        select count(*) from public.waitlist_members m
        where m.unsubscribed_at is null and m.status = 'active'
      )
    )
  );
end;
$$;

revoke all on function public.get_admin_overview() from public, anon;
grant execute on function public.get_admin_overview() to authenticated;

-- Home's numbers, as in 20260928000000 with the kitchen stages:
--   stages       cooking, packing, ready (the status), to_collect (delivered,
--                not paid in full, not a free sample). Cancelled and done
--                orders are in none.
--   products     per product and stage: orders, packs (samples left out),
--                samples, grams (samples in: it's all cooked), by_size (a
--                'sample' row after the weights).
--   overall      per stage: orders (free samples in), packs, samples,
--                free_samples, and the money keys, which only ever count
--                paid-for orders: a free sample order never adds to amount,
--                without_amount, amount_due or the names. ready names up to 3
--                unpaid_names and part_paid_names (was on_the_way);
--                to_collect keeps without_amount_names and part_paid_names.
--   weeks        orders and packs are every order that isn't cancelled or a
--                free sample, by created_at, packs without samples. New:
--                grams_made (batches by made_on, India date) and samples
--                {orders: orders carrying a sample, packs: sample packs on
--                any order}. Money in is unchanged.
--   kitchen      the get_admin_kitchen() object, so Home stays one call.
create or replace function public.get_admin_totals()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.kitchen_today();
  v_this_monday date := date_trunc('week', (now() at time zone 'Asia/Kolkata')::date)::date;
  v_this_start timestamptz := v_this_monday::timestamp at time zone 'Asia/Kolkata';
  v_last_start timestamptz := (v_this_monday - 7)::timestamp at time zone 'Asia/Kolkata';
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return (
    with stages (stage, position) as (
      values ('cooking', 1), ('packing', 2), ('ready', 3), ('to_collect', 4)
    ),
    staged as (
      select o.id, o.amount, o.paid_at, o.name, o.created_at, o.status_changed_at, o.free_sample,
        pay.count as payments, pay.total as amount_paid,
        case
          when o.status in ('cooking', 'packing', 'ready') then o.status
          when o.status = 'delivered' and o.paid_at is null and not o.free_sample then 'to_collect'
        end as stage
      from public.orders o
      cross join lateral (
        select count(*) as count, coalesce(sum(p.amount), 0) as total
        from public.order_payments p
        where p.order_id = o.id
      ) pay
      where o.status in ('cooking', 'packing', 'ready', 'delivered')
    ),
    staged_lines as (
      select s.id, s.stage, l.product_id, l.quantity, l.grams_each, l.size = 'sample' as sample,
        public.order_size_label(l.size, l.grams_each) as size
      from staged s
      join public.order_lines l on l.order_id = s.id
      where s.stage is not null
    ),
    cells as (
      select p.product_id, st.stage, st.position,
        json_build_object(
          'orders', a.orders,
          'packs', a.packs,
          'samples', a.samples,
          'grams', a.grams,
          'by_size', (
            select coalesce(json_agg(
              json_build_object('size', b.size, 'grams_each', b.grams_each, 'packs', b.packs)
              order by b.sample, b.grams_each
            ), '[]'::json)
            from (
              select sl.size, sl.grams_each, sl.sample, sum(sl.quantity) as packs
              from staged_lines sl
              where sl.product_id = p.product_id and sl.stage = st.stage
              group by sl.size, sl.grams_each, sl.sample
            ) b
          )
        ) as cell
      from (select distinct product_id from staged_lines) p
      cross join stages st
      cross join lateral (
        select count(distinct sl.id) as orders,
          coalesce(sum(sl.quantity) filter (where not sl.sample), 0) as packs,
          coalesce(sum(sl.quantity) filter (where sl.sample), 0) as samples,
          coalesce(sum(sl.quantity * sl.grams_each), 0) as grams
        from staged_lines sl
        where sl.product_id = p.product_id and sl.stage = st.stage
      ) a
    ),
    -- First names, each once, oldest first. to_collect by when it was
    -- delivered, ready by when it was ordered. Free samples are never named.
    waiting_names as (
      select n.list, (array_agg(n.first_name order by n.rn))[1] as first_name, min(n.rn) as rn
      from (
        select 'to_collect' as list, split_part(btrim(x.name), ' ', 1) as first_name,
          row_number() over (order by x.status_changed_at, x.created_at, x.id) as rn
        from staged x
        where x.stage = 'to_collect' and x.amount is null and nullif(btrim(x.name), '') is not null
        union all
        select 'ready', split_part(btrim(x.name), ' ', 1),
          row_number() over (order by x.created_at, x.id)
        from staged x
        where x.stage = 'ready' and x.paid_at is null and not x.free_sample
          and nullif(btrim(x.name), '') is not null
        union all
        select 'to_collect:part', split_part(btrim(x.name), ' ', 1),
          row_number() over (order by x.status_changed_at, x.created_at, x.id)
        from staged x
        where x.stage = 'to_collect' and x.payments > 0 and nullif(btrim(x.name), '') is not null
        union all
        select 'ready:part', split_part(btrim(x.name), ' ', 1),
          row_number() over (order by x.created_at, x.id)
        from staged x
        where x.stage = 'ready' and x.paid_at is null and x.payments > 0 and nullif(btrim(x.name), '') is not null
      ) n
      group by n.list, lower(n.first_name)
    ),
    overall as (
      select st.stage, st.position,
        jsonb_build_object(
          'orders', count(s.id),
          'packs', coalesce((
            select sum(sl.quantity) from staged_lines sl where sl.stage = st.stage and not sl.sample
          ), 0),
          'samples', coalesce((
            select sum(sl.quantity) from staged_lines sl where sl.stage = st.stage and sl.sample
          ), 0),
          'free_samples', count(s.id) filter (where s.free_sample),
          'amount', coalesce(sum(s.amount) filter (where not s.free_sample), 0),
          'without_amount', count(s.id) filter (where s.amount is null and not s.free_sample),
          'paid', count(s.id) filter (where s.paid_at is not null),
          'unpaid_amount', coalesce(sum(s.amount) filter (where s.paid_at is null and not s.free_sample), 0),
          'amount_due', coalesce(sum(greatest(s.amount - s.amount_paid, 0)) filter (where s.amount is not null), 0),
          'part_paid', count(s.id) filter (where s.paid_at is null and s.payments > 0)
        )
        || case
          when st.stage in ('to_collect', 'ready') then (
            select jsonb_build_object(
              case st.stage when 'to_collect' then 'without_amount_names' else 'unpaid_names' end,
              coalesce(jsonb_agg(w.first_name order by w.rn), '[]'::jsonb)
            )
            from (
              select wn.first_name, wn.rn
              from waiting_names wn
              where wn.list = st.stage
              order by wn.rn
              limit 3
            ) w
          )
          else '{}'::jsonb
        end
        || case
          when st.stage in ('to_collect', 'ready') then (
            select jsonb_build_object('part_paid_names', coalesce(jsonb_agg(w.first_name order by w.rn), '[]'::jsonb))
            from (
              select wn.first_name, wn.rn
              from waiting_names wn
              where wn.list = st.stage || ':part'
              order by wn.rn
              limit 3
            ) w
          )
          else '{}'::jsonb
        end as totals
      from stages st
      left join staged s on s.stage = st.stage
      group by st.stage, st.position
    ),
    -- Real orders: not cancelled, not a free sample.
    real_orders as (
      select o.id, o.created_at,
        (o.created_at at time zone 'Asia/Kolkata')::date as day,
        coalesce((
          select sum(l.quantity) from public.order_lines l where l.order_id = o.id and l.size <> 'sample'
        ), 0) as packs
      from public.orders o
      where o.status <> 'cancelled' and not o.free_sample
    ),
    real_lines as (
      select r.id, r.created_at, l.product_id, l.quantity
      from real_orders r
      join public.order_lines l on l.order_id = r.id and l.size <> 'sample'
    ),
    -- Samples: orders carrying a sample (free sample orders and paid orders
    -- with a taster), and sample packs on any order.
    sample_orders as (
      select o.created_at from public.orders o
      where o.status <> 'cancelled'
        and exists (select 1 from public.order_lines l where l.order_id = o.id and l.size = 'sample')
    ),
    sample_lines as (
      select o.created_at, l.quantity
      from public.orders o
      join public.order_lines l on l.order_id = o.id and l.size = 'sample'
      where o.status <> 'cancelled'
    ),
    paid as (
      select o.paid_at, o.amount
      from public.orders o
      where o.status <> 'cancelled' and o.paid_at is not null
    ),
    payments_in as (
      select p.paid_at, coalesce(p.amount, 0) as amount, p.method,
        (o.paid_at is null or exists (
          select 1 from public.order_payments q where q.order_id = p.order_id and q.id <> p.id
        )) as part
      from public.order_payments p
      join public.orders o on o.id = p.order_id
      where o.status <> 'cancelled'
    ),
    -- made_from / made_to: the India dates a week's batches count on
    -- (inclusive). last_so_far runs to the date 7 days ago.
    weeks (key, position, monday, starts_at, ends_at, made_from, made_to) as (
      values
        ('this', 1, v_this_monday, v_this_start, null::timestamptz, v_this_monday, v_today),
        ('last', 2, v_this_monday - 7, v_last_start, v_this_start, v_this_monday - 7, v_this_monday - 1),
        ('last_so_far', 3, v_this_monday - 7, v_last_start, now() - interval '7 days',
          v_this_monday - 7, ((now() - interval '7 days') at time zone 'Asia/Kolkata')::date)
    )
    select json_build_object(
      'as_of', now(),
      'first_order_at', (select min(r.created_at) from real_orders r),
      'products', (
        select coalesce(json_agg(
          json_build_object(
            'product_id', p.product_id,
            'stages', (
              select json_object_agg(c.stage, c.cell order by c.position)
              from cells c where c.product_id = p.product_id
            )
          )
          order by p.product_id
        ), '[]'::json)
        from (select distinct product_id from cells) p
      ),
      'overall', (
        select json_object_agg(ov.stage, ov.totals order by ov.position) from overall ov
      ),
      'weeks', (
        select json_object_agg(w.key, (
          jsonb_build_object(
            'starts_at', w.starts_at,
            'ends_at', coalesce(w.ends_at, now()),
            'orders', (
              select count(*) from real_orders r
              where r.created_at >= w.starts_at and (w.ends_at is null or r.created_at < w.ends_at)
            ),
            'packs', (
              select coalesce(sum(r.packs), 0) from real_orders r
              where r.created_at >= w.starts_at and (w.ends_at is null or r.created_at < w.ends_at)
            ),
            'amount_in', (
              select coalesce(sum(pi.amount), 0) from payments_in pi
              where pi.paid_at >= w.starts_at and (w.ends_at is null or pi.paid_at < w.ends_at)
            ),
            'paid_orders', (
              select count(*) from paid pd
              where pd.paid_at >= w.starts_at and (w.ends_at is null or pd.paid_at < w.ends_at)
            ),
            'paid_without_amount', (
              select count(*) from paid pd
              where pd.amount is null
                and pd.paid_at >= w.starts_at and (w.ends_at is null or pd.paid_at < w.ends_at)
            ),
            'part_payments', (
              select count(*) from payments_in pi
              where pi.part
                and pi.paid_at >= w.starts_at and (w.ends_at is null or pi.paid_at < w.ends_at)
            ),
            'grams_made', (
              select coalesce(sum(b.grams), 0) from public.kitchen_batches b
              where b.made_on between w.made_from and w.made_to
            ),
            'samples', jsonb_build_object(
              'orders', (
                select count(*) from sample_orders so
                where so.created_at >= w.starts_at and (w.ends_at is null or so.created_at < w.ends_at)
              ),
              'packs', (
                select coalesce(sum(sl.quantity), 0) from sample_lines sl
                where sl.created_at >= w.starts_at and (w.ends_at is null or sl.created_at < w.ends_at)
              )
            )
          )
          || case when w.key in ('this', 'last') then jsonb_build_object('days', (
            select jsonb_agg(
              jsonb_build_object(
                'date', w.monday + d.i,
                'orders', (select count(*) from real_orders r where r.day = w.monday + d.i),
                'packs', (select coalesce(sum(r.packs), 0) from real_orders r where r.day = w.monday + d.i)
              )
              order by d.i
            )
            from generate_series(0, 6) as d(i)
          )) else '{}'::jsonb end
          || case when w.key in ('this', 'last_so_far') then jsonb_build_object('by_product', (
            select coalesce(jsonb_agg(
              jsonb_build_object('product_id', b.product_id, 'packs', b.packs, 'orders', b.orders)
              order by b.product_id
            ), '[]'::jsonb)
            from (
              select rl.product_id, sum(rl.quantity) as packs, count(distinct rl.id) as orders
              from real_lines rl
              where rl.created_at >= w.starts_at and (w.ends_at is null or rl.created_at < w.ends_at)
              group by rl.product_id
            ) b
          )) else '{}'::jsonb end
          || case when w.key = 'this' then jsonb_build_object('amount_by_method', (
            select jsonb_build_object(
              'upi', coalesce(sum(pi.amount) filter (where pi.method = 'upi'), 0),
              'cash', coalesce(sum(pi.amount) filter (where pi.method = 'cash'), 0),
              'bank', coalesce(sum(pi.amount) filter (where pi.method = 'bank'), 0),
              'other', coalesce(sum(pi.amount) filter (where pi.method = 'other'), 0),
              'not_recorded', coalesce(sum(pi.amount) filter (where pi.method is null), 0)
            )
            from payments_in pi
            where pi.paid_at >= w.starts_at and (w.ends_at is null or pi.paid_at < w.ends_at)
          )) else '{}'::jsonb end
        ) order by w.position)
        from weeks w
      ),
      'kitchen', public.kitchen_state_json()
    )
  );
end;
$$;

revoke all on function public.get_admin_totals() from public, anon;
grant execute on function public.get_admin_totals() to authenticated;

-- As in 20260926000003 with the new stages. Free sample orders don't count as
-- orders (or delivered); they show as samples. open is every order still in
-- the kitchen or owed money.
create or replace function public.get_admin_customers(p_search text default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_name_like text;
  v_digits text;
  v_customers json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if v_search <> '' then
    v_name_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_digits := regexp_replace(v_search, '[^0-9]', '', 'g');
    if char_length(v_digits) < 3 then
      v_digits := null;
    end if;
  end if;

  select coalesce(json_agg(
    json_build_object(
      'phone', c.phone,
      'name', c.name,
      'pincode', c.pincode,
      'orders', c.orders,
      'delivered', c.delivered,
      'open', c.open,
      'samples', c.samples,
      'first_order_at', c.first_order_at,
      'last_order_at', c.last_order_at,
      'amount_total', c.amount_total
    )
    order by c.last_order_at desc, c.phone
  ), '[]'::json) into v_customers
  from (
    select
      o.phone,
      (array_agg(o.name order by o.created_at desc, o.id desc) filter (where o.name is not null))[1] as name,
      (array_agg(o.pincode order by o.created_at desc, o.id desc) filter (where o.pincode is not null))[1] as pincode,
      count(*) filter (where not o.free_sample) as orders,
      count(*) filter (where o.status = 'delivered' and not o.free_sample) as delivered,
      count(*) filter (
        where o.status in ('cooking', 'packing', 'ready')
          or (o.status = 'delivered' and o.paid_at is null and not o.free_sample)
      ) as open,
      count(*) filter (where o.free_sample) as samples,
      min(o.created_at) as first_order_at,
      max(o.created_at) as last_order_at,
      coalesce(sum(o.amount), 0) as amount_total,
      coalesce(bool_or(o.name ilike v_name_like), false) as name_hit
    from public.orders o
    where o.phone is not null
      and o.status <> 'cancelled'
    group by o.phone
  ) c
  where v_search = ''
    or c.name_hit
    or (v_digits is not null and c.phone like '%' || v_digits || '%');

  return json_build_object(
    'customers', v_customers,
    'without_phone', (
      select count(*) from public.orders o
      where o.phone is null and o.status <> 'cancelled'
    )
  );
end;
$$;

revoke all on function public.get_admin_customers(text) from public, anon;
grant execute on function public.get_admin_customers(text) to authenticated;

-- As in 20260926000001; a coupon's use now counts every order that isn't
-- cancelled (there's no unconfirmed stage any more).
create or replace function public.get_admin_coupons()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select coalesce(
    json_agg(
      (
        public.admin_coupon_json(c)::jsonb
        || jsonb_build_object(
          'order_count', coalesce(u.order_count, 0),
          'last_used_at', u.last_used_at
        )
      )::json
      order by c.created_at desc, c.code
    ),
    '[]'::json
  ) into result
  from public.coupons c
  left join (
    select o.coupon_id, count(*) as order_count, max(o.created_at) as last_used_at
    from public.orders o
    where o.coupon_id is not null
      and o.status <> 'cancelled'
    group by o.coupon_id
  ) u on u.coupon_id = c.id;

  return result;
end;
$$;

revoke all on function public.get_admin_coupons() from public, anon;
grant execute on function public.get_admin_coupons() to authenticated;

-- ═══════════════════════════════════════════════════════
-- 12. Existing orders: past Cooking means covered
-- ═══════════════════════════════════════════════════════

-- Ready and delivered orders are covered by hand for their full need, so a
-- pack added later puts back only the missing part. Cooking orders get
-- nothing: spare starts at zero, so everything in Cooking is "to cook".
select public.kitchen_cover_by_hand(o.id)
from public.orders o
where o.status in ('ready', 'delivered');

-- ═══════════════════════════════════════════════════════
-- 13. Grants for the new admin RPCs
-- ═══════════════════════════════════════════════════════

-- Supabase grants execute on new functions to anon and authenticated by
-- default. Admin RPCs are for signed-in admins (is_admin() inside).
revoke all on function public.get_admin_kitchen() from public, anon;
grant execute on function public.get_admin_kitchen() to authenticated;

revoke all on function public.log_admin_batches(jsonb, boolean) from public, anon;
grant execute on function public.log_admin_batches(jsonb, boolean) to authenticated;

revoke all on function public.update_admin_batch(uuid, jsonb, boolean) from public, anon;
grant execute on function public.update_admin_batch(uuid, jsonb, boolean) to authenticated;

revoke all on function public.delete_admin_batch(uuid, boolean) from public, anon;
grant execute on function public.delete_admin_batch(uuid, boolean) to authenticated;

revoke all on function public.write_off_admin_spare(uuid, integer, text) from public, anon;
grant execute on function public.write_off_admin_spare(uuid, integer, text) to authenticated;

revoke all on function public.undo_admin_kitchen(uuid) from public, anon;
grant execute on function public.undo_admin_kitchen(uuid) to authenticated;

revoke all on function public.set_admin_kitchen_product(text, jsonb) from public, anon;
grant execute on function public.set_admin_kitchen_product(text, jsonb) to authenticated;

revoke all on function public.give_admin_priority(uuid, boolean) from public, anon;
grant execute on function public.give_admin_priority(uuid, boolean) to authenticated;
