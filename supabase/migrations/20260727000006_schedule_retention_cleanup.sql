-- Keep the retention cleanup available to trusted callers only, and run it
-- automatically once a day through Supabase Cron.
create extension if not exists pg_cron;

revoke all on function public.purge_waitlist_retention() from public;
revoke all on function public.purge_waitlist_retention() from anon, authenticated;
grant execute on function public.purge_waitlist_retention() to service_role;

do $migration$
begin
  -- Replace an existing job with the same name so this remains safe to rerun.
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'purge-waitlist-retention';

  perform cron.schedule(
    'purge-waitlist-retention',
    '0 3 * * *',
    $cron$select public.purge_waitlist_retention();$cron$
  );
end;
$migration$;
