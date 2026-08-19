begin;

create or replace function public.staff_all_records_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with authorized as (
    select (
      auth.uid() is not null
      and (
        public.has_role('administrator')
        or public.has_role('dispatcher')
        or public.has_role('field_responder')
      )
    ) as ok
  ),
  incident_rows as (
    select
      i.id,
      i.response_id,
      coalesce(b.name, '') as barangay,
      coalesce(i.classification::text, 'other') as classification,
      coalesce(i.subtype, '') as subtype,
      coalesce(i.priority::text, 'medium') as priority,
      i.title,
      i.incident_date,
      i.incident_time,
      i.location_text,
      i.latitude,
      i.longitude,
      coalesce(i.status::text, 'draft') as status,
      i.created_at,
      i.updated_at
    from public.incidents i
    left join public.barangays b on b.id = i.barangay_id
    cross join authorized a
    where a.ok and i.deleted_at is null
  ),
  dispatch_rows as (
    select
      d.id,
      d.response_id,
      coalesce(r.response_number, '') as response_number,
      coalesce(b.name, '') as barangay,
      r.date_of_incident,
      r.time_of_incident,
      d.dispatch_time,
      d.arrival_scene_time,
      d.departure_scene_time,
      d.arrival_hospital_time,
      d.departure_hospital_time,
      d.arrival_office_time,
      coalesce(rt.name, '') as responding_team,
      coalesce(d.status::text, 'draft') as status,
      d.sent_at,
      d.created_at,
      d.updated_at
    from public.dispatch_forms d
    left join public.responses r on r.id = d.response_id
    left join public.barangays b on b.id = r.barangay_id
    left join public.responding_teams rt on rt.id = r.responding_team_id
    cross join authorized a
    where a.ok and d.deleted_at is null
  ),
  pcr_rows as (
    select
      p.id,
      p.response_id,
      p.dispatch_form_id,
      coalesce(r.response_number, '') as response_number,
      coalesce(b.name, '') as barangay,
      r.date_of_incident,
      r.time_of_incident,
      r.place_of_incident,
      r.location_text,
      r.latitude,
      r.longitude,
      coalesce(rt.name, '') as responding_team,
      coalesce(p.status::text, 'draft') as status,
      coalesce(p.triage, '') as triage,
      coalesce(p.incident_nature, '') as incident_nature,
      coalesce(p.hospital_name, '') as hospital_name,
      coalesce(p.endorsed_to, '') as endorsed_to,
      coalesce(p.received_by, '') as received_by,
      coalesce(p.emergency_types, array[]::text[]) as emergency_types,
      coalesce(p.trauma_types, array[]::text[]) as trauma_types,
      coalesce(public.alert_cia_safe_jsonb(p.notes) #> '{__alertCiaExtended,crash}', '{}'::jsonb) as crash,
      p.completed_at,
      p.submitted_at,
      p.created_at,
      p.updated_at
    from public.pcr_reports p
    left join public.responses r on r.id = p.response_id
    left join public.barangays b on b.id = r.barangay_id
    left join public.responding_teams rt on rt.id = coalesce(p.responding_team_id, r.responding_team_id)
    cross join authorized a
    where a.ok and p.deleted_at is null
  )
  select jsonb_build_object(
    'incidents', coalesce((select jsonb_agg(to_jsonb(incident_rows) order by incident_date desc nulls last, created_at desc) from incident_rows), '[]'::jsonb),
    'dispatches', coalesce((select jsonb_agg(to_jsonb(dispatch_rows) order by created_at desc) from dispatch_rows), '[]'::jsonb),
    'pcrReports', coalesce((select jsonb_agg(to_jsonb(pcr_rows) order by created_at desc) from pcr_rows), '[]'::jsonb)
  );
$$;

revoke execute on function public.staff_all_records_analytics() from public, anon;
grant execute on function public.staff_all_records_analytics() to authenticated;

notify pgrst, 'reload schema';

commit;
