-- Supabase linter hardening for function search paths, RPC exposure, and cache controls.
-- Keeps app-used workflow RPCs available to authenticated users with explicit role checks.

begin;

-- Fixed search_path for all existing functions that participate in RLS, triggers, defaults, or RPC.
alter function public.has_role(public.app_role) set search_path = public, pg_temp;
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_dispatcher() set search_path = public, pg_temp;
alter function public.is_field_responder() set search_path = public, pg_temp;
alter function public.current_station_id() set search_path = public, pg_temp;
alter function public.handle_new_auth_user() set search_path = public, pg_temp;
alter function public.user_team_ids() set search_path = public, pg_temp;
alter function public.find_barangay_for_point(extensions.geography) set search_path = public, extensions, pg_temp;
alter function public.next_response_number() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.audit_row_change() set search_path = public, pg_temp;
alter function public.accept_dispatch(uuid) set search_path = public, pg_temp;
alter function public.mark_response_back_to_base(uuid) set search_path = public, pg_temp;
alter function public.sync_dispatch_status_to_response() set search_path = public, pg_temp;
alter function public.clear_app_cache(public.cache_scope) set search_path = public, pg_temp;
alter function public.invalidate_operational_cache() set search_path = public, pg_temp;
alter function public.invalidate_barangay_cache() set search_path = public, pg_temp;
alter function public.refresh_barangay_incident_counts() set search_path = public, pg_temp;
alter function public.set_scraper_record_barangay() set search_path = public, extensions, pg_temp;
alter function public.audit_scraper_record_change() set search_path = public, pg_temp;
alter function public.promote_scraper_record_to_incident(uuid) set search_path = public, pg_temp;

-- Cache invalidation triggers must not call the public admin-only cache RPC, or ordinary
-- dispatch/PCR writes would fail. They perform the internal delete directly.
create or replace function public.invalidate_operational_cache()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.app_cache
  where scope in ('dashboard', 'analytics', 'reports');

  return coalesce(new, old);
end;
$$;

create or replace function public.invalidate_barangay_cache()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.app_cache
  where scope in ('barangay_map', 'dashboard', 'analytics');

  return coalesce(new, old);
end;
$$;

-- App-facing cache maintenance remains callable by admins only.
create or replace function public.clear_app_cache(target_scope public.cache_scope default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not authorized to clear app cache';
  end if;

  delete from public.app_cache
  where target_scope is null or scope = target_scope;
end;
$$;

create or replace function public.refresh_barangay_incident_counts()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not authorized to refresh barangay incident counts';
  end if;

  refresh materialized view public.mv_barangay_incident_counts;
end;
$$;

-- Workflow RPCs stay available to signed-in users, but anonymous execution is blocked
-- and the functions enforce role/team membership before performing privileged writes.
create or replace function public.accept_dispatch(target_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_team uuid;
  pcr_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to accept dispatch';
  end if;

  select responding_team_id into target_team
  from public.responses
  where id = target_response_id and deleted_at is null;

  if target_team is null then
    raise exception 'Dispatch has no responding team';
  end if;

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

  if target_team is not null then
    insert into public.notifications(recipient_team_id, type, title, message, response_id)
    values (target_team, 'response_completed', 'Response completed', 'The responding team has marked this response as back to base.', target_response_id);
  end if;

  insert into public.audit_logs(action, table_name, record_id, response_id, new_values)
  values ('back_to_base', 'responses', target_response_id, target_response_id, jsonb_build_object('completed_at', now()));
end;
$$;

create or replace function public.promote_scraper_record_to_incident(target_record_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.scraper_records%rowtype;
  incident_id uuid;
  mapped_classification public.incident_classification;
  mapped_priority public.incident_priority;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Not authorized to promote scraper records';
  end if;

  select * into target
  from public.scraper_records
  where id = target_record_id and deleted_at is null;

  if not found then
    raise exception 'Scraper record not found';
  end if;

  mapped_classification := case
    when target.category = 'vehicular' then 'mvc'::public.incident_classification
    when target.incident_type = 'fire' then 'fire'::public.incident_classification
    when target.incident_type in ('flood', 'earthquake', 'landslide') then 'rescue'::public.incident_classification
    else 'other'::public.incident_classification
  end;

  mapped_priority := case
    when lower(coalesce(target.severity, '')) in ('black', 'red', 'critical') then 'critical'::public.incident_priority
    when lower(coalesce(target.severity, '')) in ('yellow', 'high') then 'high'::public.incident_priority
    when lower(coalesce(target.severity, '')) in ('green', 'low') then 'low'::public.incident_priority
    else 'medium'::public.incident_priority
  end;

  if target.related_incident_id is null then
    insert into public.incidents(
      barangay_id,
      classification,
      subtype,
      priority,
      title,
      description,
      incident_date,
      location_text,
      location,
      public_visible,
      status,
      record_origin,
      external_source_url,
      scraper_record_id
    )
    values (
      target.barangay_id,
      mapped_classification,
      target.incident_type,
      mapped_priority,
      target.title,
      target.snippet,
      target.scraped_at::date,
      coalesce(target.location_text, target.display_name),
      target.location,
      target.public_visible,
      'draft',
      'promoted_scraped',
      target.source_url,
      target.id
    )
    returning id into incident_id;
  else
    incident_id := target.related_incident_id;
  end if;

  update public.scraper_records
  set related_incident_id = incident_id,
      status = 'imported',
      public_visible = true,
      processed_at = now()
  where id = target_record_id;

  return incident_id;
end;
$$;

-- Remove PUBLIC/default execution from functions that should not be exposed as RPC.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.sync_dispatch_status_to_response() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.set_scraper_record_barangay() from public, anon, authenticated;
revoke execute on function public.audit_scraper_record_change() from public, anon, authenticated;
revoke execute on function public.invalidate_operational_cache() from public, anon, authenticated;
revoke execute on function public.invalidate_barangay_cache() from public, anon, authenticated;

-- Helper/default functions are needed by RLS/defaults for signed-in workflows, not anon RPC.
revoke execute on function public.has_role(public.app_role) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_dispatcher() from public, anon;
revoke execute on function public.is_field_responder() from public, anon;
revoke execute on function public.current_station_id() from public, anon;
revoke execute on function public.user_team_ids() from public, anon;
revoke execute on function public.find_barangay_for_point(extensions.geography) from public, anon;
revoke execute on function public.next_response_number() from public, anon;

grant execute on function
  public.has_role(public.app_role),
  public.is_admin(),
  public.is_dispatcher(),
  public.is_field_responder(),
  public.current_station_id(),
  public.user_team_ids(),
  public.find_barangay_for_point(extensions.geography),
  public.next_response_number()
to authenticated;

-- App RPC grants: authenticated only; each function performs its own authorization.
revoke execute on function public.accept_dispatch(uuid) from public, anon;
revoke execute on function public.mark_response_back_to_base(uuid) from public, anon;
revoke execute on function public.promote_scraper_record_to_incident(uuid) from public, anon;
revoke execute on function public.clear_app_cache(public.cache_scope) from public, anon;
revoke execute on function public.refresh_barangay_incident_counts() from public, anon;

grant execute on function
  public.accept_dispatch(uuid),
  public.mark_response_back_to_base(uuid),
  public.promote_scraper_record_to_incident(uuid),
  public.clear_app_cache(public.cache_scope),
  public.refresh_barangay_incident_counts()
to authenticated;

-- Keep analytics counts available to signed-in staff, but not anonymous/public API callers.
revoke select on public.mv_barangay_incident_counts from public, anon;
grant select on public.mv_barangay_incident_counts to authenticated;

commit;
