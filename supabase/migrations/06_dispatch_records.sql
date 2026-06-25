-- Shared responses and dispatcher-owned dispatch forms.
-- The response row is the single source of truth for shared Dispatch/PCR fields.

begin;

create sequence if not exists public.response_number_seq;

create or replace function public.next_response_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'RESP-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.response_number_seq')::text, 4, '0');
$$;

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  response_number text not null unique default public.next_response_number(),
  date_of_incident date,
  time_of_incident time,
  place_of_incident text,
  barangay_id uuid references public.barangays(id) on delete set null,
  type_of_incident text,
  caller_name text,
  caller_contact text,
  caller_address text,
  patient_name text,
  patient_age integer check (patient_age is null or patient_age >= 0),
  patient_birthday date,
  patient_sex text,
  patient_address text,
  initial_assessment text,
  responding_team_id uuid references public.responding_teams(id) on delete set null,
  assigned_unit_id uuid references public.ambulance_units(id) on delete set null,
  driver_name text,
  main_aider_name text,
  assistant_aider_name text,
  status public.dispatch_status not null default 'draft',
  created_by_dispatcher_id uuid references public.profiles(id) on delete set null,
  accepted_by_team_id uuid references public.responding_teams(id) on delete set null,
  accepted_by_profile_id uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.dispatch_forms (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null unique references public.responses(id) on delete cascade,
  dispatch_time time,
  arrival_scene_time time,
  departure_scene_time time,
  arrival_hospital_time time,
  departure_hospital_time time,
  arrival_office_time time,
  hospital_name text,
  number_of_patients integer not null default 1 check (number_of_patients between 1 and 20),
  assistance_needed text[] not null default '{}',
  notes text,
  status public.dispatch_status not null default 'draft',
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.dispatch_patients (
  id uuid primary key default gen_random_uuid(),
  dispatch_form_id uuid not null references public.dispatch_forms(id) on delete cascade,
  patient_order integer not null default 1,
  patient_name text,
  age integer check (age is null or age >= 0),
  birthday date,
  sex text,
  address text,
  assessment_findings text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dispatch_form_id, patient_order)
);

commit;
