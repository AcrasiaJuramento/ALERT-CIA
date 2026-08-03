-- Stabilize hybrid sync retries, PCR idempotency, and field-officer dispatch patient authorization.

begin;

alter type public.sync_status add value if not exists 'waiting_dependency';
alter type public.sync_status add value if not exists 'retry_scheduled';
alter type public.sync_status add value if not exists 'permanent_failure';
alter type public.sync_status add value if not exists 'authorization_required';
alter type public.sync_status add value if not exists 'completed';

create index if not exists sync_operations_idempotency_status_idx
  on public.sync_operations(idempotency_key, sync_status, updated_at desc)
  where deleted_at is null;

create index if not exists pcr_reports_response_active_idx
  on public.pcr_reports(response_id, updated_at desc)
  where deleted_at is null;

alter table public.responses
  add column if not exists client_generated_id uuid;

alter table public.dispatch_forms
  add column if not exists client_generated_id uuid;

alter table public.dispatch_patients
  add column if not exists client_generated_id uuid;

alter table public.pcr_reports
  add column if not exists client_generated_id uuid,
  add column if not exists dispatch_patient_id uuid references public.dispatch_patients(id) on delete set null;

create unique index if not exists responses_client_generated_id_key
  on public.responses(client_generated_id)
  where client_generated_id is not null and deleted_at is null;

create unique index if not exists dispatch_forms_client_generated_id_key
  on public.dispatch_forms(client_generated_id)
  where client_generated_id is not null and deleted_at is null;

create unique index if not exists dispatch_patients_client_generated_id_key
  on public.dispatch_patients(client_generated_id)
  where client_generated_id is not null;

create unique index if not exists pcr_reports_client_generated_id_key
  on public.pcr_reports(client_generated_id)
  where client_generated_id is not null and deleted_at is null;

create table if not exists public.sync_id_mappings (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  client_id uuid not null,
  local_id uuid,
  cloud_id uuid not null,
  device_id uuid references public.device_registrations(id) on delete set null,
  response_id uuid references public.responses(id) on delete set null,
  dispatch_form_id uuid references public.dispatch_forms(id) on delete set null,
  pcr_report_id uuid references public.pcr_reports(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_id_mappings_entity_not_blank check (length(trim(entity_type)) > 0),
  constraint sync_id_mappings_unique_client unique (entity_type, client_id)
);

create index if not exists sync_id_mappings_cloud_idx
  on public.sync_id_mappings(entity_type, cloud_id);

drop trigger if exists set_sync_id_mappings_updated_at on public.sync_id_mappings;
create trigger set_sync_id_mappings_updated_at
before update on public.sync_id_mappings
for each row execute function public.set_updated_at();

alter table public.sync_id_mappings enable row level security;

drop policy if exists sync_id_mappings_admin_all on public.sync_id_mappings;
drop policy if exists sync_id_mappings_owner_access on public.sync_id_mappings;

create policy sync_id_mappings_admin_all
on public.sync_id_mappings for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy sync_id_mappings_owner_access
on public.sync_id_mappings for all to authenticated
using (
  created_by = auth.uid()
  or public.is_dispatcher()
  or (
    response_id is not null
    and exists (
      select 1 from public.responses r
      where r.id = response_id
        and r.responding_team_id in (select public.user_team_ids())
    )
  )
)
with check (
  created_by = auth.uid()
  or public.is_dispatcher()
  or (
    response_id is not null
    and exists (
      select 1 from public.responses r
      where r.id = response_id
        and r.responding_team_id in (select public.user_team_ids())
    )
  )
);

grant select, insert, update on public.sync_id_mappings to authenticated;

drop policy if exists dispatch_patients_field_write_assigned on public.dispatch_patients;
create policy dispatch_patients_field_write_assigned
on public.dispatch_patients for all to authenticated
using (
  exists (
    select 1
    from public.dispatch_forms d
    join public.responses r on r.id = d.response_id
    join public.profiles p on p.id = auth.uid()
    where d.id = dispatch_form_id
      and p.account_status = 'active'
      and p.deleted_at is null
      and r.deleted_at is null
      and d.deleted_at is null
      and r.responding_team_id in (select public.user_team_ids())
  )
)
with check (
  exists (
    select 1
    from public.dispatch_forms d
    join public.responses r on r.id = d.response_id
    join public.profiles p on p.id = auth.uid()
    where d.id = dispatch_form_id
      and p.account_status = 'active'
      and p.deleted_at is null
      and r.deleted_at is null
      and d.deleted_at is null
      and r.responding_team_id in (select public.user_team_ids())
  )
);

create or replace function public.upsert_assigned_dispatch_patient(
  target_dispatch_form_id uuid,
  patient_payload jsonb
)
returns public.dispatch_patients
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_patient public.dispatch_patients%rowtype;
  target_patient_id uuid;
  target_order integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to synchronize dispatch patient data';
  end if;

  if not exists (
    select 1
    from public.dispatch_forms d
    join public.responses r on r.id = d.response_id
    join public.profiles p on p.id = auth.uid()
    where d.id = target_dispatch_form_id
      and d.deleted_at is null
      and r.deleted_at is null
      and p.account_status = 'active'
      and p.deleted_at is null
      and (public.is_admin() or public.is_dispatcher() or r.responding_team_id in (select public.user_team_ids()))
  ) then
    raise exception 'Not authorized to synchronize dispatch patient for this response';
  end if;

  target_patient_id := nullif(patient_payload->>'id', '')::uuid;
  target_order := coalesce(nullif(patient_payload->>'patientOrder', '')::integer, nullif(patient_payload->>'patient_order', '')::integer, 1);

  insert into public.dispatch_patients (
    id,
    dispatch_form_id,
    patient_order,
    patient_name,
    age,
    birthday,
    sex,
    address,
    assessment_findings,
    metadata
  )
  values (
    coalesce(target_patient_id, gen_random_uuid()),
    target_dispatch_form_id,
    target_order,
    nullif(patient_payload->>'name', ''),
    nullif(patient_payload->>'age', '')::integer,
    nullif(patient_payload->>'birthdate', '')::date,
    nullif(patient_payload->>'gender', ''),
    nullif(patient_payload->>'address', ''),
    nullif(patient_payload->>'assessmentFindings', ''),
    coalesce(patient_payload->'metadata', '{}'::jsonb)
  )
  on conflict (dispatch_form_id, patient_order) do update
    set patient_name = excluded.patient_name,
        age = excluded.age,
        birthday = excluded.birthday,
        sex = excluded.sex,
        address = excluded.address,
        assessment_findings = excluded.assessment_findings,
        metadata = excluded.metadata,
        updated_at = now()
  returning * into saved_patient;

  return saved_patient;
end;
$$;

revoke execute on function public.upsert_assigned_dispatch_patient(uuid, jsonb) from public, anon;
grant execute on function public.upsert_assigned_dispatch_patient(uuid, jsonb) to authenticated;

commit;
