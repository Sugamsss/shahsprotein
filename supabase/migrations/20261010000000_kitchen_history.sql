-- Migration: 20261010000000_kitchen_history.sql
-- Cooking history: a permanent, append-only record of every batch logged,
-- changed or deleted, and every used up / thrown out write-off (and its
-- removal). Filled by row triggers, so every kitchen path writes it, and never
-- purged: it isn't the undo log (kitchen_actions is kept 7 days, and stays so).
-- An Undo appends its own compensating rows (action_kind 'undo'); nothing is
-- ever deleted from here. Previews roll back with their transaction, so they
-- leave nothing behind. Add only: no existing row, function or trigger changes.
--
-- Admin only through get_admin_kitchen_history(). See supabase/README.md,
-- "The kitchen", for the shape.

-- ═══════════════════════════════════════════════════════
-- 1. The table
-- ═══════════════════════════════════════════════════════

create table if not exists public.kitchen_history (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default timezone('utc', now()),
  by uuid references auth.users(id) on delete set null,
  -- No foreign key: batches get deleted, and their history stays.
  batch_id uuid not null,
  product_id text not null,
  event text not null check (event in (
    'logged', 'changed', 'deleted', 'used_up', 'thrown_out', 'writeoff_removed'
  )),
  -- The batch's grams after the event (for a deleted batch, what it had). For
  -- a write-off event, the grams written off.
  grams integer not null check (grams > 0),
  -- Only for 'changed', and only when that field changed.
  old_grams integer check (old_grams > 0),
  made_on date,
  old_made_on date,
  -- The reason, for write-off events only.
  reason text check (reason in ('used_up', 'thrown_out')),
  -- The kitchen_actions.kind of the call that wrote the row, or 'undo' when
  -- an Undo put it back. Null for rows from before this migration.
  action_kind text,
  constraint kitchen_history_changed_check check (
    event = 'changed' or (old_grams is null and old_made_on is null)
  ),
  constraint kitchen_history_writeoff_check check (
    (event in ('used_up', 'thrown_out', 'writeoff_removed')) = (reason is not null)
  )
);

create index if not exists kitchen_history_at_idx
  on public.kitchen_history (at desc);

create index if not exists kitchen_history_batch_idx
  on public.kitchen_history (batch_id, at);

alter table public.kitchen_history enable row level security;
revoke all on public.kitchen_history from anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Who wrote it
-- ═══════════════════════════════════════════════════════

-- The kind of the open kitchen call, or 'undo' while undo_admin_kitchen() puts
-- rows back. Undo clears shahs.kitchen_action and sets shahs.no_events to 'on'
-- (the same mark that keeps the undo log quiet), and no normal kitchen call
-- does both, so this tells the two apart without touching undo itself.
create or replace function public.kitchen_history_kind()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_action uuid := nullif(current_setting('shahs.kitchen_action', true), '')::uuid;
  v_kind text;
begin
  if v_action is not null then
    select k.kind into v_kind from public.kitchen_actions k where k.id = v_action;
    return v_kind;
  end if;

  if coalesce(current_setting('shahs.no_events', true), '') = 'on' then
    return 'undo';
  end if;

  return null;
end;
$$;

revoke all on function public.kitchen_history_kind() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. The triggers
-- ═══════════════════════════════════════════════════════

create or replace function public.kitchen_history_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := public.kitchen_history_kind();
begin
  if tg_op = 'INSERT' then
    insert into public.kitchen_history (by, batch_id, product_id, event, grams, made_on, action_kind)
    values (auth.uid(), new.id, new.product_id, 'logged', new.grams, new.made_on, v_kind);
  elsif tg_op = 'UPDATE' then
    -- Only a real change of grams or made_on is history. A save that
    -- changes neither (the updated_at stamp alone) records nothing.
    if old.grams is distinct from new.grams or old.made_on is distinct from new.made_on then
      insert into public.kitchen_history (
        by, batch_id, product_id, event, grams, old_grams, made_on, old_made_on, action_kind
      )
      values (
        auth.uid(), new.id, new.product_id, 'changed', new.grams,
        case when old.grams is distinct from new.grams then old.grams end,
        new.made_on,
        case when old.made_on is distinct from new.made_on then old.made_on end,
        v_kind
      );
    end if;
  else
    insert into public.kitchen_history (by, batch_id, product_id, event, grams, made_on, action_kind)
    values (auth.uid(), old.id, old.product_id, 'deleted', old.grams, old.made_on, v_kind);
  end if;

  return null;
end;
$$;

