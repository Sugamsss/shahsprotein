-- Migration: 20260727000003_crm_features.sql
-- CRM: member tags/notes/status/updated_at, email_campaigns, email_log,
-- admin-safe RPCs, count divergence fix, resubscription fix.
-- All changes are additive; existing functions are replaced where needed.

-- ═══════════════════════════════════════════════════════
-- 1. Extended member columns
-- ═══════════════════════════════════════════════════════

alter table public.waitlist_members
  add column if not exists tags text[] not null default '{}',
  add column if not exists notes text not null default '',
  add column if not exists status text not null default 'active'
    check (status in ('active', 'unsubscribed', 'bounced', 'spam')),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists waitlist_members_status_idx
  on public.waitlist_members(status);

-- Auto-update updated_at on any column change
create or replace function public.update_waitlist_member_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_waitlist_members_updated_at on public.waitlist_members;
create trigger trg_waitlist_members_updated_at
  before update on public.waitlist_members
  for each row execute function public.update_waitlist_member_timestamp();

-- ═══════════════════════════════════════════════════════
-- 2. Email campaign tables
-- ═══════════════════════════════════════════════════════

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  html_body text not null,
  plain_text text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.email_campaigns(id) on delete cascade,
  member_id uuid references public.waitlist_members(id) on delete set null,
  email text not null,
  subject text not null default '',
  status text not null check (status in (
    'sent', 'delivered', 'bounced', 'opened', 'clicked', 'unsubscribed', 'failed'
  )),
  error_message text,
  sent_at timestamptz not null default timezone('utc', now()),
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists email_log_campaign_id_idx on public.email_log(campaign_id);
create index if not exists email_log_member_id_idx on public.email_log(member_id);
create index if not exists email_log_status_idx on public.email_log(status);
create index if not exists email_campaigns_status_idx on public.email_campaigns(status);

-- Auto-update updated_at on email_campaigns
drop trigger if exists trg_email_campaigns_updated_at on public.email_campaigns;
create trigger trg_email_campaigns_updated_at
  before update on public.email_campaigns
  for each row execute function public.update_waitlist_member_timestamp();

-- ═══════════════════════════════════════════════════════
-- 3. RLS on new tables
-- ═══════════════════════════════════════════════════════

alter table public.email_campaigns enable row level security;
alter table public.email_log enable row level security;

revoke all on public.email_campaigns from anon, authenticated;
revoke all on public.email_log from anon, authenticated;

-- Admins can read email_campaigns
create policy "Admins can read email_campaigns"
  on public.email_campaigns for select
  to authenticated
  using (public.is_admin());

-- Admins can insert/update email_campaigns
create policy "Admins can insert email_campaigns"
  on public.email_campaigns for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update email_campaigns"
  on public.email_campaigns for update
  to authenticated
  using (public.is_admin());

-- service_role can write email_log (from edge functions)
create policy "service_role can manage email_log"
  on public.email_log for all
  to service_role
  using (true)
  with check (true);

-- Admins can read email_log
create policy "Admins can read email_log"
  on public.email_log for select
  to authenticated
  using (public.is_admin());

-- ═══════════════════════════════════════════════════════
-- 4. Fix resubscription + count divergence in submit_waitlist_member
-- ═══════════════════════════════════════════════════════

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
  active_count bigint;
