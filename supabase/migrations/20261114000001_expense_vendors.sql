-- Migration: 20261114000001_expense_vendors.sql
-- Who an expense was paid to (20261114000000 added expenses themselves).
--
-- One new column, `admin_expenses.vendor`, an empty string when nobody is named
-- (the same convention as `note`: never null, so an old row and a cleared field
-- look the same). No backfill, no index: a few hundred rows a year.
--
-- The stored spelling is one per vendor, kept case-insensitively: if a vendor
-- already appears on a live expense, the server saves the spelling it already
-- has, so "satara packaging" never becomes a second vendor. Trimmed, and inner
-- runs of whitespace collapsed to one space.
--
-- Ships before its migration: the admin hides the Vendor field and sends no
-- `vendor` while `get_admin_expense_vendors` answers `missing` (see
-- src/admin/expenses/available.ts). Deploy the code, then `supabase test db`
-- and `supabase db push`.
--
-- Rollback: dropping the column loses only what was typed into it; every other
-- expense field stays. Old admin code keeps working because it never sends
-- `vendor`, and `save_admin_expense` then leaves the column alone.

-- ═══════════════════════════════════════════════════════
-- 1. The column
-- ═══════════════════════════════════════════════════════

alter table public.admin_expenses
  add column if not exists vendor text not null default ''
  check (char_length(vendor) <= 80);

-- ═══════════════════════════════════════════════════════
-- 2. One row, as the admin reads it (now with the vendor)
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
    'vendor', e.vendor,
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
-- 3. The list: same range and search, and the vendor is searched too
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
        -- A plain substring over the title, vendor, note, amount and date, any
        -- case; never a pattern, so %, _ and \ match only themselves.
        and (v_search = '' or (
          strpos(lower(e.title), lower(v_search)) > 0
          or strpos(lower(e.vendor), lower(v_search)) > 0
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
-- 4. Save: the same fields, and the vendor when the key is sent
-- ═══════════════════════════════════════════════════════

create or replace function public.save_admin_expense(p_id uuid, p_expense jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_on date;
  v_at time(0) without time zone;
  v_title text;
  v_vendor text := '';
  v_vendor_sent boolean := false;
  v_vendor_kept text;
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
  if v_on = (timezone('Asia/Kolkata', now()))::date
    and v_on + v_at > timezone('Asia/Kolkata', now()) then
    raise exception using message = 'That time hasn''t happened yet today.', errcode = '22023';
  end if;

  v_title := btrim(p_expense ->> 'title', E' \t\n\r');
  if v_title = '' or char_length(v_title) > 200 then
    raise exception using message = 'Give it a title, in up to 200 characters.', errcode = '22023';
  end if;

  -- The vendor is touched only when the key is in the object: a tab still
  -- running the old admin code edits an expense without it and keeps what's
  -- there. Trimmed, inner spaces collapsed, and snapped to the spelling an
  -- existing live row already uses for the same name, any case.
  if p_expense ? 'vendor' then
    v_vendor_sent := true;
    if coalesce(jsonb_typeof(p_expense -> 'vendor'), 'null') <> 'null' then
      if jsonb_typeof(p_expense -> 'vendor') <> 'string' then
        raise exception using message = 'That vendor doesn''t look right.', errcode = '22023';
      end if;
      v_vendor := regexp_replace(btrim(p_expense ->> 'vendor', E' \t\n\r'), '[[:space:]]+', ' ', 'g');
      if char_length(v_vendor) > 80 then
        raise exception using message = 'That vendor name is too long.', errcode = '22023';
      end if;
      if v_vendor <> '' then
        select e.vendor into v_vendor_kept
        from public.admin_expenses e
        -- The row being edited counts too: a vendor never changes its own
        -- spelling by case, and a typo is still fixed on that entry because a
        -- different name is a different vendor.
        where e.deleted_at is null
          and e.vendor <> ''
          and lower(e.vendor) = lower(v_vendor)
        order by e.spent_on desc, e.spent_at desc, e.id desc
        limit 1;
        if v_vendor_kept is not null then
          v_vendor := v_vendor_kept;
        end if;
      end if;
    end if;
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
    insert into public.admin_expenses (spent_on, spent_at, title, vendor, note, amount, created_by, updated_by)
    values (v_on, v_at, v_title, v_vendor, v_note, v_amount, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.admin_expenses
    set spent_on = v_on, spent_at = v_at, title = v_title, note = v_note, amount = v_amount,
      vendor = case when v_vendor_sent then v_vendor else vendor end,
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

-- ═══════════════════════════════════════════════════════
-- 5. The vendors used before: the sheet's suggestions
-- ═══════════════════════════════════════════════════════
-- Grouped case-insensitively over live rows only. `name` is the spelling on the
-- most recent entry, so a fixed typo becomes the suggestion from then on.
-- `last_used` is that entry's India day. Newest first, at most 200: the sheet
-- filters and shows five, in the browser, so typing is instant.

create or replace function public.get_admin_expense_vendors()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;
  with live as (
    select e.vendor, e.spent_on, e.spent_at, e.id, lower(e.vendor) as k
    from public.admin_expenses e
    where e.deleted_at is null and e.vendor <> ''
  ), newest as (
    select distinct on (k) k, vendor as name, spent_on, spent_at, id
    from live
    order by k, spent_on desc, spent_at desc, id desc
  ), counted as (
    select k, count(*) as n from live group by k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', nw.name,
    'count', c.n,
    'last_used', nw.spent_on
  ) order by nw.spent_on desc, nw.spent_at desc, nw.id desc), '[]'::jsonb)
  into v_out
  from (
    select nw.k, nw.name, nw.spent_on, nw.spent_at, nw.id
    from newest nw
    order by nw.spent_on desc, nw.spent_at desc, nw.id desc
    limit 200
  ) nw
  join counted c on c.k = nw.k;
  return v_out;
end;
$$;

-- ═══════════════════════════════════════════════════════
-- 6. Who can call what
-- ═══════════════════════════════════════════════════════

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.get_admin_expense_vendors()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
