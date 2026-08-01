-- Allow dispatchers to promote PCRs returned through the LAN workflow.
-- The dispatcher already manages the parent dispatch/response; this keeps
-- reverse offline sync from being blocked when the field officer's tablet
-- sends the completed PCR back through the dispatcher/local server.

begin;

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef('public.sync_offline_pcr_report(jsonb,jsonb,boolean)'::regprocedure)
  into function_sql;

  if function_sql is null then
    raise exception 'sync_offline_pcr_report(jsonb,jsonb,boolean) is not installed';
  end if;

  if position('public.is_dispatcher()' in function_sql) = 0 then
    function_sql := replace(
      function_sql,
      'if not (public.is_admin() or target_team_id in (select public.user_team_ids())) then',
      'if not (public.is_admin() or public.is_dispatcher() or target_team_id in (select public.user_team_ids())) then'
    );
    execute function_sql;
  end if;
end;
$$;

revoke execute on function public.sync_offline_pcr_report(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.sync_offline_pcr_report(jsonb, jsonb, boolean) to authenticated;

commit;
