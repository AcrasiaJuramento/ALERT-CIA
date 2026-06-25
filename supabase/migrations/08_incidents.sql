-- Incident records used by operations, map monitoring, public view, and analytics.

begin;

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  response_id uuid references public.responses(id) on delete set null,
  barangay_id uuid references public.barangays(id) on delete set null,
  classification public.incident_classification not null default 'other',
  subtype text,
  priority public.incident_priority not null default 'medium',
  title text,
  description text,
  incident_date date not null default current_date,
  incident_time time,
  location_text text,
  location extensions.geography(point, 4326),
  public_visible boolean not null default false,
  status public.dispatch_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.incident_media (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  storage_path text not null,
  file_name text,
  media_type text not null default 'photo',
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

commit;
