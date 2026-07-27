create table if not exists public.waitlist_email_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.waitlist_members(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'unsubscribe')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.waitlist_email_tokens enable row level security;
revoke all on public.waitlist_email_tokens from anon, authenticated;

create or replace function public.issue_waitlist_email_token(
  p_email text,
  p_purpose text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  raw_token text := encode(gen_random_bytes(32), 'hex');
begin
  select id into v_member_id
  from public.waitlist_members
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_member_id is null or p_purpose not in ('verify', 'unsubscribe') then
    return null;
  end if;

  delete from public.waitlist_email_tokens
  where member_id = v_member_id
    and purpose = p_purpose
    and used_at is null;

  insert into public.waitlist_email_tokens (member_id, purpose, token_hash, expires_at)
  values (v_member_id, p_purpose, encode(digest(raw_token, 'sha256'), 'hex'), timezone('utc', now()) + interval '7 days');

  return raw_token;
end;
$$;

revoke all on function public.issue_waitlist_email_token from public;
grant execute on function public.issue_waitlist_email_token to service_role;

create or replace function public.consume_waitlist_email_token(
  p_token text,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.waitlist_email_tokens;
begin
  select * into token_row
  from public.waitlist_email_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and purpose = p_purpose
    and used_at is null
    and expires_at > timezone('utc', now())
  limit 1;

  if token_row.id is null then return false; end if;

  update public.waitlist_email_tokens
  set used_at = timezone('utc', now())
  where id = token_row.id;

  if p_purpose = 'verify' then
    update public.waitlist_members
    set verified_at = timezone('utc', now())
    where id = token_row.member_id;
  else
    update public.waitlist_members
    set unsubscribed_at = timezone('utc', now())
    where id = token_row.member_id;
  end if;

  return true;
end;
$$;

revoke all on function public.consume_waitlist_email_token from public;
grant execute on function public.consume_waitlist_email_token to service_role;

create or replace function public.purge_waitlist_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.analytics_sessions
  where created_at < timezone('utc', now()) - interval '24 months';

  delete from public.waitlist_email_tokens
  where expires_at < timezone('utc', now()) - interval '30 days';

  delete from public.waitlist_rate_limits
  where attempted_at < timezone('utc', now()) - interval '2 days';
end;
$$;

revoke all on function public.purge_waitlist_retention from public;
grant execute on function public.purge_waitlist_retention to service_role;
