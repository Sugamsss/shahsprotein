-- Migration: 20260928000000_part_payments.sql
-- Part payments: an order can be paid in parts (say 75% up front, the rest
-- after delivery). Admin only; nothing public changes, and no existing key
-- changes shape. temp/part-payments-brief.md has the product decisions.
--
-- 1. order_payments: one row per payment. Amount in whole rupees, how they
--    paid (the same four methods and Other note as 20260926000007), the date
--    it came in, and who added it. RLS on, no policies, like every order table.
-- 2. Every order already marked paid becomes one payment: its amount, method,
--    note and paid_at, added by whoever marked it paid. A paid order with no
--    amount gets a payment with no amount ("paid in full, total not typed").
-- 3. orders.paid_at, paid_method and paid_note are now worked out from the
--    payments, by triggers, on every write. paid_at is when the payments first
--    covered the total (the date of the payment that got there), so "paid"
--    still means paid in full everywhere it's read: the stages, the filters,
--    the Done list, the history's paid/unpaid events. paid_method and
--    paid_note are that payment's. A part-paid order has none of the three.
-- 4. The order JSON gains payments, amount_paid, amount_due, amount_extra and
--    payment_state ('not_paid', 'part_paid', 'paid').
-- 5. New admin RPCs: add_admin_payment(), pay_admin_order_rest(),
--    delete_admin_payment() and restore_admin_payments() (Undo).
--    update_admin_order() and save_admin_order() keep every key they take:
--    paid: true records a payment for whatever is left, paid: false removes
--    every payment, and paid_method on a paid order changes the method of the
--    payment that completed it. So the app from before this keeps working.
-- 6. get_admin_overview() and get_admin_totals() gain keys for money due and
--    part-paid orders. One existing key changes meaning, as the brief asks:
--    get_admin_totals() weeks.*.amount_in (and amount_by_method) now count
--    each payment in the week it came in, not the order's whole amount on the
--    day it was marked paid. Until someone records a part payment, the two
--    give the same numbers (the backfill copies the old ones exactly).
--
-- The rules the triggers keep:
--   - An order with no total can have only payments with no amount. Typing a
--     total fills them in with it, so money in stays right.
--   - An order with a total can't have payments with no amount, and its total
--     can't be cleared while it has payments with amounts.
--   - A part payment needs a total first (add_admin_payment says so).
--   - Paid = at least one payment, and together they cover the total (or the
--     order has no total). A ₹0 order is paid once it has one payment.
--   - Paying more than the total is allowed; amount_extra shows it. No refunds.

-- ═══════════════════════════════════════════════════════
-- 1. Table
-- ═══════════════════════════════════════════════════════

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  -- Whole rupees. Null only while the order has no total: "paid in full,
  -- amount not known yet". 0 only as the rest of a ₹0 order.
  amount integer constraint order_payments_amount_check check (amount between 0 and 1000000),
  -- Null only on payments copied from orders paid before 20260926000007.
  method text constraint order_payments_method_check check (method in ('cash', 'upi', 'bank', 'other')),
  -- Trimmed, one line, 1 to 60 characters, and only with Other.
  note text constraint order_payments_note_check check (
    char_length(note) between 1 and 60
    and note = btrim(note)
    and note !~ '[[:cntrl:]]'
  ),
  -- When the money came in. Home counts it in this week.
  paid_at timestamptz not null default timezone('utc', now()),
  -- When it was typed in, and by whom.
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  constraint order_payments_note_only_with_other
    check ((method is not distinct from 'other') = (note is not null))
);

create index if not exists order_payments_order_idx
  on public.order_payments (order_id, paid_at, created_at, id);
-- Home's money in, by week.
create index if not exists order_payments_paid_at_idx
  on public.order_payments (paid_at);

alter table public.order_payments enable row level security;
-- No policies: the only ways in are the security definer functions below.
revoke all on public.order_payments from anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Backfill: every paid order becomes one payment
-- ═══════════════════════════════════════════════════════

-- Gives every paid order with no payments one payment copied from the order.
-- Null p_order_id means every order. Returns how many it added, so running it
-- again adds nothing. Used once below, and by the insert trigger in 3.
create or replace function public.order_backfill_payments(p_order_id uuid default null)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_added integer;
begin
  insert into public.order_payments (order_id, amount, method, note, paid_at, created_at, created_by)
  select o.id, o.amount, o.paid_method, o.paid_note, o.paid_at, o.paid_at,
    coalesce((
      -- Whoever marked it paid last.
      select e.by from public.order_events e
      where e.order_id = o.id and e.event = 'paid'
      order by e.at desc, e.id desc
      limit 1
    ), o.created_by)
  from public.orders o
  where o.paid_at is not null
    and (p_order_id is null or o.id = p_order_id)
    and not exists (select 1 from public.order_payments p where p.order_id = o.id);

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

revoke all on function public.order_backfill_payments(uuid) from public, anon, authenticated;

-- Before the triggers exist, so no order's updated_at moves: the payments
-- say exactly what the orders already say.
select public.order_backfill_payments();

