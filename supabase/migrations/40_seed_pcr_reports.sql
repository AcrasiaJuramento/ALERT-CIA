-- Seed realistic PCR workflow records with exact map-pin coordinates.
-- These records are useful for Map Monitor, Public Live Map, analytics, and
-- accident-prone area testing because they include verified/completed PCRs.

begin;

insert into public.barangays (
  name,
  normalized_name,
  municipality,
  province,
  centroid,
  source_name,
  active
)
values
  ('San Fabian', 'san fabian', 'Echague', 'Isabela', extensions.ST_SetSRID(extensions.ST_MakePoint(121.6887388, 16.7268713), 4326)::extensions.geography, 'ALERT-CIA PCR seed', true),
  ('Malitao', 'malitao', 'Echague', 'Isabela', extensions.ST_SetSRID(extensions.ST_MakePoint(121.6783600, 16.6812700), 4326)::extensions.geography, 'ALERT-CIA PCR seed', true),
  ('Salay', 'salay', 'Echague', 'Isabela', extensions.ST_SetSRID(extensions.ST_MakePoint(121.6198450, 16.7359800), 4326)::extensions.geography, 'ALERT-CIA PCR seed', true)
on conflict (name) do update
  set centroid = coalesce(public.barangays.centroid, excluded.centroid),
      active = true,
      updated_at = now();

