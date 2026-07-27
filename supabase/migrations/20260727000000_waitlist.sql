create extension if not exists pgcrypto;

create table if not exists public.waitlist_members (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'hero',
  product_id text,
  theme text check (theme in ('light', 'dark')),
  marketing_consent boolean not null default false,
  consented_at timestamptz,
  consent_version text,
  signed_up_at timestamptz not null default timezone('utc', now()),
  verified_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists waitlist_members_email_unique
  on public.waitlist_members (lower(email));

create table if not exists public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  member_id uuid references public.waitlist_members(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  theme text check (theme in ('light', 'dark')),
  device_type text check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  section_dwell jsonb not null default '{}'::jsonb,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.waitlist_members enable row level security;
alter table public.analytics_sessions enable row level security;

revoke all on public.waitlist_members from anon, authenticated;
revoke all on public.analytics_sessions from anon, authenticated;

create or replace function public.submit_waitlist_member(
  p_email text,
  p_source text default 'hero',
  p_product_id text default null,
  p_theme text default null,
  p_marketing_consent boolean default false,
  p_consent_version text default null,
  p_session_key text default null,
  p_session_started_at timestamptz default null,
  p_session_ended_at timestamptz default null,
  p_active_seconds integer default 0,
  p_section_dwell jsonb default '{}'::jsonb,
  p_device_type text default 'unknown',
  p_referrer text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(p_email));
  existing_member public.waitlist_members;
  new_member public.waitlist_members;
begin
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using message = 'Please enter a valid email address.';
  end if;

  select * into existing_member
  from public.waitlist_members
  where lower(email) = normalized_email
  limit 1;

  if existing_member.id is not null then
    if p_session_key is not null and p_session_started_at is not null and p_session_ended_at is not null then
      insert into public.analytics_sessions (
        session_key, member_id, started_at, ended_at, active_seconds, theme,
        device_type, section_dwell, referrer, utm_source, utm_medium, utm_campaign
      ) values (
        left(p_session_key, 100), existing_member.id, p_session_started_at, p_session_ended_at,
        greatest(0, least(coalesce(p_active_seconds, 0), 86400)),
        case when p_theme in ('light', 'dark') then p_theme else null end,
        case when p_device_type in ('mobile', 'tablet', 'desktop') then p_device_type else 'unknown' end,
        coalesce(p_section_dwell, '{}'::jsonb), left(p_referrer, 500), left(p_utm_source, 100),
        left(p_utm_medium, 100), left(p_utm_campaign, 100)
      ) on conflict (session_key) do update set member_id = excluded.member_id;
    end if;

    return json_build_object(
      'success', true,
      'already_subscribed', true,
      'message', 'Love your enthusiasm! You''ve signed up already. We''ll make sure you''re the first one to get the updates as we launch.',
      'total_count', (select count(*) from public.waitlist_members)
    );
  end if;

  insert into public.waitlist_members (
    email, source, product_id, theme, marketing_consent, consented_at, consent_version
  ) values (
    normalized_email,
    left(coalesce(nullif(trim(p_source), ''), 'hero'), 80),
    nullif(left(trim(p_product_id), 120), ''),
    case when p_theme in ('light', 'dark') then p_theme else null end,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then timezone('utc', now()) else null end,
    case when coalesce(p_marketing_consent, false) then p_consent_version else null end
  ) returning * into new_member;

  if p_session_key is not null and p_session_started_at is not null and p_session_ended_at is not null then
    insert into public.analytics_sessions (
      session_key, member_id, started_at, ended_at, active_seconds, theme,
      device_type, section_dwell, referrer, utm_source, utm_medium, utm_campaign
    ) values (
      left(p_session_key, 100), new_member.id, p_session_started_at, p_session_ended_at,
      greatest(0, least(coalesce(p_active_seconds, 0), 86400)),
      case when p_theme in ('light', 'dark') then p_theme else null end,
      case when p_device_type in ('mobile', 'tablet', 'desktop') then p_device_type else 'unknown' end,
      coalesce(p_section_dwell, '{}'::jsonb), left(p_referrer, 500), left(p_utm_source, 100),
      left(p_utm_medium, 100), left(p_utm_campaign, 100)
    ) on conflict (session_key) do update set member_id = excluded.member_id;
  end if;

  return json_build_object(
    'success', true,
    'already_subscribed', false,
    'message', 'Welcome aboard! You''re on the VIP waitlist. We''ll keep you first in line for launch updates.',
    'total_count', (select count(*) from public.waitlist_members)
  );
exception
  when unique_violation then
    return json_build_object(
      'success', true,
      'already_subscribed', true,
      'message', 'Love your enthusiasm! You''ve signed up already. We''ll make sure you''re the first one to get the updates as we launch.',
      'total_count', (select count(*) from public.waitlist_members)
    );
end;
$$;

revoke all on function public.submit_waitlist_member from public;
grant execute on function public.submit_waitlist_member to anon, authenticated;
