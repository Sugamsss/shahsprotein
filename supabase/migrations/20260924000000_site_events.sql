-- Migration: 20260924000000_site_events.sql
-- Anonymous site events, starting with "Order on WhatsApp" clicks. Orders
-- happen inside WhatsApp, so the click is the only signal the site gets.
--
-- Rows hold no PII: no IP, no user agent, no session key and no link to a
-- member. The rate limit keeps a hashed IP in a separate table for about an
-- hour and never joins it to an event.

-- ═══════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in ('whatsapp_order_click')),
  source text not null check (
    source ~ '^((header|hero|faq|banner|footer)|(product|product-details|nutrition):[a-z0-9][a-z0-9-]{0,39})$'
  ),
  device_type text check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  theme text check (theme in ('light', 'dark')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists site_events_event_created_at_idx
  on public.site_events (event, created_at desc);

create table if not exists public.site_event_rate_limits (
  request_key text not null,
  attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists site_event_rate_limits_lookup_idx
  on public.site_event_rate_limits (request_key, attempted_at desc);

alter table public.site_events enable row level security;
alter table public.site_event_rate_limits enable row level security;

-- No policies: anon and authenticated can't read, change or delete rows.
-- The only way in is track_site_event() below.
revoke all on public.site_events from anon, authenticated;
revoke all on public.site_event_rate_limits from anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. Public write RPC
-- ═══════════════════════════════════════════════════════

-- Fire-and-forget from the browser. Bad input raises (so bugs show up as a
-- 400 in the network tab); a rate-limited call is dropped quietly, because the
-- client ignores the response anyway.
create or replace function public.track_site_event(
  p_event text,
  p_source text,
  p_device_type text default null,
  p_theme text default null
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
  recent_events integer;
begin
  if p_event is null or p_event not in ('whatsapp_order_click') then
    raise exception using message = 'Unknown event.', errcode = '22023';
  end if;

  if p_source is null
     or p_source !~ '^((header|hero|faq|banner|footer)|(product|product-details|nutrition):[a-z0-9][a-z0-9-]{0,39})$' then
    raise exception using message = 'Invalid event source.', errcode = '22023';
  end if;

  -- Same shape as enforce_waitlist_rate_limit() (000004), with its own table
  -- so clicks never count against sign-ups. cf-connecting-ip is set by
  -- Cloudflare and can't be supplied by the caller, so it goes first.
  if request_headers is not null and request_headers <> '' then
    v_request_ip := coalesce(
      nullif(trim(request_headers::jsonb ->> 'cf-connecting-ip'), ''),
      nullif(trim(split_part(request_headers::jsonb ->> 'x-forwarded-for', ',', 1)), ''),
      'unknown'
    );
  end if;

  if v_request_ip <> 'unknown' then
    v_request_hash := left(encode(digest(v_request_ip, 'sha256'), 'hex'), 64);

    delete from public.site_event_rate_limits
    where attempted_at < timezone('utc', now()) - interval '1 hour';

    select count(*) into attempts
    from public.site_event_rate_limits limits
    where limits.request_key = v_request_hash
      and limits.attempted_at > timezone('utc', now()) - interval '1 hour';

    if attempts >= 60 then
      return;
    end if;

    insert into public.site_event_rate_limits (request_key)
    values (v_request_hash);
  end if;

  -- Backstop in case the per-IP limit is dodged: far above real traffic for
  -- a small shop, low enough that a flood can't fill the database.
  select count(*) into recent_events
  from public.site_events e
  where e.event = p_event
    and e.created_at > timezone('utc', now()) - interval '1 hour';

  if recent_events >= 3000 then
    return;
  end if;

  insert into public.site_events (event, source, device_type, theme)
  values (
    p_event,
    p_source,
    case when p_device_type in ('mobile', 'tablet', 'desktop', 'unknown') then p_device_type end,
    case when p_theme in ('light', 'dark') then p_theme end
  );
end;
$$;

revoke all on function public.track_site_event(text, text, text, text) from public;
grant execute on function public.track_site_event(text, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 3. Admin read
-- ═══════════════════════════════════════════════════════

-- Order clicks grouped by source. p_days = null means all time.
create or replace function public.get_admin_order_clicks(p_days integer default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception using message = 'Invalid time range.', errcode = '22023';
  end if;

  v_since := case
    when p_days is null then null
    else timezone('utc', now()) - make_interval(days => p_days)
  end;

  with clicks as (
    select e.source, e.device_type, e.created_at
    from public.site_events e
    where e.event = 'whatsapp_order_click'
      and (v_since is null or e.created_at >= v_since)
  )
  select json_build_object(
    'since', v_since,
    'total', (select count(*) from clicks),
    'by_source', coalesce((
      select json_agg(row_to_json(rows) order by rows.clicks desc, rows.source)
      from (
        select source, count(*)::integer as clicks, max(created_at) as last_click_at
        from clicks
        group by source
      ) rows
    ), '[]'::json),
    'by_device', coalesce((
      select json_agg(row_to_json(rows) order by rows.clicks desc)
      from (
        select coalesce(device_type, 'unknown') as device_type, count(*)::integer as clicks
        from clicks
        group by coalesce(device_type, 'unknown')
      ) rows
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

-- Supabase grants execute on new functions to anon and authenticated by
-- default, so revoking from public alone isn't enough (see 000006).
revoke all on function public.get_admin_order_clicks(integer) from public, anon;
grant execute on function public.get_admin_order_clicks(integer) to authenticated;

-- ═══════════════════════════════════════════════════════
-- 4. Retention
-- ═══════════════════════════════════════════════════════

-- Events are kept for 13 months, enough to compare a month with the same
-- month last year. Rate-limit rows only matter for an hour.
create or replace function public.purge_site_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.site_events
  where created_at < timezone('utc', now()) - interval '13 months';

  delete from public.site_event_rate_limits
  where attempted_at < timezone('utc', now()) - interval '1 hour';
end;
$$;

revoke all on function public.purge_site_events() from public, anon, authenticated;
grant execute on function public.purge_site_events() to service_role;

do $migration$
begin
  -- Replace an existing job with the same name so this remains safe to rerun.
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'purge-site-events';

  perform cron.schedule(
    'purge-site-events',
    '15 3 * * *',
    $cron$select public.purge_site_events();$cron$
  );
end;
$migration$;
