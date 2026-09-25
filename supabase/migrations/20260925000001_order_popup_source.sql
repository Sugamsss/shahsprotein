-- Migration: 20260925000001_order_popup_source.sql
-- Lets the "Your order" popup record its Send as a WhatsApp order click.
--
-- New sources: "order-popup", or "order-popup:<place>" where <place> is the
-- button that opened the popup (header, hero, banner, footer, product,
-- product-details), so the admin can still see which buttons lead to orders.
-- Everything else about site_events and track_site_event() stays the same:
-- no PII, same rate limits, same event name. Only the source pattern grows,
-- so every existing row still passes the new check.

alter table public.site_events drop constraint if exists site_events_source_check;
alter table public.site_events add constraint site_events_source_check check (
  source ~ '^((header|hero|faq|banner|footer)|(product|product-details|nutrition):[a-z0-9][a-z0-9-]{0,39}|order-popup(:(header|hero|banner|footer|product|product-details))?)$'
);

-- Same body as 20260924000000, with the wider source pattern.
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
     or p_source !~ '^((header|hero|faq|banner|footer)|(product|product-details|nutrition):[a-z0-9][a-z0-9-]{0,39}|order-popup(:(header|hero|banner|footer|product|product-details))?)$' then
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
