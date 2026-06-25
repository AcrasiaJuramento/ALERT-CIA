-- Workflow functions, updated_at triggers, audit triggers, and status automation.

begin;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  related_response_id uuid;
begin
  if tg_op = 'INSERT' then
    related_response_id := coalesce((to_jsonb(new)->>'response_id')::uuid, new.id);
    insert into public.audit_logs(action, table_name, record_id, new_values, response_id)
    values ('create', tg_table_name, new.id, to_jsonb(new), related_response_id);
    return new;
  elsif tg_op = 'UPDATE' then
    related_response_id := coalesce((to_jsonb(new)->>'response_id')::uuid, new.id);
    insert into public.audit_logs(action, table_name, record_id, previous_values, new_values, response_id)
    values ('update', tg_table_name, new.id, to_jsonb(old), to_jsonb(new), related_response_id);
    return new;
  elsif tg_op = 'DELETE' then
    related_response_id := coalesce((to_jsonb(old)->>'response_id')::uuid, old.id);
    insert into public.audit_logs(action, table_name, record_id, previous_values, response_id)
    values ('delete', tg_table_name, old.id, to_jsonb(old), related_response_id);
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.accept_dispatch(target_response_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_team uuid;
  pcr_id uuid;
begin
  select responding_team_id into target_team from public.responses where id = target_response_id and deleted_at is null;
  if target_team is null then raise exception 'Dispatch has no responding team'; end if;
  if not (public.is_admin() or target_team in (select public.user_team_ids())) then
    raise exception 'Not authorized to accept this dispatch';
  end if;

  update public.responses
  set status = 'accepted_by_responding_team',
      accepted_by_team_id = target_team,
      accepted_by_profile_id = auth.uid(),
      accepted_at = coalesce(accepted_at, now())
  where id = target_response_id;

  update public.dispatch_forms
  set status = 'accepted_by_responding_team',
      updated_by = auth.uid()
  where response_id = target_response_id;

  insert into public.pcr_reports(response_id, status, created_by, updated_by)
  values (target_response_id, 'in_progress', auth.uid(), auth.uid())
  on conflict (response_id) do update
    set status = case when public.pcr_reports.status = 'draft' then 'in_progress' else public.pcr_reports.status end,
        updated_by = auth.uid(),
        updated_at = now()
  returning id into pcr_id;

  update public.responses set status = 'pcr_in_progress' where id = target_response_id;
  update public.dispatch_forms
  set status = 'pcr_in_progress',
      updated_by = auth.uid()
  where response_id = target_response_id;

  insert into public.notifications(recipient_team_id, type, title, message, response_id, pcr_report_id)
  values (target_team, 'pcr_created', 'PCR report ready', 'A PCR report has been opened from an accepted dispatch.', target_response_id, pcr_id);

  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
  values ('accept', 'responses', target_response_id, target_response_id, jsonb_build_object('pcr_report_id', pcr_id));

  return pcr_id;
end;
$$;

create or replace function public.mark_response_back_to_base(target_response_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_team uuid;
begin
  select responding_team_id into target_team from public.responses where id = target_response_id and deleted_at is null;
  if not (public.is_admin() or target_team in (select public.user_team_ids())) then
    raise exception 'Not authorized to complete this response';
  end if;

  update public.pcr_reports
  set status = 'completed',
      back_to_base_time = localtime(0),
      completed_at = now(),
      updated_by = auth.uid()
  where response_id = target_response_id;

  if not found then raise exception 'No linked PCR report found'; end if;

  update public.responses
  set status = 'pcr_completed',
      resolved_at = coalesce(resolved_at, now())
  where id = target_response_id;

  update public.dispatch_forms
  set status = 'pcr_completed',
      arrival_office_time = coalesce(arrival_office_time, localtime(0)),
      updated_by = auth.uid()
  where response_id = target_response_id;

  if target_team is not null then
    insert into public.notifications(recipient_team_id, type, title, message, response_id)
    values (target_team, 'response_completed', 'Response completed', 'The responding team has marked this response as back to base.', target_response_id);
  end if;

  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
  values ('back_to_base', 'responses', target_response_id, target_response_id, jsonb_build_object('completed_at', now()));
end;
$$;

create or replace function public.sync_dispatch_status_to_response()
returns trigger language plpgsql as $$
begin
  update public.responses set status = new.status where id = new.response_id and status <> new.status;
  return new;
end;
$$;

do $$
declare
  item text;
begin
  foreach item in array array[
    'organizations','stations','profiles','barangays','responding_teams','ambulance_units',
    'responses','dispatch_forms','dispatch_patients','pcr_reports','incidents','notification_preferences'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', item, item);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', item, item);
  end loop;
end $$;

drop trigger if exists sync_dispatch_status_to_response on public.dispatch_forms;
create trigger sync_dispatch_status_to_response
after update of status on public.dispatch_forms
for each row execute function public.sync_dispatch_status_to_response();

drop trigger if exists audit_responses on public.responses;
create trigger audit_responses after insert or update or delete on public.responses
for each row execute function public.audit_row_change();

drop trigger if exists audit_dispatch_forms on public.dispatch_forms;
create trigger audit_dispatch_forms after insert or update or delete on public.dispatch_forms
for each row execute function public.audit_row_change();

drop trigger if exists audit_pcr_reports on public.pcr_reports;
create trigger audit_pcr_reports after insert or update or delete on public.pcr_reports
for each row execute function public.audit_row_change();

grant execute on function
  public.accept_dispatch(uuid),
  public.mark_response_back_to_base(uuid)
to authenticated;

commit;
