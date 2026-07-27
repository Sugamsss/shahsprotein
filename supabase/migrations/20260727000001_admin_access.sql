create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create policy "Admins can read their own admin profile"
  on public.admin_users for select
  to authenticated
  using (auth.uid() = id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where id = auth.uid()
  );
$$;

revoke all on function public.is_admin from public;
grant execute on function public.is_admin to authenticated;

create index if not exists analytics_sessions_member_id_idx
  on public.analytics_sessions(member_id);
create index if not exists waitlist_members_signed_up_at_idx
  on public.waitlist_members(signed_up_at desc);
create index if not exists waitlist_members_source_idx
  on public.waitlist_members(source);

create table if not exists public.waitlist_rate_limits (
  request_key text not null,
  attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists waitlist_rate_limits_lookup_idx
  on public.waitlist_rate_limits(request_key, attempted_at desc);

alter table public.waitlist_rate_limits enable row level security;
revoke all on public.waitlist_rate_limits from anon, authenticated;

create or replace function public.enforce_waitlist_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_headers text := current_setting('request.headers', true);
  request_key text := 'unknown';
  attempts integer;
begin
  if request_headers is not null and request_headers <> '' then
    request_key := coalesce((request_headers::jsonb ->> 'x-forwarded-for'), (request_headers::jsonb ->> 'cf-connecting-ip'), 'unknown');
  end if;

  if request_key <> 'unknown' then
    delete from public.waitlist_rate_limits
    where attempted_at < timezone('utc', now()) - interval '1 hour';

    select count(*) into attempts
    from public.waitlist_rate_limits
    where request_key = left(encode(digest(request_key, 'sha256'), 'hex'), 64)
      and attempted_at > timezone('utc', now()) - interval '1 hour';

    if attempts >= 10 then
      raise exception using message = 'Too many signup attempts. Please try again later.';
    end if;

    insert into public.waitlist_rate_limits (request_key)
    values (left(encode(digest(request_key, 'sha256'), 'hex'), 64));
  end if;

  return new;
end;
$$;

drop trigger if exists waitlist_rate_limit_trigger on public.waitlist_members;
create trigger waitlist_rate_limit_trigger
before insert on public.waitlist_members
for each row execute function public.enforce_waitlist_rate_limit();

create or replace function public.get_waitlist_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.waitlist_members where unsubscribed_at is null;
$$;

revoke all on function public.get_waitlist_count from public;
grant execute on function public.get_waitlist_count to anon, authenticated;

create or replace function public.get_admin_waitlist(
  p_page integer default 1,
  p_per_page integer default 50,
  p_search text default null,
  p_source text default null,
  p_theme text default null,
  p_marketing_consent boolean default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  safe_page integer := greatest(1, p_page);
  safe_per_page integer := least(greatest(1, p_per_page), 100);
  result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select json_build_object(
    'page', safe_page,
    'per_page', safe_per_page,
    'total', (
      select count(*)
      from public.waitlist_members m
      where (nullif(trim(p_search), '') is null or m.email ilike '%' || trim(p_search) || '%')
        and (nullif(trim(p_source), '') is null or m.source = p_source)
        and (nullif(trim(p_theme), '') is null or m.theme = p_theme)
        and (p_marketing_consent is null or m.marketing_consent = p_marketing_consent)
    ),
    'data', coalesce((
      select json_agg(row_to_json(rows) order by rows.signed_up_at desc)
      from (
        select
          m.id,
          m.email,
          m.source,
          m.product_id,
          m.theme,
          m.marketing_consent,
          m.consented_at,
          m.consent_version,
          m.signed_up_at,
          m.verified_at,
          m.unsubscribed_at,
          coalesce(session_stats.session_count, 0) as session_count,
          session_stats.total_active_seconds,
          session_stats.top_section
        from public.waitlist_members m
        left join lateral (
          select
            count(*)::integer as session_count,
            coalesce(sum(s.active_seconds), 0)::integer as total_active_seconds,
            (
              select key
              from jsonb_each_text(coalesce((select jsonb_object_agg(key, sum_value) from (
                select key, sum(value::integer) as sum_value
                from public.analytics_sessions a2,
                     jsonb_each_text(a2.section_dwell)
                where a2.member_id = m.id
                group by key
              ) totals), '{}'::jsonb))
              order by value::integer desc
              limit 1
            ) as top_section
          from public.analytics_sessions s
          where s.member_id = m.id
        ) session_stats on true
        where (nullif(trim(p_search), '') is null or m.email ilike '%' || trim(p_search) || '%')
          and (nullif(trim(p_source), '') is null or m.source = p_source)
          and (nullif(trim(p_theme), '') is null or m.theme = p_theme)
          and (p_marketing_consent is null or m.marketing_consent = p_marketing_consent)
        order by m.signed_up_at desc
        limit safe_per_page offset (safe_page - 1) * safe_per_page
      ) rows
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_waitlist from public;
grant execute on function public.get_admin_waitlist to authenticated;

create or replace function public.get_admin_analytics(
  p_page integer default 1,
  p_per_page integer default 50,
  p_theme text default null,
  p_device_type text default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  safe_page integer := greatest(1, p_page);
  safe_per_page integer := least(greatest(1, p_per_page), 100);
  result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select json_build_object(
    'page', safe_page,
    'per_page', safe_per_page,
    'total', (
      select count(*) from public.analytics_sessions s
      where (nullif(trim(p_theme), '') is null or s.theme = p_theme)
        and (nullif(trim(p_device_type), '') is null or s.device_type = p_device_type)
    ),
    'data', coalesce((
      select json_agg(row_to_json(rows) order by rows.started_at desc)
      from (
        select s.*, m.email as member_email
        from public.analytics_sessions s
        left join public.waitlist_members m on m.id = s.member_id
        where (nullif(trim(p_theme), '') is null or s.theme = p_theme)
          and (nullif(trim(p_device_type), '') is null or s.device_type = p_device_type)
        order by s.started_at desc
        limit safe_per_page offset (safe_page - 1) * safe_per_page
      ) rows
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_analytics from public;
grant execute on function public.get_admin_analytics to authenticated;
