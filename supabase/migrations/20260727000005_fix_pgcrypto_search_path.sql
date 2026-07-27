alter function public.enforce_waitlist_rate_limit()
  set search_path = public, extensions;

alter function public.issue_waitlist_email_token(text, text)
  set search_path = public, extensions;

alter function public.consume_waitlist_email_token(text, text)
  set search_path = public, extensions;