-- ═══════════════════════════════════════════════════════
-- 3. Triggers: paid_at from the payments
-- ═══════════════════════════════════════════════════════

-- The payment that got the order to its total: the first, by date, at which
-- the running sum covers it. With no total (or a payment with no amount),
-- the first payment covers it. Null when the payments don't cover it yet.
create or replace function public.order_covering_payment(p_order_id uuid, p_amount integer)
returns public.order_payments
language sql
stable
set search_path = public
as $$
  select c.id, c.order_id, c.amount, c.method, c.note, c.paid_at, c.created_at, c.created_by
  from (
    select p.*,
      sum(coalesce(p.amount, 0)) over (order by p.paid_at, p.created_at, p.id) as running
    from public.order_payments p
    where p.order_id = p_order_id
  ) c
  where p_amount is null or c.amount is null or c.running >= p_amount
  order by c.paid_at, c.created_at, c.id
  limit 1;
$$;

revoke all on function public.order_covering_payment(uuid, integer) from public, anon, authenticated;

-- Every update of an order works its paid fields out again, so no write path
-- can leave them out of step with the payments.
create or replace function public.set_order_paid_from_payments()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cover public.order_payments;
begin
  if new.amount is null and old.amount is not null and exists (
    select 1 from public.order_payments p where p.order_id = new.id and p.amount is not null
  ) then
    raise exception using
      message = 'This order has payments, so it needs its total. Remove the payments first to clear it.',
      errcode = '22023';
  end if;

  v_cover := public.order_covering_payment(new.id, new.amount);
  new.paid_at := v_cover.paid_at;
  new.paid_method := v_cover.method;
  new.paid_note := v_cover.note;
  return new;
end;
$$;

revoke all on function public.set_order_paid_from_payments() from public, anon, authenticated;

drop trigger if exists trg_orders_paid_from_payments on public.orders;
create trigger trg_orders_paid_from_payments
  before update on public.orders
  for each row execute function public.set_order_paid_from_payments();

-- An order inserted already paid (a raw insert, a test, a seed) gets its
-- payment, so the update trigger above never finds it paid with nothing to
-- show for it. The RPCs insert unpaid and add the payment themselves.
create or replace function public.add_payment_for_paid_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.order_backfill_payments(new.id);
  return null;
end;
$$;

revoke all on function public.add_payment_for_paid_insert() from public, anon, authenticated;

drop trigger if exists trg_orders_paid_insert on public.orders;
create trigger trg_orders_paid_insert
  after insert on public.orders
  for each row
  when (new.paid_at is not null)
  execute function public.add_payment_for_paid_insert();

-- A total typed on an order paid without one fills in its payment: the first
-- gets the total, less any payment that has an amount (in practice there are
-- none, and only one payment). Money in then counts it on the day it was paid.
create or replace function public.fill_payment_amounts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.order_payments p
  set amount = case when f.rn = 1 then greatest(new.amount - f.known, 0) else 0 end
  from (
    select q.id,
      row_number() over (order by q.paid_at, q.created_at, q.id) as rn,
      (select coalesce(sum(k.amount), 0) from public.order_payments k where k.order_id = new.id) as known
    from public.order_payments q
    where q.order_id = new.id and q.amount is null
  ) f
  where p.id = f.id;

  return null;
end;
$$;

revoke all on function public.fill_payment_amounts() from public, anon, authenticated;

drop trigger if exists trg_orders_fill_payments on public.orders;
create trigger trg_orders_fill_payments
  after update of amount on public.orders
  for each row
  when (new.amount is not null and old.amount is distinct from new.amount)
  execute function public.fill_payment_amounts();

-- Any change to a payment touches its order, which runs the update trigger
-- above (and the history trigger, for paid/unpaid) and moves updated_at.
create or replace function public.touch_order_for_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.orders
  set updated_at = timezone('utc', now())
  where id = coalesce(new.order_id, old.order_id);
  return null;
end;
$$;

revoke all on function public.touch_order_for_payment() from public, anon, authenticated;

drop trigger if exists trg_order_payments_touch on public.order_payments;
create trigger trg_order_payments_touch
  after insert or update or delete on public.order_payments
  for each row execute function public.touch_order_for_payment();

-- ═══════════════════════════════════════════════════════
-- 4. Shared checks and the "pay the rest" step (internal)
-- ═══════════════════════════════════════════════════════

