-- Migration: 20261114000000_admin_expenses.sql
-- Expenses both owners record: packaging, courier, raw material, anything paid out.
-- Both owners can view, edit and delete every expense. No who-added-it, no
-- categories, no attachments, no exports, no dashboard totals, no analytics.
--
-- Stored once: `admin_expenses` (India date + time, title, optional note, whole
-- rupees; delete only sets `deleted_at` so Undo can bring it back). The date and
-- time are India civil time, labelled IST in the admin; they are never
-- device-local or UTC sliced. Audit stamps stay UTC.
--
-- Ships after the app: the admin hides every expenses link while the RPCs
-- answer `missing` (see src/admin/expenses/available.ts). Deploy the code,
-- then run `supabase test db` on a local stack and `supabase db push`.
-- A rollback keeps every row; it only loses the RPCs that read and write them.

-- ═══════════════════════════════════════════════════════
-- 1. Table
-- ═══════════════════════════════════════════════════════

create table if not exists public.admin_expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null check (spent_on >= date '2026-01-01'),
  spent_at time(0) without time zone not null,
  title text not null check (char_length(btrim(title, E' \t\n\r')) between 1 and 200),
  note text not null default '' check (char_length(note) <= 4000),
  amount integer not null check (amount between 1 and 2147483647),
  -- These are audit stamps only, never shown. An admin who leaves keeps the
  -- expense: the link goes null rather than blocking their removal.
  created_by uuid references public.admin_users(id) on delete set null,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists admin_expenses_day_idx
  on public.admin_expenses (spent_on desc, spent_at desc, id desc)
  where deleted_at is null;

alter table public.admin_expenses enable row level security;
revoke all on public.admin_expenses from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. One row, as the admin reads it
-- ═══════════════════════════════════════════════════════

create or replace function public.expense_json(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id,
    'spent_on', e.spent_on,
    'spent_at', substring(e.spent_at::text, 1, 5),
    'title', e.title,
    'note', e.note,
    'amount', e.amount,
    'created_at', e.created_at,
    'updated_at', e.updated_at
  )
  from public.admin_expenses e
  where e.id = p_id and e.deleted_at is null;