revoke all on function public.kitchen_history_batch() from public, anon, authenticated;

drop trigger if exists trg_kitchen_batches_history on public.kitchen_batches;
create trigger trg_kitchen_batches_history
  after insert or update or delete on public.kitchen_batches
  for each row execute function public.kitchen_history_batch();

create or replace function public.kitchen_history_writeoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := public.kitchen_history_kind();
  v_batch public.kitchen_batches;
begin
  -- The batch is always there: a write-off keeps its batch from being deleted,
  -- and a delete of the write-offs runs before the batch's.
  if tg_op = 'INSERT' then
    select * into v_batch from public.kitchen_batches where id = new.batch_id;
    insert into public.kitchen_history (by, batch_id, product_id, event, grams, made_on, reason, action_kind)
    values (
      auth.uid(), new.batch_id, v_batch.product_id,
      case when new.reason = 'used_up' then 'used_up' else 'thrown_out' end,
      new.grams, v_batch.made_on, new.reason, v_kind
    );
  else
    select * into v_batch from public.kitchen_batches where id = old.batch_id;
    insert into public.kitchen_history (by, batch_id, product_id, event, grams, made_on, reason, action_kind)
    values (auth.uid(), old.batch_id, v_batch.product_id, 'writeoff_removed',
      old.grams, v_batch.made_on, old.reason, v_kind);
  end if;

  return null;
end;
$$;

revoke all on function public.kitchen_history_writeoff() from public, anon, authenticated;

drop trigger if exists trg_kitchen_writeoffs_history on public.kitchen_writeoffs;
create trigger trg_kitchen_writeoffs_history
  after insert or delete on public.kitchen_writeoffs
  for each row execute function public.kitchen_history_writeoff();

-- ═══════════════════════════════════════════════════════
-- 4. Backfill: what the database already holds
-- ═══════════════════════════════════════════════════════

-- One logged row per batch, at when it was logged. Batches changed before
-- this migration show their current grams and made-on day (what was there
-- before isn't recorded anywhere).
insert into public.kitchen_history (at, by, batch_id, product_id, event, grams, made_on, action_kind)
select b.created_at, b.created_by, b.id, b.product_id, 'logged', b.grams, b.made_on, null
from public.kitchen_batches b;

-- One row per existing write-off, at when it was made.
insert into public.kitchen_history (at, by, batch_id, product_id, event, grams, made_on, reason, action_kind)
select w.created_at, w.created_by, w.batch_id, b.product_id,
  case when w.reason = 'used_up' then 'used_up' else 'thrown_out' end,
  w.grams, b.made_on, w.reason, null
from public.kitchen_writeoffs w
join public.kitchen_batches b on b.id = w.batch_id;

-- ═══════════════════════════════════════════════════════
-- 5. The admin's read
-- ═══════════════════════════════════════════════════════

-- Newest first. Paging: pass the last entry's `at` as p_before. A page never
-- splits entries saved at the same moment (one call writes several rows at
-- once): when the limit falls inside such a group, the whole group is
-- included, so `more` plus the last `at` picks up exactly where it stopped.
-- by_name is the display name only (never an email).
create or replace function public.get_admin_kitchen_history(
  p_batch_id uuid default null,
  p_product_id text default null,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  with f as (
    select h.*
    from public.kitchen_history h
    where (p_batch_id is null or h.batch_id = p_batch_id)
      and (p_product_id is null or h.product_id = p_product_id)
      and (p_before is null or h.at < p_before)
  ),
  cut as (
    -- The entry just past the page. Nothing there: this is the last page.
    select x.at from f x order by x.at desc, x.id desc offset v_limit limit 1
  ),
  page as (
    select f.* from f
    where not exists (select 1 from cut)
      or f.at >= (select c.at from cut c)
  )
  select json_build_object(
    'entries', coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'at', p.at,
        'by', p.by,
        'by_name', a.display_name,
        'batch_id', p.batch_id,
        'product_id', p.product_id,
        'event', p.event,
        'grams', p.grams,
        'old_grams', p.old_grams,
        'made_on', p.made_on,
        'old_made_on', p.old_made_on,
        'reason', p.reason,
        'action_kind', p.action_kind
      ) order by p.at desc, p.id desc)
      from page p
      left join public.admin_users a on a.id = p.by
    ), '[]'::json),
    'more', exists (select 1 from cut)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_admin_kitchen_history(uuid, text, timestamptz, integer) from public, anon;
grant execute on function public.get_admin_kitchen_history(uuid, text, timestamptz, integer) to authenticated;
