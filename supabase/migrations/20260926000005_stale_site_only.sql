-- Migration: 20260926000005_stale_site_only.sql
-- Two small follow-ups from the 2026-09-26 audit.
--
-- 1. Only site orders can go stale. "Didn't come through?" means the customer
--    pressed Send on the site but no WhatsApp message arrived. An order added
--    by hand (WhatsApp, call, Instagram, in person) already came through, so
--    it must never land there, however long it sits in New. The rule still
--    lives only in order_is_stale(), so admin_order_json's 'stale' and the
--    overview's to_confirm / stale counts and oldest dates pick this up as is.
-- 2. get_waitlist_count_stats() is internal now. Nothing on the site calls
--    it; only get_admin_email_list() (security definer) does, inside the
--    database. Supabase's default privileges had left anon able to execute
--    it, which showed the email list's counts to anyone with the public key.

-- ═══════════════════════════════════════════════════════
-- 1. The stale rule: site orders only
-- ═══════════════════════════════════════════════════════

create or replace function public.order_is_stale(p_order public.orders)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_order.source = 'site'
    and p_order.status = 'new'
    and p_order.status_changed_at < now() - interval '48 hours'
    and (p_order.kept_at is null or p_order.kept_at < now() - interval '48 hours');
$$;

revoke all on function public.order_is_stale(public.orders) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════
-- 2. get_waitlist_count_stats(): no API access
-- ═══════════════════════════════════════════════════════

revoke all on function public.get_waitlist_count_stats() from public, anon, authenticated;
