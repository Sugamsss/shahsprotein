-- Held in Cooking (2026-09-30).
--
-- Sunit can take an order from Packing or Ready back to Cooking by hand. The
-- order goes to Cooking "held": it keeps its real batch food (nothing becomes
-- spare), its by-hand part goes (that was never food), and the kitchen never
-- moves it to Packing by itself again. It leaves Cooking only when a person
-- moves it (Move to Packing, any other status, or cancel). Only Packing ->
-- Cooking and Ready -> Cooking hold; Delivered -> Cooking and every automatic
-- move to Cooking are as before.
--
-- A Ready order's by-hand part can include food that kitchen_take_back turned
-- into by-hand when a batch shrank while the order was Ready. That was already
-- the rule for Ready -> Cooking, and it stays: that part goes too.
--
-- Additive: an old admin ignores the new `held` key. Everything below is
-- create or replace of the kitchen_flow functions, with the hold added.

-- ═══════════════════════════════════════════════════════
-- 1. The flag
-- ═══════════════════════════════════════════════════════

alter table public.orders
  add column if not exists kitchen_hold boolean not null default false;

alter table public.orders drop constraint if exists orders_kitchen_hold_check;
alter table public.orders
  add constraint orders_kitchen_hold_check check (not kitchen_hold or status = 'cooking');

-- A hold never outlives Cooking: any status change (cancel, Move to Packing,
-- the rules, Undo) clears it. BEFORE, so it runs ahead of the check above.
create or replace function public.clear_kitchen_hold()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'cooking' then
    new.kitchen_hold := false;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_kitchen_hold() from public, anon, authenticated;

drop trigger if exists trg_orders_clear_hold on public.orders;
create trigger trg_orders_clear_hold
  before update on public.orders
  for each row execute function public.clear_kitchen_hold();

-- ═══════════════════════════════════════════════════════
-- 2. The undo log records the hold
-- ═══════════════════════════════════════════════════════

-- Orders record their id, status, priority, hold and when the status began.
-- A step logged before this migration has no kitchen_hold key: it reads false.
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
    v_old := jsonb_build_object('id', old.id, 'status', old.status, 'priority', old.priority,
      'kitchen_hold', old.kitchen_hold, 'status_changed_at', old.status_changed_at);
    v_new := jsonb_build_object('id', new.id, 'status', new.status, 'priority', new.priority,
      'kitchen_hold', new.kitchen_hold, 'status_changed_at', new.status_changed_at);
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

drop trigger if exists trg_orders_kitchen_log on public.orders;
create trigger trg_orders_kitchen_log
  after update of status, priority, kitchen_hold on public.orders
  for each row
  when (old.status is distinct from new.status or old.priority is distinct from new.priority
        or old.kitchen_hold is distinct from new.kitchen_hold)
  execute function public.kitchen_log_step();

-- ═══════════════════════════════════════════════════════
-- 3. The rules
-- ═══════════════════════════════════════════════════════

-- Cooking orders (one, or all with that product) covered on every product
-- move to Packing. A held order stays in Cooking.
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
    where o.status = 'cooking' and not o.kitchen_hold
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

