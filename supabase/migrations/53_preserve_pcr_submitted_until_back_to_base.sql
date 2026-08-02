-- Keep PCR submission separate from the return-to-base completion step.

begin;

do $$
declare
  function_sql text;
begin
  select pg_get_functiondef('public.sync_offline_pcr_report(jsonb,jsonb,boolean)'::regprocedure)
  into function_sql;

  if function_sql is null then
    raise exception 'sync_offline_pcr_report(jsonb,jsonb,boolean) was not found';
  end if;

  -- A submitted PCR should not resolve the parent workflow. The existing enum has
  -- no PCR-submitted dispatch state, so keep the parent in progress until Back to Base.
  function_sql := replace(function_sql, 'status = ''pcr_completed'',', 'status = ''pcr_in_progress'',');
  execute function_sql;
end $$;

create or replace function public.mark_response_back_to_base(target_response_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_team uuid;
  had_return_to_base boolean := false;
  has_pcr boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to complete response';
  end if;

  select responding_team_id into target_team
  from public.responses
  where id = target_response_id and deleted_at is null;

  if not (public.is_admin() or target_team in (select public.user_team_ids())) then
    raise exception 'Not authorized to complete this response';
  end if;

  select
    count(*) > 0,
    bool_or(back_to_base_time is not null or completed_at is not null)
  into has_pcr, had_return_to_base
  from public.pcr_reports
  where response_id = target_response_id
    and deleted_at is null;

  if not has_pcr then
    raise exception 'No linked PCR report found';
  end if;

  update public.pcr_reports
  set status = 'completed',
      back_to_base_time = coalesce(back_to_base_time, localtime(0)),
      completed_at = coalesce(completed_at, now()),
      updated_by = auth.uid()
  where response_id = target_response_id
    and deleted_at is null;

  update public.responses
  set status = 'pcr_completed',
      resolved_at = coalesce(resolved_at, now())
  where id = target_response_id;

  update public.dispatch_forms
  set status = 'pcr_completed',
      arrival_office_time = coalesce(arrival_office_time, localtime(0)),
      updated_by = auth.uid()
  where response_id = target_response_id;

  perform public.sync_response_to_incident(target_response_id, true);

  if target_team is not null and not coalesce(had_return_to_base, false) then
    insert into public.notifications(recipient_team_id, type, title, message, response_id)
    values (target_team, 'response_completed', 'Response completed', 'The responding team has marked this response as back to base.', target_response_id);
  end if;

  if not coalesce(had_return_to_base, false) then
    insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
    values ('back_to_base', 'responses', target_response_id, target_response_id, jsonb_build_object('completed_at', now()));
  end if;
end;
$$;

revoke execute on function public.mark_response_back_to_base(uuid) from public, anon;
grant execute on function public.mark_response_back_to_base(uuid) to authenticated;

revoke execute on function public.sync_offline_pcr_report(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.sync_offline_pcr_report(jsonb, jsonb, boolean) to authenticated;

commit;
