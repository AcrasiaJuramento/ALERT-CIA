-- ALERT-CIA complete Supabase schema
-- Target: a new Supabase project (PostgreSQL 15+)
-- Run once in the Supabase SQL Editor as a project owner.

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create type public.app_role as enum ('administrator', 'supervisor', 'dispatcher', 'operations_officer', 'field_responder', 'public_user');
create type public.account_status as enum ('pending', 'active', 'inactive', 'suspended');
create type public.duty_status as enum ('off_duty', 'available', 'on_duty', 'dispatched', 'on_scene', 'transporting');
create type public.incident_type as enum ('vehicular', 'fire', 'medical', 'flood', 'crime', 'rescue', 'other');
create type public.incident_severity as enum ('moderate', 'warning', 'critical');
create type public.incident_status as enum ('pending', 'active', 'responding', 'resolved', 'cancelled');
create type public.pcr_status as enum ('draft', 'submitted', 'verified', 'rejected');
create type public.notification_channel as enum ('in_app', 'email', 'sms', 'push');
create type public.attachment_kind as enum ('photo', 'document', 'signature', 'annotation', 'other');
create type public.audit_action as enum ('insert', 'update', 'delete', 'status_change', 'timestamp_change', 'handover_complete', 'verify', 'reject');
create type public.sync_operation as enum ('insert', 'update', 'delete');
create type public.sync_status as enum ('pending', 'processing', 'synced', 'conflict', 'failed');
create type public.ingestion_status as enum ('pending', 'processed', 'matched', 'rejected', 'failed');

create sequence public.incident_number_seq;
create sequence public.pcr_response_number_seq;

create function public.next_incident_number()
returns text language sql volatile set search_path = public as $$
  select 'INC-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.incident_number_seq')::text, 6, '0');
$$;

create function public.next_pcr_response_number()
returns text language sql volatile set search_path = public as $$
  select 'PCR-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.pcr_response_number_seq')::text, 6, '0');
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  name text not null unique,
  organization_type text not null default 'mdrrmo',
  contact_number text,
  email text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  contact_number text,
  email text,
  address text,
  location extensions.geography(point, 4326),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code),
  unique (organization_id, name)
);

create table public.roles (
  id smallint generated always as identity primary key,
  name public.app_role not null unique,
  description text not null
);

insert into public.roles (name, description) values
  ('administrator', 'Full system and security administration'),
  ('supervisor', 'Station-scoped operational and PCR oversight'),
  ('dispatcher', 'Incident dispatch and coordination'),
  ('operations_officer', 'Station operations, incident coordination, and own PCR management'),
  ('field_responder', 'Field response and own PCR management'),
  ('public_user', 'Read-only access to verified public incident information');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  station_id uuid references public.stations(id) on delete set null,
  personnel_number text unique,
  display_name text not null,
  position_title text,
  contact_number text,
  avatar_path text,
  account_status public.account_status not null default 'pending',
  duty_status public.duty_status not null default 'off_duty',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id smallint not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);

create table public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  requested_role public.app_role not null default 'field_responder',
  organization_name text not null,
  full_name text not null,
  position_title text not null,
  contact_number text not null,
  email text not null,
  status public.account_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  code text not null,
  name text not null,
  duty_status public.duty_status not null default 'off_duty',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (station_id, code),
  unique (station_id, name)
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team_role text not null,
  is_leader boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (team_id, profile_id, joined_at),
  check (left_at is null or left_at >= joined_at)
);

create unique index team_one_active_membership_idx
  on public.team_members(profile_id) where left_at is null;
create unique index team_one_active_leader_idx
  on public.team_members(team_id) where is_leader and left_at is null;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  call_sign text not null unique,
  plate_number text unique,
  vehicle_type text not null,
  make_model text,
  duty_status public.duty_status not null default 'available',
  active boolean not null default true,
  last_location extensions.geography(point, 4326),
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.map_locations (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete set null,
  location_type text not null check (location_type in ('barangay', 'hospital', 'landmark', 'road', 'station', 'evacuation_center', 'other')),
  name text not null,
  short_name text,
  address text,
  location extensions.geography(point, 4326) not null,
  contact_number text,
  public_visible boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  incident_number text not null unique default public.next_incident_number(),
  station_id uuid not null references public.stations(id) on delete restrict,
  incident_type public.incident_type not null,
  severity public.incident_severity not null,
  status public.incident_status not null default 'pending',
  title text,
  description text not null,
  location_text text not null,
  location extensions.geography(point, 4326) not null,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  public_visible boolean not null default false,
  public_description text,
  reported_by_profile_id uuid references public.profiles(id) on delete set null,
  reporter_name text,
  reporter_contact text,
  verified_for_public_at timestamptz,
  verified_for_public_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((status = 'resolved' and resolved_at is not null) or status <> 'resolved')
);

create table public.incident_casualties (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  patient_id uuid,
  temporary_identifier text,
  condition_summary text,
  outcome text,
  transported boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  check (patient_id is not null or nullif(trim(temporary_identifier), '') is not null)
);

create table public.incident_assignments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  assigned_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  assigned_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  dispatched_at timestamptz,
  arrived_scene_at timestamptz,
  cleared_at timestamptz,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (incident_id, team_id, assigned_at),
  check (acknowledged_at is null or acknowledged_at >= assigned_at),
  check (dispatched_at is null or dispatched_at >= assigned_at),
  check (arrived_scene_at is null or dispatched_at is null or arrived_scene_at >= dispatched_at),
  check (cleared_at is null or arrived_scene_at is null or cleared_at >= arrived_scene_at)
);

create table public.incident_events (
  id bigint generated always as identity primary key,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  event_type text not null,
  description text not null,
  event_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  previous_status public.incident_status,
  new_status public.incident_status,
  metadata jsonb not null default '{}'::jsonb
);