with seed_rows as (
  select *
  from (
    values
      (
        'SEED-PCR-2026-0001',
        current_date - interval '1 day',
        time '07:35',
        'Maharlika Highway near Echague Public Market',
        'San Fabian',
        16.7268713::numeric,
        121.6887388::numeric,
        'Motor Vehicle Crash',
        'Juan Dela Cruz',
        34,
        'Male',
        'Blunt trauma after motorcycle collision.',
        'Alpha Run 1',
        'Red',
        'completed'::public.pcr_status,
        'pcr_completed'::public.dispatch_status,
        array['Trauma']::text[],
        array['Motor Vehicle Crash']::text[],
        'Motor Vehicle Crash',
        'Echague District Hospital',
        now() - interval '20 hours',
        now() - interval '19 hours'
      ),
      (
        'SEED-PCR-2026-0002',
        current_date - interval '2 days',
        time '14:20',
        'Residential area near Barangay Hall',
        'Malitao',
        16.6812700::numeric,
        121.6783600::numeric,
        'Medical Emergency',
        'Maria Santos',
        58,
        'Female',
        'Chest pain and shortness of breath.',
        'Alpha Run 2',
        'Yellow',
        'verified'::public.pcr_status,
        'pcr_completed'::public.dispatch_status,
        array['Medical']::text[],
        array[]::text[],
        'Medical Emergency',
        'Echague District Hospital',
        now() - interval '42 hours',
        now() - interval '41 hours'
      ),
      (
        'SEED-PCR-2026-0003',
        current_date - interval '3 days',
        time '21:10',
        'Farm road crossing near Purok 4',
        'Salay',
        16.7359800::numeric,
        121.6198450::numeric,
        'Fall Incident',
        'Pedro Ramos',
        46,
        'Male',
        'Suspected fracture after fall from motorcycle.',
        'Bravo Run 1',
        'Green',
        'submitted'::public.pcr_status,
        'pcr_in_progress'::public.dispatch_status,
        array[]::text[],
        array['Fall']::text[],
        'Fall Incident',
        'Echague District Hospital',
        now() - interval '68 hours',
        null::timestamptz
      )
  ) as rows(
    response_number,
    incident_date,
    incident_time,
    location_text,
    barangay_name,
    latitude,
    longitude,
    incident_type,
    patient_name,
    patient_age,
    patient_sex,
    chief_complaint,
    team_name,
    triage,
    pcr_status,
    response_status,
    emergency_types,
    trauma_types,
    incident_nature,
    hospital_name,
    completed_at,
    verified_at
  )
),
upserted_responses as (
  insert into public.responses (
    response_number,
    date_of_incident,
    time_of_incident,
    place_of_incident,
    location_text,
    latitude,
    longitude,
    location_geography,
    barangay_id,
    type_of_incident,
    patient_name,
    patient_age,
    patient_sex,
    patient_address,
    initial_assessment,
    responding_team_id,
    status,
    accepted_at,
    resolved_at
  )
  select
    seed.response_number,
    seed.incident_date::date,
    seed.incident_time,
    seed.location_text,
    seed.location_text,
    seed.latitude,
    seed.longitude,
    extensions.ST_SetSRID(extensions.ST_MakePoint(seed.longitude, seed.latitude), 4326)::extensions.geography,
    barangay.id,
    seed.incident_type,
    seed.patient_name,
    seed.patient_age,
    seed.patient_sex,
    concat(seed.barangay_name, ', Echague, Isabela'),
    seed.chief_complaint,
    team.id,
    seed.response_status,
    now() - interval '4 hours',
    case when seed.response_status = 'pcr_completed' then seed.completed_at else null end
  from seed_rows seed
  left join public.barangays barangay on barangay.name = seed.barangay_name
  left join public.responding_teams team on team.name = seed.team_name
  on conflict (response_number) do update
    set date_of_incident = excluded.date_of_incident,
        time_of_incident = excluded.time_of_incident,
        place_of_incident = excluded.place_of_incident,
        location_text = excluded.location_text,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        location_geography = excluded.location_geography,
        barangay_id = excluded.barangay_id,
        type_of_incident = excluded.type_of_incident,
        patient_name = excluded.patient_name,
        patient_age = excluded.patient_age,
        patient_sex = excluded.patient_sex,
        patient_address = excluded.patient_address,
        initial_assessment = excluded.initial_assessment,
        responding_team_id = excluded.responding_team_id,
        status = excluded.status,
        accepted_at = coalesce(public.responses.accepted_at, excluded.accepted_at),
        resolved_at = excluded.resolved_at,
        updated_at = now()
  returning id, response_number
),
upserted_dispatches as (
  insert into public.dispatch_forms (
    response_id,
    dispatch_time,
    arrival_scene_time,
    departure_scene_time,
    arrival_hospital_time,
    departure_hospital_time,
    arrival_office_time,
    hospital_name,
    number_of_patients,
    assistance_needed,
    notes,
    status,
    sent_at
  )
  select
    response.id,
    seed.incident_time,
    seed.incident_time + interval '12 minutes',
    seed.incident_time + interval '28 minutes',
    seed.incident_time + interval '45 minutes',
    seed.incident_time + interval '1 hour',
    seed.incident_time + interval '1 hour 30 minutes',
    seed.hospital_name,
    1,
    array['PNP', 'BRGY. OFFICIALS']::text[],
    'Seed dispatch for PCR map and analytics testing.',
    seed.response_status,
    now() - interval '5 hours'
  from upserted_responses response
  join seed_rows seed on seed.response_number = response.response_number
  on conflict (response_id) do update
    set dispatch_time = excluded.dispatch_time,
        arrival_scene_time = excluded.arrival_scene_time,
        departure_scene_time = excluded.departure_scene_time,
        arrival_hospital_time = excluded.arrival_hospital_time,
        departure_hospital_time = excluded.departure_hospital_time,
        arrival_office_time = excluded.arrival_office_time,
        hospital_name = excluded.hospital_name,
        number_of_patients = excluded.number_of_patients,
        assistance_needed = excluded.assistance_needed,
        notes = excluded.notes,
        status = excluded.status,
        sent_at = coalesce(public.dispatch_forms.sent_at, excluded.sent_at),
        updated_at = now()
  returning id, response_id
),
upserted_pcrs as (
  insert into public.pcr_reports (
    response_id,
    dispatch_form_id,
    responding_team_id,
    status,
    triage,
    chief_complaint,
    emergency_types,
    trauma_types,
    incident_nature,
    hospital_name,
    resident_on_duty,
    endorsed_to,
    received_by,
    transfer_reason,
    notes,
    back_to_base_time,
    completed_at,
    submitted_at,
    verified_at
  )
  select
    response.id,
    dispatch.id,
    team.id,
    seed.pcr_status,
    seed.triage,
    seed.chief_complaint,
    seed.emergency_types,
    seed.trauma_types,
    seed.incident_nature,
    seed.hospital_name,
    'Dr. Seed Resident',
    'Emergency Room',
    'ER Nurse',
    null,
    'Seed PCR report with exact incident pin location.',
    seed.incident_time + interval '1 hour 30 minutes',
    seed.completed_at,
    coalesce(seed.completed_at - interval '20 minutes', now() - interval '67 hours'),
    seed.verified_at
  from upserted_responses response
  join seed_rows seed on seed.response_number = response.response_number
  join upserted_dispatches dispatch on dispatch.response_id = response.id
  left join public.responding_teams team on team.name = seed.team_name
  on conflict (response_id) do update
    set dispatch_form_id = excluded.dispatch_form_id,
        responding_team_id = excluded.responding_team_id,
        status = excluded.status,
        triage = excluded.triage,
        chief_complaint = excluded.chief_complaint,
        emergency_types = excluded.emergency_types,
        trauma_types = excluded.trauma_types,
        incident_nature = excluded.incident_nature,
        hospital_name = excluded.hospital_name,
        resident_on_duty = excluded.resident_on_duty,
        endorsed_to = excluded.endorsed_to,
        received_by = excluded.received_by,
        transfer_reason = excluded.transfer_reason,
        notes = excluded.notes,
        back_to_base_time = excluded.back_to_base_time,
        completed_at = excluded.completed_at,
        submitted_at = excluded.submitted_at,
        verified_at = excluded.verified_at,
        updated_at = now()
  returning id, response_id
)
insert into public.pcr_vital_signs (
  pcr_report_id,
  measured_time,
  blood_pressure,
  pulse_rate,
  respiratory_rate,
  temperature,
  oxygen_saturation
)
select
  pcr.id,
  seed.incident_time + interval '20 minutes',
  case seed.triage when 'Red' then '90/60' when 'Yellow' then '150/90' else '120/80' end,
  case seed.triage when 'Red' then '118' when 'Yellow' then '104' else '86' end,
  case seed.triage when 'Red' then '24' else '20' end,
  '36.8',
  case seed.triage when 'Red' then '93' else '98' end
from upserted_pcrs pcr
join upserted_responses response on response.id = pcr.response_id
join seed_rows seed on seed.response_number = response.response_number
where not exists (
  select 1
  from public.pcr_vital_signs existing
  where existing.pcr_report_id = pcr.id
);

do $$
declare
  seed_response_id uuid;
  expose_seed_public boolean;
begin
  for seed_response_id, expose_seed_public in
    select r.id, p.status in ('verified', 'completed')
    from public.responses r
    join public.pcr_reports p on p.response_id = r.id
    where response_number like 'SEED-PCR-2026-%'
      and r.deleted_at is null
      and p.deleted_at is null
  loop
    perform public.sync_response_to_incident(seed_response_id, expose_seed_public);
  end loop;
end;
$$;

commit;