begin
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using message = 'Please enter a valid email address.';
  end if;

  select * into existing_member
  from public.waitlist_members
  where lower(email) = normalized_email
  limit 1;

  if existing_member.id is not null then
    -- Resubscription: if unsubscribed, re-activate the member
    if existing_member.status = 'unsubscribed' or existing_member.unsubscribed_at is not null then
      update public.waitlist_members
      set
        unsubscribed_at = null,
        status = 'active',
        source = left(coalesce(nullif(trim(p_source), ''), 'hero'), 80),
        product_id = nullif(left(trim(p_product_id), 120), ''),
        theme = case when p_theme in ('light', 'dark') then p_theme else existing_member.theme end,
        marketing_consent = coalesce(p_marketing_consent, existing_member.marketing_consent),
        consented_at = case when coalesce(p_marketing_consent, false) then timezone('utc', now()) else existing_member.consented_at end,
        consent_version = case when coalesce(p_marketing_consent, false) then p_consent_version else existing_member.consent_version end,
        verified_at = timezone('utc', now())
      where id = existing_member.id;
    end if;

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

    select count(*) into active_count
    from public.waitlist_members
    where unsubscribed_at is null;

    return json_build_object(
      'success', true,
      'already_subscribed', existing_member.unsubscribed_at is null,
      'resubscribed', existing_member.unsubscribed_at is not null,
      'message', case
        when existing_member.unsubscribed_at is not null then 'Welcome back! You''ve been re-added to the launch updates.'
        else 'Love your enthusiasm! You''ve signed up already. We''ll make sure you''re the first one to get the updates as we launch.'
      end,
      'total_count', active_count
    );
  end if;

  insert into public.waitlist_members (
    email, source, product_id, theme, marketing_consent, consented_at, consent_version, status
  ) values (
    normalized_email,
    left(coalesce(nullif(trim(p_source), ''), 'hero'), 80),
    nullif(left(trim(p_product_id), 120), ''),
    case when p_theme in ('light', 'dark') then p_theme else null end,
    coalesce(p_marketing_consent, false),
    case when coalesce(p_marketing_consent, false) then timezone('utc', now()) else null end,
    case when coalesce(p_marketing_consent, false) then p_consent_version else null end,
    'active'
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

  select count(*) into active_count
  from public.waitlist_members
  where unsubscribed_at is null;

  return json_build_object(
    'success', true,
    'already_subscribed', false,
    'resubscribed', false,
    'message', 'Welcome aboard! You''re on the VIP waitlist. We''ll keep you first in line for launch updates.',
    'total_count', active_count
  );
exception
  when unique_violation then
    select count(*) into active_count
    from public.waitlist_members
    where unsubscribed_at is null;

    return json_build_object(
      'success', true,
      'already_subscribed', true,
      'resubscribed', false,
      'message', 'Love your enthusiasm! You''ve signed up already. We''ll make sure you''re the first one to get the updates as we launch.',
      'total_count', active_count
    );
end;
$$;

revoke all on function public.submit_waitlist_member from public;
grant execute on function public.submit_waitlist_member to anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 5. Consistent count stats (fixes count divergence)
-- ═══════════════════════════════════════════════════════

create or replace function public.get_waitlist_count_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total',           (select count(*) from public.waitlist_members),
    'active',          (select count(*) from public.waitlist_members where unsubscribed_at is null and status = 'active'),
    'unsubscribed',    (select count(*) from public.waitlist_members where unsubscribed_at is not null or status = 'unsubscribed'),
    'bounced',         (select count(*) from public.waitlist_members where status = 'bounced'),
    'spam',            (select count(*) from public.waitlist_members where status = 'spam'),
    'verified',        (select count(*) from public.waitlist_members where verified_at is not null),
    'marketing_consent', (select count(*) from public.waitlist_members where marketing_consent = true)
  );
$$;

revoke all on function public.get_waitlist_count_stats from public;
grant execute on function public.get_waitlist_count_stats to authenticated;

-- Update get_waitlist_count to be an alias for active count (already correct,
-- but keep it as the backward-compatible active count)
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

-- ═══════════════════════════════════════════════════════
-- 6. Updated consume_waitlist_email_token – also sets status
-- ═══════════════════════════════════════════════════════

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
    set verified_at = timezone('utc', now()),
        status = 'active'
    where id = token_row.member_id;
  else
    update public.waitlist_members
    set unsubscribed_at = timezone('utc', now()),
        status = 'unsubscribed'
    where id = token_row.member_id;
  end if;

  return true;
end;
$$;

revoke all on function public.consume_waitlist_email_token from public;
grant execute on function public.consume_waitlist_email_token to service_role;

-- ═══════════════════════════════════════════════════════
-- 7. Admin-safe CRM RPCs
-- ═══════════════════════════════════════════════════════

