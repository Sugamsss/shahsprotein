-- Track owner alerts separately from member email delivery. A null value is
-- intentionally retryable when the notification provider is unavailable.
alter table public.waitlist_members
  add column if not exists owner_notification_sent_at timestamptz;

create index if not exists waitlist_members_owner_notification_idx
  on public.waitlist_members (owner_notification_sent_at)
  where owner_notification_sent_at is null;
