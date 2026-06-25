-- Patient Care Reports. PCRs are created from accepted dispatch responses.

begin;

create table if not exists public.pcr_reports (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null unique references public.responses(id) on delete cascade,
  status public.pcr_status not null default 'in_progress',
  triage text,
  chief_complaint text,
  emergency_types text[] not null default '{}',
  trauma_types text[] not null default '{}',
  incident_nature text,
  hospital_name text,
  resident_on_duty text,
  endorsed_to text,
  received_by text,
  transfer_reason text,
  notes text,
  back_to_base_time time,
  completed_at timestamptz,
  submitted_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  rejection_reason text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.pcr_vital_signs (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  measured_time time,
  blood_pressure text,
  pulse_rate text,
  respiratory_rate text,
  temperature text,
  oxygen_saturation text,
  created_at timestamptz not null default now()
);

create table if not exists public.pcr_medications (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  drug text,
  dose text,
  given_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pcr_interventions (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  intervention_name text not null,
  result text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pcr_attachments (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  attachment_type text not null default 'document',
  storage_path text,
  file_name text,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace view public.pcr_reports_with_response as
select
  p.*,
  r.response_number,
  r.date_of_incident,
  r.time_of_incident,
  r.place_of_incident,
  r.barangay_id,
  r.type_of_incident,
  r.patient_name,
  r.patient_age,
  r.patient_birthday,
  r.patient_sex,
  r.patient_address,
  r.responding_team_id,
  r.assigned_unit_id,
  r.driver_name,
  r.main_aider_name,
  r.assistant_aider_name
from public.pcr_reports p
join public.responses r on r.id = p.response_id;

commit;