-- 7a. Get member detail (admin only)
create or replace function public.get_admin_member_detail(p_member_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select json_build_object(
    'member', row_to_json(m),
    'sessions', coalesce((
      select json_agg(row_to_json(s) order by s.started_at desc)
      from (
        select id, started_at, ended_at, active_seconds, theme, device_type, section_dwell,
               referrer, utm_source, utm_medium, utm_campaign, created_at
        from public.analytics_sessions
        where member_id = p_member_id
        order by started_at desc
        limit 50
      ) s
    ), '[]'::json),
    'session_count', (select count(*)::integer from public.analytics_sessions where member_id = p_member_id),
    'total_active_seconds', (select coalesce(sum(active_seconds), 0)::integer from public.analytics_sessions where member_id = p_member_id),
    'email_log', coalesce((
      select json_agg(row_to_json(el) order by el.sent_at desc)
      from (
        select id, campaign_id, email, subject, status, error_message, sent_at, opened_at, clicked_at, created_at
        from public.email_log
        where member_id = p_member_id
        order by sent_at desc
        limit 20
      ) el
    ), '[]'::json)
  ) into result
  from (
    select id, email, source, product_id, theme, marketing_consent, consented_at,
           consent_version, signed_up_at, verified_at, unsubscribed_at,
           tags, notes, status, updated_at, created_at
    from public.waitlist_members
    where id = p_member_id
  ) m;

  if result is null then
    raise exception using message = 'Member not found';
  end if;

  return result;
end;
$$;

revoke all on function public.get_admin_member_detail from public;
grant execute on function public.get_admin_member_detail to authenticated;

-- 7b. Update member (admin only)
create or replace function public.update_admin_member(
  p_member_id uuid,
  p_tags text[] default null,
  p_notes text default null,
  p_status text default null,
  p_marketing_consent boolean default null,
  p_product_id text default null,
  p_theme text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_member public.waitlist_members;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  update public.waitlist_members
  set
    tags = case when p_tags is not null then p_tags else tags end,
    notes = case when p_notes is not null then p_notes else notes end,
    status = case
      when p_status is not null then
        case when p_status in ('active', 'unsubscribed', 'bounced', 'spam') then p_status
        else status end
      else status
    end,
    marketing_consent = case when p_marketing_consent is not null then p_marketing_consent else marketing_consent end,
    product_id = case when p_product_id is not null then nullif(trim(p_product_id), '') else product_id end,
    theme = case
      when p_theme is not null then
        case when p_theme in ('light', 'dark') then p_theme else theme end
      else theme
    end,
    -- Keep unsubscribed_at consistent with status
    unsubscribed_at = case
      when p_status = 'unsubscribed' then timezone('utc', now())
      when p_status is not null and p_status != 'unsubscribed' then null
      else unsubscribed_at
    end
  where id = p_member_id
  returning * into updated_member;

  if updated_member.id is null then
    raise exception using message = 'Member not found';
  end if;

  return json_build_object(
    'success', true,
    'member', row_to_json(updated_member)
  );
end;
$$;

revoke all on function public.update_admin_member from public;
grant execute on function public.update_admin_member to authenticated;

-- 7c. List email campaigns (admin only)
create or replace function public.get_admin_campaigns(
  p_page integer default 1,
  p_per_page integer default 50
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
    'total', (select count(*) from public.email_campaigns),
    'data', coalesce((
      select json_agg(row_to_json(rows) order by rows.created_at desc)
      from (
        select
          c.id, c.name, c.subject, c.status, c.scheduled_at, c.sent_at,
          c.created_by, c.created_at, c.updated_at,
          coalesce(log_stats.total_sent, 0)::integer as total_sent,
          coalesce(log_stats.delivered, 0)::integer as delivered,
          coalesce(log_stats.bounced, 0)::integer as bounced,
          coalesce(log_stats.failed, 0)::integer as failed,
          coalesce(log_stats.opened, 0)::integer as opened,
          coalesce(log_stats.clicked, 0)::integer as clicked,
          coalesce(log_stats.unsubscribed, 0)::integer as unsubscribed
        from public.email_campaigns c
        left join lateral (
          select
            count(*) filter (where status in ('sent', 'delivered', 'opened', 'clicked')) as total_sent,
            count(*) filter (where status = 'delivered') as delivered,
            count(*) filter (where status = 'bounced') as bounced,
            count(*) filter (where status = 'failed') as failed,
            count(*) filter (where status in ('opened', 'clicked')) as opened,
            count(*) filter (where status = 'clicked') as clicked,
            count(*) filter (where status = 'unsubscribed') as unsubscribed
          from public.email_log
          where campaign_id = c.id
        ) log_stats on true
        order by c.created_at desc
        limit safe_per_page offset (safe_page - 1) * safe_per_page
      ) rows
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_campaigns from public;
grant execute on function public.get_admin_campaigns to authenticated;

-- 7d. Get campaign email log (admin only)
create or replace function public.get_admin_campaign_log(
  p_campaign_id uuid,
  p_page integer default 1,
  p_per_page integer default 50
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
    'campaign_id', p_campaign_id,
    'total', (select count(*) from public.email_log where campaign_id = p_campaign_id),
    'data', coalesce((
      select json_agg(row_to_json(rows) order by rows.sent_at desc)
      from (
        select
          el.id, el.campaign_id, el.member_id, el.email, el.status,
          el.error_message, el.sent_at, el.opened_at, el.clicked_at, el.created_at,
          m.email as member_email
        from public.email_log el
        left join public.waitlist_members m on m.id = el.member_id
        where el.campaign_id = p_campaign_id
        order by el.sent_at desc
        limit safe_per_page offset (safe_page - 1) * safe_per_page
      ) rows
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_campaign_log from public;
grant execute on function public.get_admin_campaign_log to authenticated;

-- 7e. Log email delivery (called by edge function; service_role only)
create or replace function public.log_email_delivery(
  p_campaign_id uuid,
  p_member_id uuid,
  p_email text,
  p_status text,
  p_subject text default '',
  p_error_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.email_log (campaign_id, member_id, email, subject, status, error_message)
  values (p_campaign_id, p_member_id, p_email, left(trim(p_subject), 300), p_status,
    left(nullif(trim(p_error_message), ''), 500))
  returning id into v_id;

  -- If bounced or spam, update member status
  if p_status in ('bounced', 'spam') and p_member_id is not null then
    update public.waitlist_members
    set status = p_status
    where id = p_member_id
      and status = 'active';
  end if;

  return v_id;
end;
$$;

revoke all on function public.log_email_delivery from public;
grant execute on function public.log_email_delivery to service_role;

-- 7f. Log email open/click events (service_role only)
create or replace function public.log_email_event(
  p_log_id uuid,
  p_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type = 'open' then
    update public.email_log
    set opened_at = timezone('utc', now()),
        status = 'opened'
    where id = p_log_id and opened_at is null;
  elsif p_event_type = 'click' then
    update public.email_log
    set clicked_at = timezone('utc', now()),
        status = 'clicked'
    where id = p_log_id and clicked_at is null;
  else
    return false;
  end if;

  return found;
end;
$$;

revoke all on function public.log_email_event from public;
grant execute on function public.log_email_event to service_role;

-- ═══════════════════════════════════════════════════════
-- 8. Updated get_admin_waitlist – includes new columns
-- ═══════════════════════════════════════════════════════

drop function if exists public.get_admin_waitlist(integer, integer, text, text, text, boolean);

create or replace function public.get_admin_waitlist(
  p_page integer default 1,
  p_per_page integer default 50,
  p_search text default null,
  p_source text default null,
  p_theme text default null,
  p_marketing_consent boolean default null,
  p_status text default null
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
        and (nullif(trim(p_status), '') is null or m.status = p_status)
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
          m.tags,
          m.notes,
          m.status,
          m.updated_at,
          m.created_at,
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
          and (nullif(trim(p_status), '') is null or m.status = p_status)
        order by m.signed_up_at desc
        limit safe_per_page offset (safe_page - 1) * safe_per_page
      ) rows
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_waitlist(integer, integer, text, text, text, boolean, text) from public;
grant execute on function public.get_admin_waitlist(integer, integer, text, text, text, boolean, text) to authenticated;

-- 9. Dashboard summary used by the owner command center
create or replace function public.get_admin_summary()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_admin() then
    raise exception using message = 'Unauthorized';
  end if;

  select json_build_object(
    'total_members', (select count(*) from public.waitlist_members),
    'verified_members', (select count(*) from public.waitlist_members where verified_at is not null),
    'unsubscribed_members', (select count(*) from public.waitlist_members where unsubscribed_at is not null or status = 'unsubscribed'),
    'marketing_consent', (select count(*) from public.waitlist_members where marketing_consent),
    'total_sessions', (select count(*) from public.analytics_sessions),
    'avg_active_seconds', coalesce((select round(avg(active_seconds))::integer from public.analytics_sessions), 0),
    'signups_today', (select count(*) from public.waitlist_members where signed_up_at >= date_trunc('day', timezone('utc', now()))),
    'signups_this_week', (select count(*) from public.waitlist_members where signed_up_at >= timezone('utc', now()) - interval '7 days'),
    'top_sources', coalesce((
      select json_agg(json_build_object('source', source, 'count', member_count) order by member_count desc)
      from (
        select coalesce(source, 'unknown') as source, count(*)::integer as member_count
        from public.waitlist_members
        group by source
        order by member_count desc
        limit 8
      ) sources
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_summary from public;
grant execute on function public.get_admin_summary to authenticated;
