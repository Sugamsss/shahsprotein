create or replace function public.enforce_waitlist_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_headers text := current_setting('request.headers', true);
  v_request_ip text := 'unknown';
  v_request_hash text;
  attempts integer;
begin
  if request_headers is not null and request_headers <> '' then
    v_request_ip := coalesce(
      split_part(request_headers::jsonb ->> 'x-forwarded-for', ',', 1),
      request_headers::jsonb ->> 'cf-connecting-ip',
      'unknown'
    );
  end if;

  if v_request_ip <> 'unknown' then
    v_request_hash := left(encode(digest(trim(v_request_ip), 'sha256'), 'hex'), 64);

    delete from public.waitlist_rate_limits
    where attempted_at < timezone('utc', now()) - interval '1 hour';

    select count(*) into attempts
    from public.waitlist_rate_limits limits
    where limits.request_key = v_request_hash
      and limits.attempted_at > timezone('utc', now()) - interval '1 hour';

    if attempts >= 10 then
      raise exception using message = 'Too many signup attempts. Please try again later.';
    end if;

    insert into public.waitlist_rate_limits (request_key)
    values (v_request_hash);
  end if;

  return new;
end;
$$;
