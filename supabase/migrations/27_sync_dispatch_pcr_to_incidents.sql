-- Bridge dispatch/PCR workflow records into the operational incidents table.
-- Incidents remains the read model for dashboard, operations map, public view, and analytics.

begin;

create or replace function public.classify_response_incident(type_text text)
returns public.incident_classification
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(coalesce(type_text, '')) ~ '(motor|vehicle|vehicular|mvc|crash|collision|accident)' then 'mvc'::public.incident_classification
    when lower(coalesce(type_text, '')) ~ '(fire|burn)' then 'fire'::public.incident_classification
    when lower(coalesce(type_text, '')) ~ '(trauma|fall|assault|bite|electrocution)' then 'trauma'::public.incident_classification
    when lower(coalesce(type_text, '')) ~ '(rescue|drown|flood|water)' then 'rescue'::public.incident_classification
    when lower(coalesce(type_text, '')) ~ '(medical|pediatric|psychiatric|surgical|obstetrical)' then 'medical'::public.incident_classification
    else 'other'::public.incident_classification
  end;
$$;

create or replace function public.priority_from_pcr_triage(triage_text text)
returns public.incident_priority
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(coalesce(triage_text, '')) in ('black', 'red', 'critical') then 'critical'::public.incident_priority
    when lower(coalesce(triage_text, '')) in ('yellow', 'high') then 'high'::public.incident_priority
    when lower(coalesce(triage_text, '')) in ('green', 'low') then 'low'::public.incident_priority
    else 'medium'::public.incident_priority
  end;
$$;