$$;
revoke all on function public.expense_json(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. Reads: the list (inclusive start, exclusive end, up to five years)
-- ═══════════════════════════════════════════════════════

create or replace function public.get_admin_expenses(p_from date default null, p_to date default null, p_search text default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_from date := coalesce(p_from, (timezone('Asia/Kolkata', now()))::date - 31);
  v_to date := coalesce(p_to, (timezone('Asia/Kolkata', now()))::date + 1);
  v_search text := btrim(coalesce(p_search, ''));
  v_today date := (timezone('Asia/Kolkata', now()))::date;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  -- A real calendar day each end. One call may span up to five years, so the
  -- admin's "All" can list everything recorded (a few hundred rows a year).
  if v_from < date '2026-01-01' or v_to <= v_from or v_to - v_from > 1827 then
    raise exception using message = 'That range doesn''t look right.', errcode = '22023';
  end if;
  if char_length(v_search) > 200 then
    raise exception using message = 'That search is too long.', errcode = '22023';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'expenses', coalesce((
      select jsonb_agg(public.expense_json(e.id) order by e.spent_on desc, e.spent_at desc, e.id desc)
      from public.admin_expenses e
      where e.deleted_at is null
        and e.spent_on >= v_from and e.spent_on < v_to
        -- A plain substring on the title, note, amount and date, any case;
        -- never a pattern, so %, _ and \ match only themselves.
        and (v_search = '' or (
          strpos(lower(e.title), lower(v_search)) > 0
          or strpos(lower(e.note), lower(v_search)) > 0
          or strpos(e.amount::text, v_search) > 0
          or strpos(to_char(e.amount, 'FM999G999G999G990'), v_search) > 0
          or strpos(e.spent_on::text, v_search) > 0
          or strpos(lower(to_char(e.spent_on, 'DD Mon')), lower(v_search)) > 0
          or strpos(lower(to_char(e.spent_on, 'DD Month')), lower(v_search)) > 0
          or strpos(lower(to_char(e.spent_on, 'DD Mon YYYY')), lower(v_search)) > 0
          or strpos(lower(to_char(e.spent_on, 'DD Month YYYY')), lower(v_search)) > 0
          or strpos(substring(e.spent_at::text, 1, 5), v_search) > 0
        ))
    ), '[]'::jsonb)
  );
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 4. Writes: save (insert, or a full replace of the editable fields) and delete
-- ═══════════════════════════════════════════════════════

create or replace function public.save_admin_expense(p_id uuid, p_expense jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_on date;
  v_at time(0) without time zone;
  v_title text;
  v_note text := '';
  v_num numeric;
  v_amount integer;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if p_expense is null or jsonb_typeof(p_expense) <> 'object' then
    raise exception using message = 'That expense doesn''t look right.', errcode = '22023';
  end if;

  -- A real calendar date (a string like 2026-11-14).
  if (p_expense ->> 'spent_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception using message = 'That day doesn''t look right.', errcode = '22023';
  end if;
  begin
    v_on := (p_expense ->> 'spent_on')::date;
  exception when others then
    raise exception using message = 'That day doesn''t look right.', errcode = '22023';
  end;
  -- Matches what a date input accepts, and stays inside the same decade as the brand.
  -- An expense is money already paid: its day can't be ahead of India's today.
  if v_on < date '2026-01-01' then
    raise exception using message = 'That day doesn''t look right.', errcode = '22023';
  end if;
  if v_on > (timezone('Asia/Kolkata', now()))::date then
    raise exception using message = 'That day hasn''t happened yet.', errcode = '22023';
  end if;

  -- A real time of day (HH:MM, 24h).
  if (p_expense ->> 'spent_at') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using message = 'That time doesn''t look right.', errcode = '22023';
  end if;
  v_at := (p_expense ->> 'spent_at')::time(0);

  v_title := btrim(p_expense ->> 'title', E' \t\n\r');
  if v_title = '' or char_length(v_title) > 200 then
    raise exception using message = 'Give it a title, in up to 200 characters.', errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(p_expense -> 'note'), 'null') <> 'null' then
    if jsonb_typeof(p_expense -> 'note') <> 'string' then
      raise exception using message = 'That note doesn''t look right.', errcode = '22023';
    end if;
    v_note := btrim(p_expense ->> 'note', E' \t\n\r');
    if char_length(v_note) > 4000 then
      raise exception using message = 'That note is too long.', errcode = '22023';
    end if;
  end if;

  -- Whole rupees only: a decimal, a word, or anything outside 1..2^31-1 is refused.
  -- A number too big for an int still casts: to numeric, which always holds it.
  if coalesce(jsonb_typeof(p_expense -> 'amount'), 'null') <> 'number'
    or (p_expense ->> 'amount') !~ '^[0-9]+$' then
    raise exception using message = 'Just the number, like 500.', errcode = '22023';
  end if;
  v_num := (p_expense ->> 'amount')::numeric;
  if v_num < 1 or v_num > 2147483647 then
    raise exception using message = 'Just the number, like 500.', errcode = '22023';
  end if;
  v_amount := v_num::integer;

  if p_id is null then
    insert into public.admin_expenses (spent_on, spent_at, title, note, amount, created_by, updated_by)
    values (v_on, v_at, v_title, v_note, v_amount, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.admin_expenses
    set spent_on = v_on, spent_at = v_at, title = v_title, note = v_note, amount = v_amount,
      updated_by = auth.uid(), updated_at = timezone('utc', now())
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'That expense isn''t there any more.', errcode = '22023';
    end if;
  end if;
  return public.expense_json(v_id);
end;
$$;

-- Delete hides it; Undo (p_deleted false) brings it back as it was.
create or replace function public.delete_admin_expense(p_id uuid, p_deleted boolean default true)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  if coalesce(p_deleted, true) then
    update public.admin_expenses
    set deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where id = p_id and deleted_at is null returning id into v_id;
  else
    update public.admin_expenses
    set deleted_at = null, updated_at = timezone('utc', now())
    where id = p_id and deleted_at is not null returning id into v_id;
  end if;
  if v_id is null then
    raise exception using message = 'That expense isn''t there any more.', errcode = '22023';
  end if;
  return jsonb_build_object(
    'id', v_id,
    'deleted', coalesce(p_deleted, true),
    'deleted_at', (select deleted_at from public.admin_expenses where id = v_id)
  );
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 5. Who can call what
-- ═══════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_admin_expenses(date, date, text)',
    'public.save_admin_expense(uuid, jsonb)',
    'public.delete_admin_expense(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
