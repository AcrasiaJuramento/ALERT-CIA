-- Audit logs for accountability, review, backup, and export.

begin;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action public.audit_action not null,
  table_name text not null,
  record_id uuid,
  response_id uuid references public.responses(id) on delete set null,
  previous_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.data_exports (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id) on delete set null default auth.uid(),
  export_type text not null,
  storage_path text,
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

commit;