-- A part payment: whole rupees, 1 to 10,00,000. A JSON number or digits.
create or replace function public.order_check_payment_amount(p_value jsonb)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text;
begin
  v_text := case when jsonb_typeof(p_value) in ('string', 'number') then btrim(p_value #>> '{}') end;
  if v_text is null or v_text = '' then
    raise exception using message = 'Type how much they paid.', errcode = '22023';
  end if;

  if v_text !~ '^[0-9]{1,7}$' or v_text::integer not between 1 and 1000000 then
    raise exception using message = 'Keep the payment between ₹1 and ₹10,00,000.', errcode = '22023';
  end if;

  return v_text::integer;
end;
$$;

revoke all on function public.order_check_payment_amount(jsonb) from public, anon, authenticated;

-- When the money came in: an ISO timestamp, or null for now. Back-dating is
-- fine; the future isn't (five minutes of slack for a fast phone clock).
create or replace function public.order_check_payment_date(p_value jsonb)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return timezone('utc', now());
  end if;

  begin
    v_at := (p_value #>> '{}')::timestamptz;
  exception
    when others then
      v_at := null;
  end;

  if jsonb_typeof(p_value) <> 'string' or v_at is null then
    raise exception using message = 'That date doesn''t look right.', errcode = '22023';
  end if;

  if v_at > now() + interval '5 minutes' then
    raise exception using message = 'A payment can''t be dated in the future.', errcode = '22023';
  end if;

  return least(v_at, timezone('utc', now()));
end;
$$;

revoke all on function public.order_check_payment_date(jsonb) from public, anon, authenticated;

-- Only the listed keys, and p_payment must be an object.
create or replace function public.order_check_keys(p_value jsonb, p_allowed text[])
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_key text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception using message = 'That payment doesn''t look right.', errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_value) loop
    if not (v_key = any (p_allowed)) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke all on function public.order_check_keys(jsonb, text[]) from public, anon, authenticated;

-- Records one payment for whatever is left: the total less what's been paid,
-- or no amount when the order has no total. The caller has the order locked
-- and has checked the method and note.
create or replace function public.order_pay_rest(
  p_order_id uuid,
  p_method text,
  p_note text,
  p_paid_at timestamptz
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;

  if v_order.paid_at is not null then
    raise exception using message = 'That order is already paid.', errcode = '22023';
  end if;

  insert into public.order_payments (order_id, amount, method, note, paid_at, created_by)
  values (
    v_order.id,
    case when v_order.amount is not null then greatest(v_order.amount - (
      select coalesce(sum(p.amount), 0) from public.order_payments p where p.order_id = v_order.id
    ), 0) end,
    p_method, p_note, coalesce(p_paid_at, timezone('utc', now())), auth.uid()
  );
end;
$$;

revoke all on function public.order_pay_rest(uuid, text, text, timestamptz) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 5. Order JSON: payments and what's due
-- ═══════════════════════════════════════════════════════

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
    -- Paid in full: the payments cover the total (or there's no total).
    'paid', p_order.paid_at is not null,
    -- When the payments first covered the total.
    'paid_at', p_order.paid_at,
    -- The method and note of the payment that covered it; null while not
    -- (fully) paid, and on orders paid before methods existed.
    'paid_method', p_order.paid_method,
    'paid_note', p_order.paid_note,
    -- 'not_paid' (no payments), 'part_paid' (some, not enough) or 'paid'.
    'payment_state', case
      when p_order.paid_at is not null then 'paid'
      when pay.count > 0 then 'part_paid'
      else 'not_paid'
    end,
    -- Oldest first. amount is null only on an order with no total.
    'payments', pay.list,
    'amount_paid', pay.total,
    -- Null when the order has no total. Never negative: see amount_extra.
    'amount_due', case when p_order.amount is not null then greatest(p_order.amount - pay.total, 0) end,
    'amount_extra', case when p_order.amount is not null then greatest(pay.total - p_order.amount, 0) end,
    'kept', p_order.kept_at is not null,
    'stale', public.order_is_stale(p_order),
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
        -- The matched coupon's current description, for "EXAMPLE10 · 10% off".
        'description', (select c.description from public.coupons c where c.id = p_order.coupon_id)
      )
    end,
    'lines', coalesce((
      select json_agg(
        json_build_object('product_id', l.product_id, 'size', l.size, 'quantity', l.quantity)
        order by l.product_id, l.size
      )
      from public.order_lines l
      where l.order_id = p_order.id
    ), '[]'::json),
    'packs', coalesce((
      select sum(l.quantity) from public.order_lines l where l.order_id = p_order.id
    ), 0),
    'customer', case
      when p_order.phone is null then null
      else (
        -- This order's place among the phone's not-cancelled orders, and
        -- how many that phone has.
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
-- 6. update_admin_order: paid through payments
-- ═══════════════════════════════════════════════════════

-- The same keys as 20260926000007. What paid now does:
--   paid: true   on a not (fully) paid order records one payment for the
--                rest, with paid_method/paid_note if given (none if not).
--                On a paid order it keeps it, and a paid_method/paid_note
--                changes the payment that completed it (the old app's method
--                picker and its Undo).
--   paid: false  removes every payment. Undo is restore_admin_payments().
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
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception using message = 'Nothing to change.', errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in (
      'status', 'paid', 'paid_method', 'paid_note', 'kept', 'phone', 'amount', 'note', 'name', 'pincode'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  select * into v_order from public.orders where id = p_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;

  if p_changes ? 'status' then
    v_order.status := public.order_check_status(p_changes -> 'status');
  end if;

  if p_changes ? 'paid' then
    v_paid := public.order_check_boolean(p_changes -> 'paid', 'paid');
  end if;

  -- How they paid is set only together with paid: true, as before.
  if (p_changes ? 'paid_method' or p_changes ? 'paid_note') and v_paid is not true then
    raise exception using message = 'Mark it paid to say how they paid.', errcode = '22023';
  end if;

  -- "Keep" / "Still waiting" restarts the 48 h clock on every tap, so
  -- kept_at moves to now even when it's already set. false clears it (Undo).
  if p_changes ? 'kept' then
    v_order.kept_at := case
      when public.order_check_boolean(p_changes -> 'kept', 'kept')
        then timezone('utc', now())
    end;
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

  -- Not paid goes first, so the same call can then clear the total, and the
  -- history keeps its old order (unpaid before unkept).
  if v_paid is false then
    delete from public.order_payments where order_id = p_id;
  end if;

  -- paid_at, paid_method and paid_note follow the payments (the trigger).
  update public.orders
  set
    status = v_order.status,
    kept_at = v_order.kept_at,
    phone = v_order.phone,
    amount = v_order.amount,
    note = v_order.note,
    name = v_order.name,
    pincode = v_order.pincode
  where id = p_id
  returning * into v_order;

  -- Paid goes last, so a new total in the same call is what gets paid.
  if v_paid then
    v_cover := public.order_covering_payment(p_id, v_order.amount);

    -- A method replaces the method and note; a note alone keeps the method.
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
  return public.admin_order_json(v_order);
end;
$$;

revoke all on function public.update_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.update_admin_order(uuid, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 7. save_admin_order: paid on create is one payment
-- ═══════════════════════════════════════════════════════

-- Add by hand (p_id null) or a full edit, with the same keys as
-- 20260926000007. paid: true on create records one payment for the total
-- (none when there's no total), dated now. An edit leaves the payments alone;
-- a changed total just changes what's due.
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
  v_name text;
  v_phone text;
  v_pincode text;
  v_note text;
  v_amount integer;
  v_coupon text;
  v_coupon_id uuid;
  v_coupon_valid boolean;
  v_source text;
  v_status text := 'confirmed';
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
      'coupon', 'lines', 'status', 'paid', 'paid_method', 'paid_note', 'created_at'
    ) then
      raise exception using message = format('Unknown field: %s.', v_key), errcode = '22023';
    end if;
  end loop;

  v_lines := public.order_clean_lines(v_input -> 'lines', 99);
  v_name := public.order_check_name(v_input -> 'name');
  v_phone := public.order_check_phone(v_input -> 'phone');
  v_pincode := public.order_check_pincode(v_input -> 'pincode');
  v_note := public.order_check_note(v_input -> 'note');
  v_amount := public.order_check_amount(v_input -> 'amount');
  v_coupon := public.order_check_coupon(v_input -> 'coupon');

  if p_id is not null then
    select * into v_order from public.orders where id = p_id for update;
    if v_order.id is null then
      raise exception using message = 'That order is gone.', errcode = '22023';
    end if;
  end if;

  -- Source: required on create; on edit it may move between the four hand
  -- sources, and a site order stays a site order.
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

  -- The coupon is worked out against the coupons table when it's new or
  -- changed. An unchanged code keeps what it had when the order was saved.
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
    -- Edit: a full replace of the editable fields and lines. Code, status,
    -- payments and created_at are left alone (status and paid go through
    -- update_admin_order() and the payment RPCs).
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
      coupon_valid = v_coupon_valid
    where id = p_id
    returning * into v_order;

    delete from public.order_lines where order_id = p_id;
  else
    if coalesce(jsonb_typeof(v_input -> 'status'), 'null') <> 'null' then
      v_status := public.order_check_status(v_input -> 'status');
    end if;

    if coalesce(jsonb_typeof(v_input -> 'paid'), 'null') <> 'null' then
      v_paid := public.order_check_boolean(v_input -> 'paid', 'paid');
    end if;

    -- How they paid, only with paid: true. A form may send them empty
    -- (null) when not paid; that's the same as leaving them out.
    v_paid_method := public.order_check_paid_method(v_input -> 'paid_method');
    v_paid_note := public.order_check_paid_note(v_input -> 'paid_note');
    if not v_paid and (v_paid_method is not null or v_paid_note is not null) then
      raise exception using message = 'Mark it paid to say how they paid.', errcode = '22023';
    end if;
    perform public.order_check_paid_pair(v_paid_method, v_paid_note);

    -- Back-dating a notebook entry is fine; the future isn't. Five minutes
    -- of slack covers a phone clock that runs a little fast.
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

    -- A code typed from a WhatsApp message, or a fresh one.
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

    insert into public.orders (
      code, source, status, name, pincode, phone, note, amount,
      coupon_code, coupon_id, coupon_valid, created_at, created_by
    ) values (
      v_code, v_source, v_status,
      v_name, v_pincode, v_phone, v_note, v_amount,
      v_coupon, v_coupon_id, v_coupon_valid, v_created_at, auth.uid()
    ) returning * into v_order;

    if v_paid then
      perform public.order_pay_rest(v_order.id, v_paid_method, v_paid_note, null);
    end if;
  end if;

  insert into public.order_lines (order_id, product_id, size, quantity)
  select v_order.id, line ->> 'product_id', line ->> 'size', (line ->> 'quantity')::integer
  from jsonb_array_elements(v_lines) line;

  select * into v_order from public.orders where id = v_order.id;
  return public.admin_order_json(v_order);
end;
$$;

revoke all on function public.save_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.save_admin_order(uuid, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 8. Payment RPCs
-- ═══════════════════════════════════════════════════════

-- "Part payment…": one payment of a typed amount. The order needs a total
-- first. Allowed on a paid order too (it shows as extra).
-- p_payment: { amount, method, note?, paid_at? }. Returns the order JSON.
create or replace function public.add_admin_payment(p_order_id uuid, p_payment jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_amount integer;
  v_method text;
  v_note text;
  v_paid_at timestamptz;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  perform public.order_check_keys(p_payment, array['amount', 'method', 'note', 'paid_at']);

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;

  if v_order.amount is null then
    raise exception using message = 'Add the order total first.', errcode = '22023';
  end if;

  v_amount := public.order_check_payment_amount(p_payment -> 'amount');
  v_method := public.order_check_paid_method(p_payment -> 'method');
  if v_method is null then
    raise exception using message = 'Choose UPI, Cash, Bank transfer or Other.', errcode = '22023';
  end if;
  v_note := public.order_check_paid_note(p_payment -> 'note');
  perform public.order_check_paid_pair(v_method, v_note);
  v_paid_at := public.order_check_payment_date(p_payment -> 'paid_at');

  insert into public.order_payments (order_id, amount, method, note, paid_at, created_by)
  values (p_order_id, v_amount, v_method, v_note, v_paid_at, auth.uid());

  select * into v_order from public.orders where id = p_order_id;
  return public.admin_order_json(v_order);
end;
$$;

revoke all on function public.add_admin_payment(uuid, jsonb) from public, anon;
grant execute on function public.add_admin_payment(uuid, jsonb) to authenticated;

-- "Mark paid": one payment for whatever is left (the whole total, the rest
-- after part payments, or no amount when there's no total).
-- p_payment: { method, note?, paid_at? }. Returns the order JSON.
create or replace function public.pay_admin_order_rest(p_order_id uuid, p_payment jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_method text;
  v_note text;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  perform public.order_check_keys(p_payment, array['method', 'note', 'paid_at']);

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;

  v_method := public.order_check_paid_method(p_payment -> 'method');
  if v_method is null then
    raise exception using message = 'Choose UPI, Cash, Bank transfer or Other.', errcode = '22023';
  end if;
  v_note := public.order_check_paid_note(p_payment -> 'note');
  perform public.order_check_paid_pair(v_method, v_note);

  perform public.order_pay_rest(
    p_order_id, v_method, v_note, public.order_check_payment_date(p_payment -> 'paid_at')
  );

  select * into v_order from public.orders where id = p_order_id;
  return public.admin_order_json(v_order);
end;
$$;

revoke all on function public.pay_admin_order_rest(uuid, jsonb) from public, anon;
grant execute on function public.pay_admin_order_rest(uuid, jsonb) to authenticated;

-- A mistake is fixed by deleting the payment and adding it again. Returns the
-- order JSON. Undo is restore_admin_payments() with the payment from before.
create or replace function public.delete_admin_payment(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select p.order_id into v_order_id from public.order_payments p where p.id = p_id;
  if v_order_id is null then
    raise exception using message = 'That payment is gone.', errcode = '22023';
  end if;

  perform 1 from public.orders where id = v_order_id for update;
  delete from public.order_payments where id = p_id;

  select * into v_order from public.orders where id = v_order_id;
  return public.admin_order_json(v_order);
end;
$$;

revoke all on function public.delete_admin_payment(uuid) from public, anon;
grant execute on function public.delete_admin_payment(uuid) to authenticated;

-- Undo for delete_admin_payment() and for paid: false: puts payments back as
-- the order JSON listed them, with the same ids. A payment whose id is
-- already there is skipped, so a double tap on Undo is harmless. Whoever
-- restores it becomes who added it.
-- p_payments: [{ id, amount, method, note, paid_at }], 1 to 50. amount is
-- null only while the order has no total, and method may be null (payments
-- from before methods existed). Returns the order JSON.
create or replace function public.restore_admin_payments(p_order_id uuid, p_payments jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_id uuid;
  v_amount integer;
  v_method text;
  v_note text;
  v_paid_at timestamptz;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array'
     or jsonb_array_length(p_payments) not between 1 and 50 then
    raise exception using message = 'Nothing to put back.', errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception using message = 'That order is gone.', errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_payments) loop
    perform public.order_check_keys(v_item, array['id', 'amount', 'method', 'note', 'paid_at']);

    begin
      v_id := (v_item ->> 'id')::uuid;
    exception
      when others then
        v_id := null;
    end;
    if v_id is null or jsonb_typeof(v_item -> 'paid_at') is distinct from 'string' then
      raise exception using message = 'That payment doesn''t look right.', errcode = '22023';
    end if;

    if coalesce(jsonb_typeof(v_item -> 'amount'), 'null') = 'null' then
      if v_order.amount is not null then
        raise exception using message = 'Type how much they paid.', errcode = '22023';
      end if;
      v_amount := null;
    else
      if v_order.amount is null then
        raise exception using message = 'Add the order total first.', errcode = '22023';
      end if;
      -- 0 is allowed back: it's the rest of a ₹0 order.
      v_amount := public.order_check_amount(v_item -> 'amount');
    end if;

    v_method := public.order_check_paid_method(v_item -> 'method');
    v_note := public.order_check_paid_note(v_item -> 'note');
    perform public.order_check_paid_pair(v_method, v_note);
    v_paid_at := public.order_check_payment_date(v_item -> 'paid_at');

    insert into public.order_payments (id, order_id, amount, method, note, paid_at, created_by)
    values (v_id, p_order_id, v_amount, v_method, v_note, v_paid_at, auth.uid())
    on conflict (id) do nothing;
  end loop;

  select * into v_order from public.orders where id = p_order_id;
  return public.admin_order_json(v_order);
end;
$$;

revoke all on function public.restore_admin_payments(uuid, jsonb) from public, anon;
grant execute on function public.restore_admin_payments(uuid, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 9. get_admin_overview: money due and part paid
-- ═══════════════════════════════════════════════════════

-- Gains queue.to_send.part_paid, queue.to_collect.amount_due and part_paid,
-- and queue.on_the_way.part_paid. to_collect.amount stays the totals quoted
-- on those orders; amount_due is what's still owed on them (orders with no
-- total add nothing; they're in without_amount). "paid" and "not_paid" still
-- mean paid in full, so a part-paid order counts as not paid. Everything
-- else is as in 20260926000004.
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
  v_since_30 timestamptz := now() - interval '30 days';
  v_queue json;
  v_week json;
  v_selling json;
  v_coupons json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  -- The five to-do groups. For a delivered order, status_changed_at is when
  -- it became delivered (the same moment as its latest "delivered" event).
  select json_build_object(
    'to_confirm', count(*) filter (where o.status = 'new' and not public.order_is_stale(o)),
    'to_confirm_oldest', min(o.created_at) filter (where o.status = 'new' and not public.order_is_stale(o)),
    'to_send', json_build_object(
      'count', count(*) filter (where o.status = 'confirmed'),
      'paid', count(*) filter (where o.status = 'confirmed' and o.paid_at is not null),
      'part_paid', count(*) filter (where o.status = 'confirmed' and o.paid_at is null and pay.count > 0)
    ),
    'to_collect', json_build_object(
      'count', count(*) filter (where o.status = 'delivered' and o.paid_at is null),
      'amount', coalesce(sum(o.amount) filter (where o.status = 'delivered' and o.paid_at is null), 0),
      'amount_due', coalesce(sum(greatest(o.amount - pay.total, 0)) filter (
        where o.status = 'delivered' and o.paid_at is null and o.amount is not null
      ), 0),
      'part_paid', count(*) filter (where o.status = 'delivered' and o.paid_at is null and pay.count > 0),
      'without_amount', count(*) filter (
        where o.status = 'delivered' and o.paid_at is null and o.amount is null
      ),
      -- Distinct people: by phone where there is one, else by name.
      'people', count(distinct coalesce(o.phone, 'name:' || lower(o.name))) filter (
        where o.status = 'delivered' and o.paid_at is null
      ),
      'oldest', (
        select json_build_object('code', d.code, 'name', d.name, 'since', d.status_changed_at)
        from public.orders d
        where d.status = 'delivered' and d.paid_at is null
        order by d.status_changed_at, d.created_at
        limit 1
      )
    ),
    'on_the_way', json_build_object(
      'count', count(*) filter (where o.status = 'sent'),
      'not_paid', count(*) filter (where o.status = 'sent' and o.paid_at is null),
      'part_paid', count(*) filter (where o.status = 'sent' and o.paid_at is null and pay.count > 0)
    ),
    'stale', count(*) filter (where public.order_is_stale(o)),
    'stale_oldest', min(o.created_at) filter (where public.order_is_stale(o))
  ) into v_queue
  from public.orders o
  cross join lateral (
    select count(*) as count, coalesce(sum(p.amount), 0) as total
    from public.order_payments p
    where p.order_id = o.id
  ) pay
  where o.status in ('new', 'confirmed', 'sent', 'delivered');

  -- This week (Monday to Sunday, India time) and last week.
  with order_packs as (
    select
      o.id,
      o.phone,
      o.status,
      o.created_at,
      o.status_changed_at,
      (o.created_at at time zone 'Asia/Kolkata')::date as day,
      coalesce((select sum(l.quantity) from public.order_lines l where l.order_id = o.id), 0) as packs
    from public.orders o
    where o.created_at >= v_last_week_start and o.created_at < v_week_end
  ),
  this_week as (
    select * from order_packs
    where created_at >= v_week_start and status <> 'cancelled'
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
    -- Orders that became delivered or cancelled this week and still are, so
    -- an undone mis-tap isn't counted.
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
    -- Customers (by phone) with an order this week and an earlier
    -- not-cancelled order.
    'repeat_customers', (
      select count(distinct t.phone)
      from this_week t
      where t.phone is not null
        and exists (
          select 1 from public.orders p
          where p.phone = t.phone
            and p.status <> 'cancelled'
            and (p.created_at, p.id) < (t.created_at, t.id)
        )
    ),
    'last_week', (
      select json_build_object('orders', count(*), 'packs', coalesce(sum(packs), 0))
      from order_packs
      where created_at < v_week_start and status <> 'cancelled'
    )
  ) into v_week;

  -- Last 30 days, confirmed and later.
  select coalesce(json_agg(
    json_build_object('product_id', s.product_id, 'size', s.size, 'packs', s.packs, 'orders', s.orders)
    order by s.packs desc, s.orders desc, s.product_id, s.size
  ), '[]'::json) into v_selling
  from (
    select l.product_id, l.size, sum(l.quantity) as packs, count(distinct o.id) as orders
    from public.orders o
    join public.order_lines l on l.order_id = o.id
    where o.status in ('confirmed', 'sent', 'delivered')
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
    where o.status in ('confirmed', 'sent', 'delivered')
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
        'cancelled', count(*) filter (where o.status = 'cancelled')
      )
      from public.orders o
      where o.status in ('delivered', 'cancelled')
    ),
    'week', v_week,
    'selling', v_selling,
    'coupons', v_coupons,
    'email', json_build_object(
      -- Same rule as get_waitlist_count_stats() 'active'.
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

-- ═══════════════════════════════════════════════════════
-- 10. get_admin_totals: money in by payment, money due
-- ═══════════════════════════════════════════════════════

-- Changes from 20260926000008:
--   weeks.*.amount_in        now the payments dated in the week (not
--                            cancelled), each on its own date. Was: whole
--                            order amounts by the day the order was marked
--                            paid. The same numbers until part payments exist.
--   weeks.this.amount_by_method
--                            the same payments by their own method; they
--                            still add up to amount_in. Payments with no
--                            method (orders paid before methods) are
--                            not_recorded; payments with no amount add nothing.
-- Added keys (money stages only, never stale):
--   overall.<stage>.amount_due   ₹ still owed on the stage's orders that have
--                                a total (0 for paid ones).
--   overall.<stage>.part_paid    orders with a payment but not paid in full.
-- Unchanged: paid_orders and paid_without_amount still count orders that
-- became paid in full in the week (by orders.paid_at), and the stages, where
-- "paid" means paid in full. So to_collect already holds every delivered
-- order with money due. Everything else is as in 20260926000008.
create or replace function public.get_admin_totals()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_this_monday date := date_trunc('week', (now() at time zone 'Asia/Kolkata')::date)::date;
  v_this_start timestamptz := v_this_monday::timestamp at time zone 'Asia/Kolkata';
  v_last_start timestamptz := (v_this_monday - 7)::timestamp at time zone 'Asia/Kolkata';
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  return (
    with stages (stage, position) as (
      values ('to_confirm', 1), ('to_send', 2), ('on_the_way', 3), ('to_collect', 4), ('stale', 5)
    ),
    staged as (
      select o.id, o.amount, o.paid_at, o.name, o.created_at, o.status_changed_at,
        pay.count as payments, pay.total as amount_paid,
        case
          when public.order_is_stale(o) then 'stale'
          when o.status = 'new' then 'to_confirm'
          when o.status = 'confirmed' then 'to_send'
          when o.status = 'sent' then 'on_the_way'
          when o.status = 'delivered' and o.paid_at is null then 'to_collect'
        end as stage
      from public.orders o
      cross join lateral (
        select count(*) as count, coalesce(sum(p.amount), 0) as total
        from public.order_payments p
        where p.order_id = o.id
      ) pay
      where o.status in ('new', 'confirmed', 'sent', 'delivered')
    ),
    staged_lines as (
      select s.id, s.stage, l.product_id, l.quantity, w.grams_each,
        case
          when w.grams_each >= 1000 and w.grams_each % 1000 = 0 then (w.grams_each / 1000) || ' kg'
          else w.grams_each || ' g'
        end as size
      from staged s
      join public.order_lines l on l.order_id = s.id
      cross join lateral (
        select (substring(l.size from '^([0-9]+) ?(?:g|kg)$'))::integer
          * case when l.size ~ 'kg$' then 1000 else 1 end as grams_each
      ) w
      where s.stage is not null
    ),
    -- One cell per product and stage, zeros where the product has nothing.
    cells as (
      select p.product_id, st.stage, st.position,
        json_build_object(
          'orders', a.orders,
          'packs', a.packs,
          'grams', a.grams,
          'by_size', (
            select coalesce(json_agg(
              json_build_object('size', b.size, 'grams_each', b.grams_each, 'packs', b.packs)
              order by b.grams_each
            ), '[]'::json)
            from (
              select sl.size, sl.grams_each, sum(sl.quantity) as packs
              from staged_lines sl
              where sl.product_id = p.product_id and sl.stage = st.stage
              group by sl.grams_each, sl.size
            ) b
          )
        ) as cell
      from (select distinct product_id from staged_lines) p
      cross join stages st
      cross join lateral (
        select count(distinct sl.id) as orders,
          coalesce(sum(sl.quantity), 0) as packs,
          coalesce(sum(sl.quantity * sl.grams_each), 0) as grams
        from staged_lines sl
        where sl.product_id = p.product_id and sl.stage = st.stage
      ) a
    ),
    -- Who two stages are waiting on, as first names. A name shows once, where
    -- it first appears (ignoring case); an order with no name is counted in
    -- the totals but not named. to_collect goes by when it was delivered
    -- (status_changed_at, as the overview's oldest owed order), on_the_way by
    -- when it was ordered.
    waiting_names as (
      select n.list, (array_agg(n.first_name order by n.rn))[1] as first_name, min(n.rn) as rn
      from (
        select 'without_amount_names' as list, split_part(btrim(x.name), ' ', 1) as first_name,
          row_number() over (order by x.status_changed_at, x.created_at, x.id) as rn
        from staged x
        where x.stage = 'to_collect' and x.amount is null and nullif(btrim(x.name), '') is not null
        union all
        select 'unpaid_names', split_part(btrim(x.name), ' ', 1),
          row_number() over (order by x.created_at, x.id)
        from staged x
        where x.stage = 'on_the_way' and x.paid_at is null and nullif(btrim(x.name), '') is not null
      ) n
      group by n.list, lower(n.first_name)
    ),
    -- Stale orders never came through, so they carry no money. to_collect
    -- and on_the_way add up to 3 waiting names.
    overall as (
      select st.stage, st.position,
        jsonb_build_object(
          'orders', count(s.id),
          'packs', coalesce((
            select sum(sl.quantity) from staged_lines sl where sl.stage = st.stage
          ), 0)
        )
        || case when st.stage = 'stale' then '{}'::jsonb else jsonb_build_object(
          'amount', coalesce(sum(s.amount), 0),
          'without_amount', count(s.id) filter (where s.amount is null),
          'paid', count(s.id) filter (where s.paid_at is not null),
          'unpaid_amount', coalesce(sum(s.amount) filter (where s.paid_at is null), 0),
          'amount_due', coalesce(sum(greatest(s.amount - s.amount_paid, 0)) filter (where s.amount is not null), 0),
          'part_paid', count(s.id) filter (where s.paid_at is null and s.payments > 0)
        ) end
        || case
          when st.stage in ('to_collect', 'on_the_way') then (
            select jsonb_build_object(
              case st.stage when 'to_collect' then 'without_amount_names' else 'unpaid_names' end,
              coalesce(jsonb_agg(w.first_name order by w.rn), '[]'::jsonb)
            )
            from (
              select wn.first_name, wn.rn
              from waiting_names wn
              where wn.list = case st.stage when 'to_collect' then 'without_amount_names' else 'unpaid_names' end
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
    real_orders as (
      select o.created_at,
        (o.created_at at time zone 'Asia/Kolkata')::date as day,
        coalesce((select sum(l.quantity) from public.order_lines l where l.order_id = o.id), 0) as packs
      from public.orders o
      where o.status in ('confirmed', 'sent', 'delivered')
    ),
    real_lines as (
      select o.id, o.created_at, l.product_id, l.quantity
      from public.orders o
      join public.order_lines l on l.order_id = o.id
      where o.status in ('confirmed', 'sent', 'delivered')
    ),
    -- Orders paid in full, by when they got there.
    paid as (
      select o.paid_at, o.amount
      from public.orders o
      where o.status <> 'cancelled' and o.paid_at is not null
    ),
    -- Money in: every payment on a not-cancelled order, by its own date.
    payments_in as (
      select p.paid_at, coalesce(p.amount, 0) as amount, p.method
      from public.order_payments p
      join public.orders o on o.id = p.order_id
      where o.status <> 'cancelled'
    ),
    -- A null ends_at means "up to now", with no upper bound. monday is the
    -- India date the week starts, for its days.
    weeks (key, position, monday, starts_at, ends_at) as (
      values
        ('this', 1, v_this_monday, v_this_start, null::timestamptz),
        ('last', 2, v_this_monday - 7, v_last_start, v_this_start),
        ('last_so_far', 3, v_this_monday - 7, v_last_start, now() - interval '7 days')
    )
    select json_build_object(
      'as_of', now(),
      -- The earliest real order, so the app knows when there's no last week yet.
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
            )
          )
          -- This week and last: the 7 days, Monday to Sunday, same rule.
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
          -- This week and last week so far: each product's packs and orders.
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
          -- This week: the money in by how each payment was made. The five add
          -- up to amount_in. A payment with no method (from an order marked
          -- paid before 20260926000007) is not_recorded.
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
      )
    )
  );
end;
$$;

revoke all on function public.get_admin_totals() from public, anon;
grant execute on function public.get_admin_totals() to authenticated;
