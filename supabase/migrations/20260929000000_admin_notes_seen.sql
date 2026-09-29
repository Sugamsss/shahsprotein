-- Migration: 20260929000000_admin_notes_seen.sql
-- "What's new" in the admin. The notes themselves live in the frontend code;
-- the server only keeps, per admin, the id of the last note they've seen, so
-- it follows them across phones and the home-screen app.
--
-- 1. admin_users.notes_seen: null (nothing seen yet) or a note id of 1 to 80
--    characters.
-- 2. set_admin_notes_seen(p_id): stores an id on the caller's own row. It
--    doesn't decide what's newest; the admin sends the id it wants kept.
--    Ids look like 2026-09-29-contacts-button.
-- 3. get_admin_me() returns notes_seen too.
--
-- Validation errors use errcode 22023 with a plain message.

-- ═══════════════════════════════════════════════════════
-- 1. Column
-- ═══════════════════════════════════════════════════════

alter table public.admin_users
  add column if not exists notes_seen text
    constraint admin_users_notes_seen_check
    check (notes_seen is null or char_length(notes_seen) between 1 and 80);

-- ═══════════════════════════════════════════════════════
-- 2. set_admin_notes_seen(p_id)
-- ═══════════════════════════════════════════════════════

create or replace function public.set_admin_notes_seen(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_id is null or p_id !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]{1,60}$' then
    raise exception using message = 'That isn''t a note we know.', errcode = '22023';
  end if;

  update public.admin_users set notes_seen = p_id where id = auth.uid();
end;
$$;

revoke all on function public.set_admin_notes_seen(text) from public, anon;
grant execute on function public.set_admin_notes_seen(text) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. get_admin_me(), with notes_seen
-- ═══════════════════════════════════════════════════════

-- The admin's auth gate. Raises for anyone who isn't an admin. The same as
-- in 20260926000006, plus notes_seen.
create or replace function public.get_admin_me()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin public.admin_users;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select * into v_admin from public.admin_users where id = auth.uid();

  return json_build_object(
    'id', v_admin.id,
    'email', v_admin.email,
    'display_name', v_admin.display_name,
    'home_view', v_admin.home_view,
    'notes_seen', v_admin.notes_seen
  );
end;
$$;

revoke all on function public.get_admin_me() from public, anon;
grant execute on function public.get_admin_me() to authenticated;