create table public.incident_attachments (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  kind public.attachment_kind not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  location extensions.geography(point, 4326),
  captured_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.hazard_zones (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  zone_type text not null check (zone_type in ('accident_hotspot', 'flood_risk', 'fire_hazard', 'road_closure', 'crime_risk', 'other')),
  label text not null,
  description text,
  severity public.incident_severity not null default 'warning',
  boundary extensions.geography(geometry, 4326) not null,
  valid_from timestamptz,
  valid_until timestamptz,
  active boolean not null default true,
  public_visible boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table public.risk_predictions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  hazard_zone_id uuid references public.hazard_zones(id) on delete set null,
  model_name text not null,
  model_version text not null,
  risk_type text not null,
  severity public.incident_severity not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  predicted_area extensions.geography(geometry, 4326) not null,
  prediction_start timestamptz not null,
  prediction_end timestamptz not null,
  explanation text,
  features jsonb not null default '{}'::jsonb,
  public_visible boolean not null default false,
  created_at timestamptz not null default now(),
  check (prediction_end > prediction_start)
);

create table public.public_alerts (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references public.stations(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  hazard_zone_id uuid references public.hazard_zones(id) on delete set null,
  title text not null,
  message text not null,
  severity public.incident_severity not null,
  published_at timestamptz,
  expires_at timestamptz,
  active boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (expires_at is null or published_at is null or expires_at > published_at)
);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  label text not null,
  phone_number text not null,
  display_order smallint not null default 0,
  active boolean not null default true,
  unique (organization_id, label)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  birth_date date,
  sex text check (sex in ('male', 'female', 'other', 'unknown')),
  civil_status text,
  address text,
  contact_number text,
  emergency_contact_name text,
  emergency_contact_number text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.incident_casualties
  add constraint incident_casualties_patient_fk
  foreign key (patient_id) references public.patients(id) on delete set null;

create table public.pcr_reports (
  id uuid primary key default gen_random_uuid(),
  response_number text not null unique default public.next_pcr_response_number(),
  incident_id uuid references public.incidents(id) on delete set null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  station_id uuid not null references public.stations(id) on delete restrict,
  team_id uuid references public.teams(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status public.pcr_status not null default 'draft',
  nature_of_call text not null default 'emergency' check (nature_of_call in ('emergency', 'conduction')),
  triage text check (triage in ('red', 'yellow', 'green', 'black')),
  chief_complaint text,
  events_prior text,
  additional_notes text,
  incident_at timestamptz,
  dispatch_at timestamptz,
  arrival_scene_at timestamptz,
  departure_scene_at timestamptz,
  arrival_hospital_at timestamptz,
  departure_hospital_at timestamptz,
  departure_hospital_generated_at timestamptz,
  back_to_base_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (departure_scene_at is null or arrival_scene_at is null or departure_scene_at >= arrival_scene_at),
  check (arrival_hospital_at is null or departure_scene_at is null or arrival_hospital_at >= departure_scene_at),
  check (departure_hospital_at is null or arrival_hospital_at is null or departure_hospital_at >= arrival_hospital_at),
  check (back_to_base_at is null or departure_hospital_at is null or back_to_base_at >= departure_hospital_at),
  check (departure_hospital_generated_at is null or departure_hospital_at is not null)
);

create table public.pcr_crew_members (
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  crew_role text not null check (crew_role in ('driver', 'main_aider', 'assistant_aider', 'other')),
  primary key (pcr_report_id, profile_id, crew_role)
);

create table public.pcr_assessments (
  pcr_report_id uuid primary key references public.pcr_reports(id) on delete cascade,
  suspected_spinal_injury boolean,
  airway_findings text,
  breathing_findings text,
  oxygen_lpm numeric(5,2) check (oxygen_lpm >= 0),
  oxygen_delivery_method text,
  pulse_findings text,
  bleeding_severity text,
  bleeding_location text,
  bleeding_controlled boolean,
  capillary_refill_seconds numeric(4,1) check (capillary_refill_seconds >= 0),
  pupil_findings text,
  skin_findings text,
  pain_present boolean,
  pain_score smallint check (pain_score between 0 and 10),
  pain_onset text,
  pain_quality text,
  pain_other text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.pcr_gcs_assessments (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  assessed_at timestamptz not null default now(),
  eye_score smallint not null check (eye_score between 1 and 4),
  verbal_score smallint not null check (verbal_score between 1 and 5),
  motor_score smallint not null check (motor_score between 1 and 6),
  total_score smallint generated always as (eye_score + verbal_score + motor_score) stored,
  assessed_by uuid references public.profiles(id) on delete set null
);

create table public.pcr_vital_signs (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  measured_at timestamptz not null,
  systolic smallint check (systolic > 0),
  diastolic smallint check (diastolic > 0),
  pulse_rate smallint check (pulse_rate >= 0),
  respiratory_rate smallint check (respiratory_rate >= 0),
  temperature_c numeric(4,1),
  oxygen_saturation smallint check (oxygen_saturation between 0 and 100),
  blood_glucose_mg_dl numeric(6,1) check (blood_glucose_mg_dl >= 0),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pcr_condition_catalog (
  id smallint generated always as identity primary key,
  category text not null check (category in ('emergency_type', 'trauma_type', 'medical_history', 'allergy', 'pain_quality')),
  code text not null,
  label text not null,
  active boolean not null default true,
  unique (category, code)
);

create table public.pcr_report_conditions (
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  condition_id smallint not null references public.pcr_condition_catalog(id) on delete restrict,
  details text,
  primary key (pcr_report_id, condition_id)
);

create table public.pcr_medications (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  medication_name text not null,
  dose text,
  route text,
  administered_at timestamptz,
  administered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pcr_treatments (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  treatment_type text not null,
  details text,
  performed_at timestamptz,
  performed_by uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pcr_obstetric_assessments (
  pcr_report_id uuid primary key references public.pcr_reports(id) on delete cascade,
  last_menstrual_period date,
  gravida smallint check (gravida >= 0),
  para smallint check (para >= 0),
  estimated_date_of_confinement date,
  bag_of_waters_status text,
  age_of_gestation_weeks numeric(4,1),
  baby_status text,
  internal_exam_findings text,
  placenta_status text
);

create table public.pcr_vehicle_crash_assessments (
  pcr_report_id uuid primary key references public.pcr_reports(id) on delete cascade,
  crash_type text,
  vehicle_involved text,
  patient_role text,
  plate_number text,
  alcohol_suspected boolean,
  helmet_used boolean,
  licensed_driver boolean,
  details text
);

create table public.pcr_hospitalizations (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  confinement_date date,
  facility_name text,
  reason text
);

create table public.pcr_patient_history (
  pcr_report_id uuid primary key references public.pcr_reports(id) on delete cascade,
  last_oral_intake text,
  last_oral_intake_at timestamptz,
  smoking_status text,
  cigarettes_per_day smallint check (cigarettes_per_day >= 0),
  smoking_stopped_at date,
  alcohol_status text,
  alcohol_frequency text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pcr_hospital_endorsements (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null unique references public.pcr_reports(id) on delete cascade,
  facility_name text not null,
  resident_on_duty text,
  arrival_at timestamptz not null,
  consent_for_care text,
  endorsed_to text,
  received_by text,
  receiver_name text,
  receiver_position text,
  receiver_contact text,
  receiver_confirmed_at timestamptz,
  reason_for_transfer text,
  valuables_description text,
  valuables_received_by text,
  valuables_receiver_contact text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.pcr_transfers (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  from_facility text,
  to_facility text not null,
  reason text,
  arrival_at timestamptz,
  departure_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (departure_at is null or arrival_at is null or departure_at >= arrival_at)
);

create table public.pcr_waivers (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null unique references public.pcr_reports(id) on delete cascade,
  accepted boolean not null default false,
  refusal_reason text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not accepted or accepted_at is not null)
);

create table public.pcr_signatures (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  signer_type text not null check (signer_type in ('patient', 'witness', 'resident', 'receiver', 'consent')),
  signer_name text,
  signer_profile_id uuid references public.profiles(id) on delete set null,
  storage_path text not null unique,
  signed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.pcr_body_marks (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  body_view text not null check (body_view in ('front', 'back')),
  mark_type text not null,
  label text,
  x_percent numeric(6,3) not null check (x_percent between 0 and 100),
  y_percent numeric(6,3) not null check (y_percent between 0 and 100),
  details text,
  created_at timestamptz not null default now()
);

create table public.pcr_attachments (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  kind public.attachment_kind not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  location extensions.geography(point, 4326),
  captured_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.pcr_reviews (
  id uuid primary key default gen_random_uuid(),
  pcr_report_id uuid not null references public.pcr_reports(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  decision public.pcr_status not null check (decision in ('verified', 'rejected')),
  comments text,
  reviewed_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete cascade,
  pcr_report_id uuid references public.pcr_reports(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  channel public.notification_channel not null default 'in_app',
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  channel public.notification_channel not null,
  enabled boolean not null default true,
  critical_only boolean not null default false,
  primary key (profile_id, event_type, channel)
);

create table public.user_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('light', 'dark', 'system')),
  language text not null default 'en',
  timezone text not null default 'Asia/Manila',
  compact_view boolean not null default false,
  twelve_hour_clock boolean not null default false,
  show_coordinates boolean not null default false,
  map_default_view text not null default 'street',
  map_default_zoom smallint not null default 14 check (map_default_zoom between 1 and 22),
  map_refresh_seconds integer not null default 30 check (map_refresh_seconds >= 5),
  show_heatmap boolean not null default true,
  show_danger_zones boolean not null default true,
  show_road_network boolean not null default true,
  show_location_labels boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

create table public.offline_sync_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  client_mutation_id uuid not null,
  entity_table text not null,
  entity_id uuid not null,
  operation public.sync_operation not null,
  payload jsonb not null,
  base_updated_at timestamptz,
  status public.sync_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  conflict_value jsonb,
  queued_at timestamptz not null default now(),
  processing_started_at timestamptz,
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (profile_id, device_id, client_mutation_id)
);

create table public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null unique,
  source_type text not null default 'news',
  active boolean not null default true,
  crawl_interval_minutes integer not null default 60 check (crawl_interval_minutes >= 5),
  last_crawled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.scraped_incident_articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources(id) on delete restrict,
  canonical_url text not null unique,
  external_identifier text,
  title text not null,
  summary text,
  article_text text,
  author_name text,
  published_at timestamptz,
  scraped_at timestamptz not null default now(),
  content_hash text not null unique,
  detected_incident_type public.incident_type,
  detected_location_text text,
  detected_location extensions.geography(point, 4326),
  extraction_confidence numeric(5,4) check (extraction_confidence between 0 and 1),
  ingestion_status public.ingestion_status not null default 'pending',
  matched_incident_id uuid references public.incidents(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.analytics_daily_metrics (
  station_id uuid not null references public.stations(id) on delete cascade,
  metric_date date not null,
  incident_type public.incident_type not null,
  reported_count integer not null default 0 check (reported_count >= 0),
  resolved_count integer not null default 0 check (resolved_count >= 0),
  casualty_count integer not null default 0 check (casualty_count >= 0),
  average_dispatch_seconds numeric(12,2),
  average_response_seconds numeric(12,2),
  average_resolution_seconds numeric(12,2),
  refreshed_at timestamptz not null default now(),
  primary key (station_id, metric_date, incident_type)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  schema_name text not null default 'public',
  table_name text not null,
  record_id text,
  action public.audit_action not null,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  previous_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Project seed/reference data
insert into public.organizations (code, name, organization_type, address)
values ('MDRRMO-ECHAGUE', 'MDRRMO Echague', 'mdrrmo', 'Echague, Isabela');

insert into public.stations (organization_id, code, name, address, location)
select id, 'CENTRAL', 'MDRRMO Echague Central Station', 'Echague, Isabela',
       extensions.st_setsrid(extensions.st_makepoint(121.6722, 16.7023), 4326)::extensions.geography
from public.organizations where code = 'MDRRMO-ECHAGUE';

insert into public.emergency_contacts (organization_id, label, phone_number, display_order)
select id, contact.label, contact.phone_number, contact.display_order
from public.organizations
cross join (values
  ('Emergency Hotline', '911', 1),
  ('MDRRMO Office', '036-268-5123', 2),
  ('Fire Station', '036-268-3456', 3),
  ('Police (PNP)', '036-268-7890', 4),
  ('District Hospital', '036-268-2100', 5)
) as contact(label, phone_number, display_order)
where code = 'MDRRMO-ECHAGUE';

insert into public.pcr_condition_catalog(category, code, label) values
  ('emergency_type','medical','Medical'), ('emergency_type','pediatric','Pediatric'),
  ('emergency_type','psychiatric','Psychiatric'), ('emergency_type','surgical','Surgical'),
  ('emergency_type','obstetrical','Obstetrical'), ('emergency_type','drowning','Drowning'),
  ('emergency_type','other','Other Emergency'),
  ('trauma_type','trauma','Trauma'), ('trauma_type','fall','Fall'),
  ('trauma_type','electrocution','Electrocution'), ('trauma_type','domestic_violence','Domestic Violence'),
  ('trauma_type','water_rescue','Water Rescue Incident'), ('trauma_type','fire_incident','Fire Incident'),
  ('trauma_type','assault','Assault'), ('trauma_type','animal_bite','Animal Bite'),
  ('trauma_type','motor_vehicle_crash','Motor Vehicle Crash'),
  ('medical_history','none','None'), ('medical_history','heart_disease','Heart Disease'),
  ('medical_history','hypertension','Hypertension'), ('medical_history','seizure','Seizure'),
  ('medical_history','copd','COPD'), ('medical_history','diabetes','Diabetes Mellitus'),
  ('medical_history','asthma','Asthma'), ('medical_history','stroke','Stroke'),
  ('allergy','food','Food Allergy'), ('allergy','drug','Drug Allergy'), ('allergy','other','Other Allergy'),
  ('pain_quality','crushing','Crushing'), ('pain_quality','stabbing','Stabbing'),
  ('pain_quality','aching','Aching'), ('pain_quality','gnawing','Gnawing'),
  ('pain_quality','burning','Burning'), ('pain_quality','tearing','Tearing'),
  ('pain_quality','cramping','Cramping');

insert into public.system_settings(key, value, description) values
  ('map', '{"default_center":{"latitude":16.7023,"longitude":121.6722},"default_zoom":14,"refresh_seconds":30}'::jsonb, 'Shared map defaults'),
  ('ai_prediction', '{"enabled":true,"prediction_window_hours":24,"confidence_threshold":0.60,"radius_meters":500}'::jsonb, 'Spatial-temporal risk prediction defaults'),
  ('security', '{"session_timeout_minutes":30,"require_mfa_for_administrators":true}'::jsonb, 'System security defaults');

-- High-value indexes
create index profiles_station_idx on public.profiles(station_id, account_status);
create index teams_station_status_idx on public.teams(station_id, duty_status) where active;
create index vehicles_station_status_idx on public.vehicles(station_id, duty_status) where active;
create index vehicles_location_gix on public.vehicles using gist(last_location);
create index map_locations_location_gix on public.map_locations using gist(location);
create index incidents_station_status_time_idx on public.incidents(station_id, status, reported_at desc);
create index incidents_type_severity_time_idx on public.incidents(incident_type, severity, reported_at desc);
create index incidents_location_gix on public.incidents using gist(location);
create index incidents_search_idx on public.incidents using gin(to_tsvector('simple', coalesce(incident_number, '') || ' ' || coalesce(location_text, '') || ' ' || coalesce(description, '')));
create index incident_assignments_incident_idx on public.incident_assignments(incident_id, assigned_at desc);
create index incident_assignments_team_idx on public.incident_assignments(team_id, cleared_at);
create index incident_events_incident_time_idx on public.incident_events(incident_id, event_at desc);
create index incident_casualties_incident_idx on public.incident_casualties(incident_id);
create index hazard_zones_boundary_gix on public.hazard_zones using gist(boundary);
create index risk_predictions_area_gix on public.risk_predictions using gist(predicted_area);
create index risk_predictions_window_idx on public.risk_predictions(station_id, prediction_start, prediction_end);
create index public_alerts_active_idx on public.public_alerts(published_at desc) where active;
create index patients_name_search_idx on public.patients using gin(to_tsvector('simple', coalesce(full_name, '')));
create index pcr_reports_creator_updated_idx on public.pcr_reports(created_by, updated_at desc);
create index pcr_reports_station_status_idx on public.pcr_reports(station_id, status, updated_at desc);
create index pcr_reports_incident_idx on public.pcr_reports(incident_id);
create index pcr_vitals_report_time_idx on public.pcr_vital_signs(pcr_report_id, measured_at);
create index pcr_treatments_report_time_idx on public.pcr_treatments(pcr_report_id, performed_at);
create index notifications_recipient_unread_idx on public.notifications(recipient_id, created_at desc) where read_at is null;
create index audit_logs_record_time_idx on public.audit_logs(table_name, record_id, created_at desc);
create index audit_logs_actor_time_idx on public.audit_logs(actor_id, created_at desc);
create index sync_queue_profile_status_idx on public.offline_sync_queue(profile_id, status, queued_at);
create index sync_queue_pending_idx on public.offline_sync_queue(queued_at) where status in ('pending', 'failed', 'conflict');
create index scraped_articles_status_time_idx on public.scraped_incident_articles(ingestion_status, published_at desc);
create index scraped_articles_location_gix on public.scraped_incident_articles using gist(detected_location);
create index scraped_articles_search_idx on public.scraped_incident_articles using gin(to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(article_text, '')));
create index analytics_daily_date_idx on public.analytics_daily_metrics(metric_date desc, station_id);

-- Authorization helpers
create function public.has_role(required_role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    where pr.profile_id = auth.uid() and r.name = required_role
  );
$$;

create function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    join public.profile_roles pr on pr.profile_id = p.id
    join public.roles r on r.id = pr.role_id
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.deleted_at is null
      and r.name in ('administrator', 'supervisor', 'dispatcher', 'operations_officer', 'field_responder')
  );
$$;

create function public.current_station_id()
returns uuid language sql stable security definer set search_path = public as $$
  select station_id from public.profiles where id = auth.uid() and account_status = 'active' and deleted_at is null;
$$;

create function public.current_organization_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid() and account_status = 'active' and deleted_at is null;
$$;

create function public.can_access_incident(target_incident_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('administrator')
    or exists (
      select 1 from public.incidents i
      where i.id = target_incident_id and i.deleted_at is null and (
        i.created_by = auth.uid()
        or i.station_id = public.current_station_id() and (
          public.has_role('supervisor') or public.has_role('dispatcher') or public.has_role('operations_officer')
        )
        or exists (
          select 1 from public.incident_assignments ia
          join public.team_members tm on tm.team_id = ia.team_id and tm.left_at is null
          where ia.incident_id = i.id and tm.profile_id = auth.uid()
        )
      )
    );
$$;

create function public.can_manage_incident(target_incident_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('administrator')
    or exists (
      select 1 from public.incidents i
      where i.id = target_incident_id and i.deleted_at is null and i.station_id = public.current_station_id()
        and (
          public.has_role('supervisor') or public.has_role('dispatcher') or public.has_role('operations_officer')
          or exists (
            select 1 from public.incident_assignments ia
            join public.team_members tm on tm.team_id = ia.team_id and tm.left_at is null
            where ia.incident_id = i.id and tm.profile_id = auth.uid()
          )
        )
    );
$$;

create function public.can_access_pcr(target_pcr_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('administrator')
    or exists (
      select 1 from public.pcr_reports p
      where p.id = target_pcr_id and p.deleted_at is null and (
        p.created_by = auth.uid()
        or p.station_id = public.current_station_id() and public.has_role('supervisor')
        or exists (select 1 from public.pcr_crew_members c where c.pcr_report_id = p.id and c.profile_id = auth.uid())
      )
    );
$$;

create function public.can_edit_pcr(target_pcr_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('administrator')
    or exists (
      select 1 from public.pcr_reports p
      where p.id = target_pcr_id and p.deleted_at is null and (
        (public.has_role('supervisor') and p.station_id = public.current_station_id())
        or (p.status in ('draft', 'rejected') and (
          p.created_by = auth.uid()
          or exists (select 1 from public.pcr_crew_members c where c.pcr_report_id = p.id and c.profile_id = auth.uid())
        ))
      )
    );
$$;

create function public.safe_uuid(value text)
returns uuid language plpgsql immutable set search_path = public as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Shared triggers and workflow functions
create function public.set_updated_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.set_updated_actor()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare action_name public.audit_action;
begin
  action_name := case tg_op when 'INSERT' then 'insert'::public.audit_action when 'UPDATE' then 'update'::public.audit_action else 'delete'::public.audit_action end;
  insert into public.audit_logs(table_name, record_id, action, previous_value, new_value)
  values (tg_table_name, coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'), action_name, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

create function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, contact_number)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), new.raw_user_meta_data->>'contact_number')
  on conflict (id) do nothing;
  insert into public.user_preferences(profile_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger auth_user_created
after insert on auth.users for each row execute function public.handle_new_auth_user();

create function public.sync_hospital_arrival()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.arrival_hospital_at is distinct from old.arrival_hospital_at and new.arrival_hospital_at is not null then
    update public.pcr_hospital_endorsements set arrival_at = new.arrival_hospital_at where pcr_report_id = new.id;
    update public.pcr_transfers set arrival_at = new.arrival_hospital_at where pcr_report_id = new.id and arrival_at is null;
  end if;
  return new;
end;
$$;

create function public.protect_generated_departure()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.departure_hospital_at is distinct from new.departure_hospital_at
    and not public.has_role('administrator')
    and current_setting('app.handover_transition', true) is distinct from 'true'
  then raise exception 'Departure-at-hospital is generated by complete_hospital_handover()'; end if;
  return new;
end;
$$;

create function public.protect_operational_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.has_role('administrator')
    and (old.created_by is distinct from new.created_by or old.station_id is distinct from new.station_id)
  then raise exception 'Only administrators may change record ownership or station'; end if;
  return new;
end;
$$;

create function public.protect_public_incident_verification()
returns trigger language plpgsql set search_path = public as $$
begin
  if (
      (tg_op = 'INSERT' and (new.public_visible or new.verified_for_public_at is not null or new.verified_for_public_by is not null))
      or (tg_op = 'UPDATE' and (
        old.public_visible is distinct from new.public_visible
        or old.verified_for_public_at is distinct from new.verified_for_public_at
        or old.verified_for_public_by is distinct from new.verified_for_public_by
      ))
    ) and not (public.has_role('administrator') or public.has_role('supervisor'))
  then raise exception 'Only administrators and supervisors may publish or verify incidents for public viewing'; end if;
  if (new.verified_for_public_at is null) is distinct from (new.verified_for_public_by is null)
  then raise exception 'Public verification timestamp and verifier must be provided together'; end if;
  if new.public_visible and (new.verified_for_public_at is null or new.verified_for_public_by is null)
  then raise exception 'Public incidents must include verification timestamp and verifier'; end if;
  return new;
end;
$$;

create function public.protect_pcr_status_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if (
      old.status is distinct from new.status
      or old.submitted_at is distinct from new.submitted_at
      or old.submitted_by is distinct from new.submitted_by
      or old.verified_at is distinct from new.verified_at
      or old.verified_by is distinct from new.verified_by
      or old.rejection_reason is distinct from new.rejection_reason
      or old.archived_at is distinct from new.archived_at
    )
    and not public.has_role('administrator')
    and current_setting('app.pcr_transition', true) is distinct from 'true'
  then raise exception 'Use the approved PCR workflow function for status and review changes'; end if;
  return new;
end;
$$;

create function public.complete_hospital_handover(target_pcr_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare generated_time timestamptz;
begin
  if not public.can_edit_pcr(target_pcr_id) then raise exception 'Not authorized'; end if;
  select departure_hospital_at into generated_time from public.pcr_reports where id = target_pcr_id for update;
  if generated_time is not null then return generated_time; end if;
  if not exists (
    select 1 from public.pcr_hospital_endorsements
    where pcr_report_id = target_pcr_id
      and nullif(trim(receiver_name), '') is not null
      and nullif(trim(receiver_position), '') is not null
      and nullif(trim(receiver_contact), '') is not null
      and receiver_confirmed_at is not null
  ) then raise exception 'Complete and confirm receiver information before hospital departure'; end if;
  generated_time := now();
  perform set_config('app.handover_transition', 'true', true);
  update public.pcr_reports set departure_hospital_at = generated_time, departure_hospital_generated_at = generated_time where id = target_pcr_id;
  update public.pcr_transfers set departure_at = generated_time where pcr_report_id = target_pcr_id and departure_at is null;
  insert into public.audit_logs(table_name, record_id, action, new_value)
  values ('pcr_reports', target_pcr_id::text, 'handover_complete', jsonb_build_object('departure_hospital_at', generated_time));
  return generated_time;
end;
$$;

create function public.submit_pcr(target_pcr_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.pcr_reports
    where id = target_pcr_id and status in ('draft', 'rejected')
      and public.can_edit_pcr(id)
  ) then raise exception 'PCR is not eligible for submission'; end if;
  perform set_config('app.pcr_transition', 'true', true);
  update public.pcr_reports
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(), rejection_reason = null
  where id = target_pcr_id;
  insert into public.audit_logs(table_name, record_id, action, new_value)
  values ('pcr_reports', target_pcr_id::text, 'status_change', jsonb_build_object('status', 'submitted'));
end;
$$;

create function public.review_pcr(target_pcr_id uuid, decision public.pcr_status, comments text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role('administrator') or public.has_role('supervisor')) then raise exception 'Not authorized to review PCR reports'; end if;
  if decision not in ('verified', 'rejected') then raise exception 'Decision must be verified or rejected'; end if;
  if decision = 'rejected' and nullif(trim(comments), '') is null then raise exception 'Rejection comments are required'; end if;
  perform set_config('app.pcr_transition', 'true', true);
  update public.pcr_reports
    set status = decision, verified_by = case when decision = 'verified' then auth.uid() else null end,
        verified_at = case when decision = 'verified' then now() else null end,
        rejection_reason = case when decision = 'rejected' then comments else null end
    where id = target_pcr_id and (station_id = public.current_station_id() or public.has_role('administrator'));
  if not found then raise exception 'PCR not found or inaccessible'; end if;
  insert into public.pcr_reviews(pcr_report_id, decision, comments) values (target_pcr_id, decision, comments);
  insert into public.audit_logs(table_name, record_id, action, new_value)
  values ('pcr_reports', target_pcr_id::text, case when decision = 'verified' then 'verify'::public.audit_action else 'reject'::public.audit_action end, jsonb_build_object('decision', decision, 'comments', comments));
end;
$$;

create function public.set_pcr_archived(target_pcr_id uuid, archived boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.pcr_reports
    where id = target_pcr_id and (
      created_by = auth.uid() or public.has_role('administrator')
      or public.has_role('supervisor') and station_id = public.current_station_id()
    )
  ) then raise exception 'Not authorized to archive this PCR'; end if;
  perform set_config('app.pcr_transition', 'true', true);
  update public.pcr_reports set archived_at = case when archived then now() else null end where id = target_pcr_id;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations','stations','profiles','registration_requests','teams','vehicles','map_locations',
    'pcr_waivers','user_preferences','system_settings','offline_sync_queue','scraped_incident_articles'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_fields()', table_name || '_set_updated', table_name);
  end loop;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'incidents','hazard_zones','public_alerts','patients','pcr_reports','pcr_assessments',
    'pcr_treatments','pcr_patient_history','pcr_hospital_endorsements','pcr_transfers',
    'incident_assignments','incident_attachments','pcr_attachments','news_sources'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_actor()', table_name || '_set_updated_actor', table_name);
  end loop;
end;
$$;

create trigger pcr_protect_departure before update on public.pcr_reports for each row execute function public.protect_generated_departure();
create trigger incident_protect_ownership before update on public.incidents for each row execute function public.protect_operational_ownership();
create trigger incident_protect_public_verification before insert or update on public.incidents for each row execute function public.protect_public_incident_verification();
create trigger pcr_protect_ownership before update on public.pcr_reports for each row execute function public.protect_operational_ownership();
create trigger pcr_protect_status before update on public.pcr_reports for each row execute function public.protect_pcr_status_transition();
create trigger pcr_sync_arrival after update of arrival_hospital_at on public.pcr_reports for each row execute function public.sync_hospital_arrival();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','profile_roles','registration_requests','teams','team_members','vehicles','incidents','incident_casualties',
    'incident_assignments','hazard_zones','risk_predictions','public_alerts','patients','pcr_reports',
    'pcr_assessments','pcr_gcs_assessments','pcr_vital_signs','pcr_report_conditions','pcr_medications',
    'pcr_treatments','pcr_patient_history','pcr_hospital_endorsements','pcr_transfers','pcr_waivers','pcr_signatures','pcr_attachments','pcr_reviews',
    'news_sources','scraped_incident_articles'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.write_audit_log()', table_name || '_audit', table_name);
  end loop;
end;
$$;

-- Privacy-safe public views
create view public.public_incidents with (security_barrier = true) as
select id, incident_number, incident_type, severity, status,
       coalesce(public_description, title, 'Emergency incident') as description,
       location_text, location, reported_at, resolved_at,
       (select count(*) from public.incident_casualties c where c.incident_id = incidents.id) as casualty_count
from public.incidents
where public_visible
  and verified_for_public_at is not null
  and deleted_at is null
  and status <> 'cancelled';

create view public.active_public_alerts with (security_barrier = true) as
select id, title, message, severity, published_at, expires_at
from public.public_alerts
where active and deleted_at is null and published_at <= now() and (expires_at is null or expires_at > now());

create view public.incident_analytics_daily with (security_invoker = true, security_barrier = true) as
select station_id, date_trunc('day', reported_at) as day, incident_type, severity, status,
       count(*) as incident_count,
       avg(extract(epoch from (resolved_at - reported_at)) / 60) filter (where resolved_at is not null) as avg_resolution_minutes
from public.incidents
where deleted_at is null
group by station_id, date_trunc('day', reported_at), incident_type, severity, status;

-- Row Level Security
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations','stations','roles','profiles','profile_roles','registration_requests','teams','team_members','vehicles',
    'map_locations','incidents','incident_casualties','incident_assignments','incident_events','incident_attachments','hazard_zones','risk_predictions',
    'public_alerts','emergency_contacts','patients','pcr_reports','pcr_crew_members','pcr_assessments','pcr_gcs_assessments',
    'pcr_vital_signs','pcr_condition_catalog','pcr_report_conditions','pcr_medications','pcr_treatments',
    'pcr_obstetric_assessments','pcr_vehicle_crash_assessments','pcr_hospitalizations','pcr_patient_history','pcr_hospital_endorsements',
    'pcr_transfers','pcr_waivers','pcr_signatures','pcr_body_marks','pcr_attachments','pcr_reviews','notifications',
    'notification_preferences','user_preferences','system_settings','offline_sync_queue','news_sources',
    'scraped_incident_articles','analytics_daily_metrics','audit_logs'
  ] loop execute format('alter table public.%I enable row level security', table_name); end loop;
end;
$$;

create policy reference_staff_read on public.organizations for select to authenticated using (public.has_role('administrator') or id = public.current_organization_id());
create policy organizations_admin_manage on public.organizations for all to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy stations_staff_read on public.stations for select to authenticated using (public.has_role('administrator') or organization_id = public.current_organization_id());
create policy stations_admin_manage on public.stations for all to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy roles_staff_read on public.roles for select to authenticated using (public.is_staff());
create policy profiles_staff_read on public.profiles for select to authenticated using (id = auth.uid() or public.has_role('administrator') or station_id = public.current_station_id());
create policy profiles_admin_all on public.profiles for all to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy profile_roles_admin_all on public.profile_roles for all to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy profile_roles_self_read on public.profile_roles for select to authenticated using (profile_id = auth.uid());
create policy registration_insert on public.registration_requests for insert to authenticated with check (auth_user_id = auth.uid() and status = 'pending' and reviewed_by is null and reviewed_at is null);
create policy registration_self_read on public.registration_requests for select to authenticated using (auth_user_id = auth.uid() or public.has_role('administrator'));
create policy registration_admin_update on public.registration_requests for update to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));

create policy teams_staff_read on public.teams for select to authenticated using (public.is_staff() and deleted_at is null and (public.has_role('administrator') or station_id = public.current_station_id()));
create policy teams_dispatch_manage on public.teams for all to authenticated using (public.has_role('administrator') or station_id = public.current_station_id() and (public.has_role('dispatcher') or public.has_role('supervisor'))) with check (public.has_role('administrator') or station_id = public.current_station_id() and (public.has_role('dispatcher') or public.has_role('supervisor')));
create policy team_members_staff_read on public.team_members for select to authenticated using (profile_id = auth.uid() or public.has_role('administrator') or exists (select 1 from public.teams t where t.id = team_id and t.station_id = public.current_station_id()));
create policy team_members_manage on public.team_members for all to authenticated using (public.has_role('administrator') or exists (select 1 from public.teams t where t.id = team_id and t.station_id = public.current_station_id() and (public.has_role('dispatcher') or public.has_role('supervisor')))) with check (public.has_role('administrator') or exists (select 1 from public.teams t where t.id = team_id and t.station_id = public.current_station_id() and (public.has_role('dispatcher') or public.has_role('supervisor'))));
create policy vehicles_staff_read on public.vehicles for select to authenticated using (public.is_staff() and deleted_at is null and (public.has_role('administrator') or station_id = public.current_station_id()));
create policy vehicles_manage on public.vehicles for all to authenticated using (public.has_role('administrator') or station_id = public.current_station_id() and (public.has_role('dispatcher') or public.has_role('supervisor'))) with check (public.has_role('administrator') or station_id = public.current_station_id() and (public.has_role('dispatcher') or public.has_role('supervisor')));

create policy map_locations_public_read on public.map_locations for select to anon, authenticated using (deleted_at is null and (public_visible or public.is_staff() and (public.has_role('administrator') or station_id = public.current_station_id())));
create policy map_locations_admin_manage on public.map_locations for all to authenticated using (public.has_role('administrator') or station_id = public.current_station_id() and public.has_role('supervisor')) with check (public.has_role('administrator') or station_id = public.current_station_id() and public.has_role('supervisor'));
create policy incidents_staff_read on public.incidents for select to authenticated using (public.can_access_incident(id));
create policy incidents_create on public.incidents for insert to authenticated with check (
  public.is_staff()
  and created_by = auth.uid()
  and (public.has_role('administrator') or station_id = public.current_station_id())
  and (
    public.has_role('administrator') or public.has_role('supervisor')
    or (not public_visible and verified_for_public_at is null and verified_for_public_by is null)
  )
);
create policy incidents_manage on public.incidents for update to authenticated using (public.can_manage_incident(id)) with check (public.can_manage_incident(id));
create policy incident_casualties_read on public.incident_casualties for select to authenticated using (public.can_access_incident(incident_id));
create policy incident_casualties_manage on public.incident_casualties for all to authenticated using (public.can_manage_incident(incident_id)) with check (public.can_manage_incident(incident_id));
create policy incident_assignments_read on public.incident_assignments for select to authenticated using (public.can_access_incident(incident_id));
create policy incident_assignments_manage on public.incident_assignments for all to authenticated using ((public.has_role('administrator') or public.has_role('dispatcher') or public.has_role('supervisor') or public.has_role('operations_officer')) and public.can_access_incident(incident_id)) with check ((public.has_role('administrator') or public.has_role('dispatcher') or public.has_role('supervisor') or public.has_role('operations_officer')) and public.can_access_incident(incident_id));
create policy incident_events_read on public.incident_events for select to authenticated using (public.can_access_incident(incident_id));
create policy incident_events_insert on public.incident_events for insert to authenticated with check (public.can_access_incident(incident_id));
create policy incident_attachments_access on public.incident_attachments for all to authenticated using (public.can_access_incident(incident_id)) with check (public.can_access_incident(incident_id));

create policy hazard_public_read on public.hazard_zones for select to anon, authenticated using (deleted_at is null and (public_visible and active or public.is_staff() and (public.has_role('administrator') or station_id = public.current_station_id())));
create policy hazard_manage on public.hazard_zones for all to authenticated using (public.has_role('administrator') or station_id = public.current_station_id() and (public.has_role('supervisor') or public.has_role('dispatcher'))) with check (public.has_role('administrator') or station_id = public.current_station_id() and (public.has_role('supervisor') or public.has_role('dispatcher')));
create policy predictions_staff_read on public.risk_predictions for select to authenticated using (public.has_role('administrator') or station_id = public.current_station_id());
create policy predictions_manage on public.risk_predictions for all to authenticated using (public.has_role('administrator') or station_id = public.current_station_id() and public.has_role('supervisor')) with check (public.has_role('administrator') or station_id = public.current_station_id() and public.has_role('supervisor'));
create policy alerts_public_read on public.public_alerts for select to anon, authenticated using (deleted_at is null and (active and published_at <= now() and (expires_at is null or expires_at > now()) or public.is_staff() and (public.has_role('administrator') or station_id = public.current_station_id())));
create policy alerts_manage on public.public_alerts for all to authenticated using (public.has_role('administrator') or station_id = public.current_station_id() and (public.has_role('supervisor') or public.has_role('dispatcher'))) with check (public.has_role('administrator') or station_id = public.current_station_id() and (public.has_role('supervisor') or public.has_role('dispatcher')));
create policy emergency_contacts_public_read on public.emergency_contacts for select to anon, authenticated using (active or public.has_role('administrator') or organization_id = public.current_organization_id());
create policy emergency_contacts_admin_manage on public.emergency_contacts for all to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));

create policy patients_read_via_pcr on public.patients for select to authenticated using (exists (select 1 from public.pcr_reports p where p.patient_id = id and public.can_access_pcr(p.id)));
create policy patients_insert_staff on public.patients for insert to authenticated with check (public.is_staff() and created_by = auth.uid());
create policy patients_update_owner_admin on public.patients for update to authenticated using (created_by = auth.uid() or public.has_role('administrator')) with check (created_by = auth.uid() or public.has_role('administrator'));
create policy pcr_read_scope on public.pcr_reports for select to authenticated using (public.can_access_pcr(id));
create policy pcr_insert_own on public.pcr_reports for insert to authenticated with check (created_by = auth.uid() and station_id = public.current_station_id() and (public.has_role('field_responder') or public.has_role('operations_officer') or public.has_role('administrator') or public.has_role('supervisor')));
create policy pcr_update_scope on public.pcr_reports for update to authenticated using (public.can_edit_pcr(id)) with check (public.can_edit_pcr(id));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'pcr_crew_members','pcr_assessments','pcr_gcs_assessments','pcr_vital_signs','pcr_report_conditions','pcr_medications',
    'pcr_treatments','pcr_obstetric_assessments','pcr_vehicle_crash_assessments','pcr_hospitalizations',
    'pcr_patient_history','pcr_hospital_endorsements','pcr_transfers','pcr_waivers','pcr_signatures','pcr_body_marks','pcr_attachments','pcr_reviews'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_pcr(pcr_report_id))', table_name || '_pcr_read', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit_pcr(pcr_report_id))', table_name || '_pcr_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_pcr(pcr_report_id)) with check (public.can_edit_pcr(pcr_report_id))', table_name || '_pcr_update', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_pcr(pcr_report_id))', table_name || '_pcr_delete', table_name);
  end loop;
end;
$$;

create policy condition_catalog_staff_read on public.pcr_condition_catalog for select to authenticated using (public.is_staff());
create policy condition_catalog_admin_manage on public.pcr_condition_catalog for all to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy notifications_own on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notification_preferences_own on public.notification_preferences for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy user_preferences_own on public.user_preferences for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy system_settings_staff_read on public.system_settings for select to authenticated using (public.is_staff());
create policy system_settings_admin_manage on public.system_settings for all to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy sync_queue_own_read on public.offline_sync_queue for select to authenticated using (profile_id = auth.uid());
create policy sync_queue_own_insert on public.offline_sync_queue for insert to authenticated with check (profile_id = auth.uid() and status = 'pending' and attempt_count = 0);
create policy sync_queue_own_update on public.offline_sync_queue for update to authenticated using (profile_id = auth.uid() and status = 'pending') with check (profile_id = auth.uid() and status = 'pending');
create policy sync_queue_own_delete on public.offline_sync_queue for delete to authenticated using (profile_id = auth.uid() and status in ('synced', 'failed'));
create policy news_sources_staff_read on public.news_sources for select to authenticated using (public.is_staff() and deleted_at is null);
create policy news_sources_admin_manage on public.news_sources for all to authenticated using (public.has_role('administrator')) with check (public.has_role('administrator'));
create policy scraped_articles_staff_read on public.scraped_incident_articles for select to authenticated using (public.is_staff() and deleted_at is null);
create policy scraped_articles_review on public.scraped_incident_articles for update to authenticated
  using (deleted_at is null and (public.has_role('administrator') or public.has_role('supervisor') or public.has_role('operations_officer')))
  with check (public.has_role('administrator') or public.has_role('supervisor') or public.has_role('operations_officer'));
create policy analytics_station_read on public.analytics_daily_metrics for select to authenticated
  using (public.has_role('administrator') or public.is_staff() and station_id = public.current_station_id());
create policy audit_admin_supervisor_read on public.audit_logs for select to authenticated using (public.has_role('administrator') or public.has_role('supervisor'));

-- Storage buckets and object policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('incident-attachments', 'incident-attachments', false, 20971520, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('pcr-attachments', 'pcr-attachments', false, 20971520, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('pcr-signatures', 'pcr-signatures', false, 5242880, array['image/png','image/jpeg'])
on conflict (id) do nothing;

create policy incident_storage_read on storage.objects for select to authenticated
using (bucket_id = 'incident-attachments' and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_access_incident(public.safe_uuid((storage.foldername(name))[1])));
create policy incident_storage_write on storage.objects for insert to authenticated
with check (bucket_id = 'incident-attachments' and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_access_incident(public.safe_uuid((storage.foldername(name))[1])));
create policy incident_storage_update on storage.objects for update to authenticated
using (bucket_id = 'incident-attachments' and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_access_incident(public.safe_uuid((storage.foldername(name))[1])))
with check (bucket_id = 'incident-attachments' and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_access_incident(public.safe_uuid((storage.foldername(name))[1])));
create policy incident_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'incident-attachments' and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_access_incident(public.safe_uuid((storage.foldername(name))[1])));
create policy pcr_storage_read on storage.objects for select to authenticated
using (bucket_id in ('pcr-attachments','pcr-signatures') and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_access_pcr(public.safe_uuid((storage.foldername(name))[1])));
create policy pcr_storage_write on storage.objects for insert to authenticated
with check (bucket_id in ('pcr-attachments','pcr-signatures') and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_edit_pcr(public.safe_uuid((storage.foldername(name))[1])));
create policy pcr_storage_update on storage.objects for update to authenticated
using (bucket_id in ('pcr-attachments','pcr-signatures') and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_edit_pcr(public.safe_uuid((storage.foldername(name))[1])))
with check (bucket_id in ('pcr-attachments','pcr-signatures') and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_edit_pcr(public.safe_uuid((storage.foldername(name))[1])));
create policy pcr_storage_delete on storage.objects for delete to authenticated
using (bucket_id in ('pcr-attachments','pcr-signatures') and public.safe_uuid((storage.foldername(name))[1]) is not null and public.can_edit_pcr(public.safe_uuid((storage.foldername(name))[1])));

-- Grants: RLS remains authoritative.
revoke execute on all functions in schema public from public;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.public_incidents, public.active_public_alerts to anon, authenticated;
grant select on public.map_locations, public.hazard_zones, public.emergency_contacts to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.public_incidents, public.active_public_alerts, public.incident_analytics_daily from authenticated;
grant select on public.incident_analytics_daily to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.has_role(public.app_role), public.current_station_id(), public.current_organization_id() to anon, authenticated;
grant execute on function public.can_access_incident(uuid), public.can_manage_incident(uuid),
  public.can_access_pcr(uuid), public.can_edit_pcr(uuid), public.safe_uuid(text),
  public.next_incident_number(), public.next_pcr_response_number() to authenticated;
grant execute on function public.complete_hospital_handover(uuid) to authenticated;
grant execute on function public.submit_pcr(uuid) to authenticated;
grant execute on function public.review_pcr(uuid, public.pcr_status, text) to authenticated;
grant execute on function public.set_pcr_archived(uuid, boolean) to authenticated;
revoke all on public.audit_logs from anon;

commit;

-- FIRST ADMIN BOOTSTRAP (run separately after creating the first Auth user):
-- update public.profiles
-- set organization_id = (select id from public.organizations where code = 'MDRRMO-ECHAGUE'),
--     station_id = (select id from public.stations where code = 'CENTRAL'),
--     account_status = 'active'
-- where id = (select id from auth.users where email = 'admin@mdrrmo.gov.ph');
-- insert into public.profile_roles(profile_id, role_id)
-- select u.id, r.id from auth.users u cross join public.roles r
-- where u.email = 'admin@mdrrmo.gov.ph' and r.name = 'administrator';