-- The one fill rule, as in kitchen_flow, except a held order is never a donor
-- to a priority order (its food stays reserved for it). A held order that is
-- short is still topped up from spare like any Cooking order; it just isn't
-- promoted afterwards (kitchen_promote skips it).
create or replace function public.kitchen_fill(p_product_id text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_short integer;
  v_donor record;
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

    -- Never for a sample: a priority order short only on its samples waits.
    continue when v_short <= coalesce((
      select sum(l.quantity * l.grams_each) from public.order_lines l
      where l.order_id = v_id and l.product_id = p_product_id and l.size = 'sample'
    ), 0);

    -- Only when it completes the line: taking part of it would make another
    -- order wait while this one still waits (it gets the next batch first).
    -- A giver keeps what its own samples need.
    continue when coalesce((
      select sum(greatest(g.grams - g.samples, 0))
      from (
        select a.order_id, sum(a.grams) as grams,
          coalesce((select sum(l.quantity * l.grams_each) from public.order_lines l
                    where l.order_id = a.order_id and l.product_id = p_product_id and l.size = 'sample'), 0) as samples
        from public.kitchen_allocations a
        join public.orders d on d.id = a.order_id
        where d.status = 'cooking' and not d.priority and not d.kitchen_hold
          and a.product_id = p_product_id and a.batch_id is not null
        group by a.order_id
      ) g
    ), 0) < v_short;

    for v_donor in
      select d.id,
        greatest(
          (select sum(a.grams) from public.kitchen_allocations a
           where a.order_id = d.id and a.product_id = p_product_id and a.batch_id is not null)
          - coalesce((select sum(l.quantity * l.grams_each) from public.order_lines l
                      where l.order_id = d.id and l.product_id = p_product_id and l.size = 'sample'), 0),
          0)::integer as spare_for_priority
      from public.orders d
      where d.status = 'cooking' and not d.priority and not d.kitchen_hold
        and exists (
          select 1 from public.kitchen_allocations a
          where a.order_id = d.id and a.product_id = p_product_id and a.batch_id is not null
        )
      order by d.created_at desc, d.id desc
      for update of d
    loop
      continue when v_donor.spare_for_priority = 0;
      v_short := v_short - public.kitchen_move_grams(v_donor.id, v_id, p_product_id,
        least(v_short, v_donor.spare_for_priority), true);
      exit when v_short = 0;
    end loop;
  end loop;

  perform public.kitchen_promote(p_product_id);
end;
$$;

revoke all on function public.kitchen_fill(text) from public, anon, authenticated;

-- What a status change does to the kitchen, as in kitchen_flow. The one
-- change: → cooking from Packing or Ready is allowed when the order is held
-- (the caller sets kitchen_hold in the same update as the status). The by-hand part
-- goes, the batch food stays, the fill can top it up but not promote it.
-- Delivered → Cooking still refuses when batch food covers it all.
create or replace function public.kitchen_order_moved(p_order_id uuid, p_from text, p_to text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_products text[];
  v_held boolean;
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
    select o.kitchen_hold into v_held from public.orders o where o.id = p_order_id;

    if p_from in ('packing', 'ready', 'delivered')
       and not (p_from in ('packing', 'ready') and coalesce(v_held, false))
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

-- ═══════════════════════════════════════════════════════
-- 4. Undo puts the hold back too
-- ═══════════════════════════════════════════════════════

-- As in kitchen_flow, with the hold: an order row is put back only if status,
-- priority and hold are still as the step left them. A step with no
-- kitchen_hold key (logged before this migration) reads false.
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
    set status = v_old ->> 'status', priority = (v_old ->> 'priority')::boolean,
      kitchen_hold = coalesce((v_old ->> 'kitchen_hold')::boolean, false),
      status_changed_at = (v_old ->> 'status_changed_at')::timestamptz
    where id = v_id and status = v_new ->> 'status' and priority = (v_new ->> 'priority')::boolean
      and kitchen_hold = coalesce((v_new ->> 'kitchen_hold')::boolean, false);
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
-- 5. The order JSON says if it's held
-- ═══════════════════════════════════════════════════════

-- As in kitchen_flow plus `held` (boolean): in Cooking by a person's hand, so
-- the kitchen won't move it on. Every order answer is built from this.
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

-- ═══════════════════════════════════════════════════════
-- 6. Moving back to Cooking holds
-- ═══════════════════════════════════════════════════════

-- As in kitchen_flow, plus: a call that moves the order from Packing or Ready
-- to Cooking sets kitchen_hold in the same update as the status, before the fill
-- runs. Nothing else sets it, and any other update leaves it as it was (the
-- trigger clears it when the status leaves Cooking).
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
      'status', 'status_changed_at', 'paid', 'paid_method', 'paid_note', 'phone', 'amount', 'note', 'name', 'pincode', 'priority'
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
    kitchen_hold = case when v_from in ('packing', 'ready') and v_order.status = 'cooking' then true else kitchen_hold end,
    status_changed_at = coalesce(v_changed_at, status_changed_at),
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

revoke all on function public.update_admin_order(uuid, jsonb) from public, anon;
grant execute on function public.update_admin_order(uuid, jsonb) to authenticated;
