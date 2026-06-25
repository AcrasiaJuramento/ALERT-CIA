-- In-app notifications and delivery metadata.

begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references public.profiles(id) on delete cascade,
  recipient_team_id uuid references public.responding_teams(id) on delete cascade,
  type public.notification_type not null default 'system',
  title text not null,
  message text not null,
  response_id uuid references public.responses(id) on delete cascade,
  dispatch_form_id uuid references public.dispatch_forms(id) on delete cascade,
  pcr_report_id uuid references public.pcr_reports(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (recipient_profile_id is not null or recipient_team_id is not null)
);

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  critical_only boolean not null default false,
  updated_at timestamptz not null default now()
);

commit;