create or replace function public.sync_response_to_incident(
  target_response_id uuid,
  expose_public boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_response public.responses%rowtype;
  linked_pcr public.pcr_reports%rowtype;
  incident_id uuid;
  next_title text;
  next_description text;
  next_classification public.incident_classification;
  next_priority public.incident_priority;
  next_location extensions.geography(point, 4326);
begin
  select * into target_response
  from public.responses
  where id = target_response_id
    and deleted_at is null;

  if not found then
    raise exception 'Response not found';
  end if;

  select * into linked_pcr
  from public.pcr_reports
  where response_id = target_response_id
    and deleted_at is null
  order by updated_at desc
  limit 1;

  next_classification := public.classify_response_incident(
    coalesce(linked_pcr.incident_nature, target_response.type_of_incident)
  );
  next_priority := public.priority_from_pcr_triage(linked_pcr.triage);
  next_title := coalesce(
    nullif(target_response.type_of_incident, ''),
    nullif(linked_pcr.incident_nature, ''),
    'Emergency response'
  );
  next_description := coalesce(
    nullif(linked_pcr.chief_complaint, ''),
    nullif(linked_pcr.notes, ''),
    nullif(target_response.initial_assessment, ''),
    nullif(target_response.caller_address, ''),
    'Dispatch and PCR workflow record synced into incidents.'
  );

  select centroid into next_location
  from public.barangays
  where id = target_response.barangay_id
    and active
  limit 1;

  select id into incident_id
  from public.incidents
  where response_id = target_response_id
    and deleted_at is null
  order by created_at asc
  limit 1;

  if incident_id is null then
    insert into public.incidents(
      response_id,
      barangay_id,
      classification,
      subtype,
      priority,
      title,
      description,
      incident_date,
      incident_time,
      location_text,
      location,
      public_visible,
      status,
      record_origin
    )
    values (
      target_response.id,
      target_response.barangay_id,
      next_classification,
      nullif(target_response.type_of_incident, ''),
      next_priority,
      next_title,
      next_description,
      coalesce(target_response.date_of_incident, current_date),
      target_response.time_of_incident,
      coalesce(nullif(target_response.place_of_incident, ''), nullif(target_response.caller_address, '')),
      next_location,
      expose_public or target_response.status = 'pcr_completed',
      target_response.status,
      'official'
    )
    returning id into incident_id;
  else
    update public.incidents
    set barangay_id = coalesce(target_response.barangay_id, barangay_id),
        classification = next_classification,
        subtype = coalesce(nullif(target_response.type_of_incident, ''), subtype),
        priority = next_priority,
        title = next_title,
        description = next_description,
        incident_date = coalesce(target_response.date_of_incident, incident_date, current_date),
        incident_time = coalesce(target_response.time_of_incident, incident_time),
        location_text = coalesce(nullif(target_response.place_of_incident, ''), nullif(target_response.caller_address, ''), location_text),
        location = coalesce(location, next_location),
        public_visible = public_visible or expose_public or target_response.status = 'pcr_completed',
        status = target_response.status,
        updated_at = now()
    where id = incident_id;
  end if;

  return incident_id;
end;
$$;

create or replace function public.sync_response_incident_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('sent_to_responding_team', 'accepted_by_responding_team', 'pcr_in_progress', 'pcr_completed') then
    perform public.sync_response_to_incident(new.id, new.status = 'pcr_completed');
  end if;

  return new;
end;
$$;

drop trigger if exists sync_response_to_incident_on_status on public.responses;
create trigger sync_response_to_incident_on_status
after insert or update of status, date_of_incident, time_of_incident, place_of_incident, barangay_id, type_of_incident, initial_assessment
on public.responses
for each row execute function public.sync_response_incident_trigger();

create or replace function public.sync_pcr_incident_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('submitted', 'verified', 'completed') then
    perform public.sync_response_to_incident(new.response_id, new.status in ('verified', 'completed'));
  end if;

  return new;
end;
$$;

drop trigger if exists sync_pcr_to_incident_on_status on public.pcr_reports;
create trigger sync_pcr_to_incident_on_status
after insert or update of status, triage, chief_complaint, incident_nature, notes
on public.pcr_reports
for each row execute function public.sync_pcr_incident_trigger();

create or replace function public.accept_dispatch(target_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_team uuid;
  target_dispatch_form uuid;
  pcr_id uuid;
begin
  select responding_team_id into target_team
  from public.responses
  where id = target_response_id
    and deleted_at is null;

  if target_team is null then
    raise exception 'Dispatch has no responding team';
  end if;

  if not (public.is_admin() or target_team in (select public.user_team_ids())) then
    raise exception 'Not authorized to accept this dispatch';
  end if;

  select id into target_dispatch_form
  from public.dispatch_forms
  where response_id = target_response_id
    and deleted_at is null;

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

  insert into public.pcr_reports(
    response_id,
    dispatch_form_id,
    responding_team_id,
    field_officer_id,
    status,
    created_by,
    updated_by
  )
  values (
    target_response_id,
    target_dispatch_form,
    target_team,
    auth.uid(),
    'in_progress',
    auth.uid(),
    auth.uid()
  )
  on conflict (response_id) do update
    set dispatch_form_id = coalesce(public.pcr_reports.dispatch_form_id, excluded.dispatch_form_id),
        responding_team_id = excluded.responding_team_id,
        field_officer_id = coalesce(public.pcr_reports.field_officer_id, excluded.field_officer_id),
        status = case when public.pcr_reports.status = 'draft' then 'in_progress' else public.pcr_reports.status end,
        updated_by = auth.uid(),
        updated_at = now()
  returning id into pcr_id;

  update public.responses set status = 'pcr_in_progress' where id = target_response_id;
  update public.dispatch_forms
  set status = 'pcr_in_progress',
      updated_by = auth.uid()
  where response_id = target_response_id;

  perform public.sync_response_to_incident(target_response_id, false);

  insert into public.notifications(recipient_team_id, type, title, message, response_id, pcr_report_id)
  values (target_team, 'pcr_created', 'PCR report ready', 'A PCR report has been opened from an accepted dispatch.', target_response_id, pcr_id);

  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
  values ('accept', 'responses', target_response_id, target_response_id, jsonb_build_object(
    'pcr_report_id', pcr_id,
    'dispatch_form_id', target_dispatch_form,
    'responding_team_id', target_team,
    'field_officer_id', auth.uid()
  ));

  return pcr_id;
end;
$$;

create or replace function public.mark_response_back_to_base(target_response_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_team uuid;
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

  update public.pcr_reports
  set status = 'completed',
      back_to_base_time = localtime(0),
      completed_at = now(),
      updated_by = auth.uid()
  where response_id = target_response_id;

  if not found then
    raise exception 'No linked PCR report found';
  end if;

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

  if target_team is not null then
    insert into public.notifications(recipient_team_id, type, title, message, response_id)
    values (target_team, 'response_completed', 'Response completed', 'The responding team has marked this response as back to base.', target_response_id);
  end if;

  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
  values ('back_to_base', 'responses', target_response_id, target_response_id, jsonb_build_object('completed_at', now()));
end;
$$;

do $$
declare
  completed_response uuid;
  completed_status public.dispatch_status;
begin
  for completed_response, completed_status in
    select id, status
    from public.responses
    where deleted_at is null
      and status in ('sent_to_responding_team', 'accepted_by_responding_team', 'pcr_in_progress', 'pcr_completed')
  loop
    perform public.sync_response_to_incident(completed_response, completed_status = 'pcr_completed');
  end loop;
end $$;

revoke execute on function public.classify_response_incident(text) from public, anon;
revoke execute on function public.priority_from_pcr_triage(text) from public, anon;
revoke execute on function public.sync_response_to_incident(uuid, boolean) from public, anon;
revoke execute on function public.sync_response_incident_trigger() from public, anon, authenticated;
revoke execute on function public.sync_pcr_incident_trigger() from public, anon, authenticated;

grant execute on function
  public.classify_response_incident(text),
  public.priority_from_pcr_triage(text),
  public.sync_response_to_incident(uuid, boolean),
  public.accept_dispatch(uuid),
  public.mark_response_back_to_base(uuid)
to authenticated;

commit;
