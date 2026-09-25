-- Migration: 20260926000002_remove_old_admin.sql
-- Removes the waitlist-era admin now that the order book replaces it:
-- the old CRM, analytics, campaign and unsubscribe functions, the unused
-- public get_waitlist_count(), and the three email tables (all empty in
-- production). purge_waitlist_retention() stops touching the tokens table.
--
-- Kept on purpose: analytics_sessions and its rows (PM decision), the public
-- site's submit_waitlist_member(), check_coupon() and track_site_event(), the
-- coupon admin RPCs, get_waitlist_count_stats() and is_admin(). The Loops
-- edge functions only use waitlist_members, which is untouched.
--
-- Exact signatures, so a drop can't hit a different overload by accident.

-- ═══════════════════════════════════════════════════════
-- 1. Old admin RPCs
-- ═══════════════════════════════════════════════════════

drop function if exists public.get_admin_waitlist(integer, integer, text, text, text, boolean, text);
drop function if exists public.get_admin_member_detail(uuid);
drop function if exists public.update_admin_member(uuid, text[], text, text, boolean, text, text);
drop function if exists public.get_admin_summary();
drop function if exists public.get_admin_analytics(integer, integer, text, text);
drop function if exists public.get_admin_campaigns(integer, integer);
drop function if exists public.get_admin_campaign_log(uuid, integer, integer);
drop function if exists public.get_admin_order_clicks(integer);

-- ═══════════════════════════════════════════════════════
-- 2. Campaign and unsubscribe plumbing (service role only)
-- ═══════════════════════════════════════════════════════

drop function if exists public.log_email_delivery(uuid, uuid, text, text, text, text);
drop function if exists public.log_email_event(uuid, text);
drop function if exists public.issue_waitlist_email_token(text, text);
drop function if exists public.consume_waitlist_email_token(text, text);

-- Anon could call it, but the site never does.
drop function if exists public.get_waitlist_count();

-- ═══════════════════════════════════════════════════════
-- 3. Retention job: stop touching the tokens table
-- ═══════════════════════════════════════════════════════

-- Same body as 20260727000002 without the tokens delete. It must change
-- before the table goes, or the nightly job would fail.
create or replace function public.purge_waitlist_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.analytics_sessions
  where created_at < timezone('utc', now()) - interval '24 months';

  delete from public.waitlist_rate_limits
  where attempted_at < timezone('utc', now()) - interval '2 days';
end;
$$;

revoke all on function public.purge_waitlist_retention() from public, anon, authenticated;
grant execute on function public.purge_waitlist_retention() to service_role;

-- ═══════════════════════════════════════════════════════
-- 4. Empty email tables
-- ═══════════════════════════════════════════════════════

-- No cascade: if anything still depends on these, the migration should
-- fail loudly rather than take it along. email_log goes first because it
-- references email_campaigns.
drop table if exists public.email_log;
drop table if exists public.email_campaigns;
drop table if exists public.waitlist_email_tokens;
