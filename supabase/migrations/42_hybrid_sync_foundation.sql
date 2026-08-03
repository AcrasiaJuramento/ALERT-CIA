-- Hybrid offline synchronization foundation.
--
-- This migration intentionally does not apply queued payloads to operational
-- tables. It creates the production-grade ledger, device registry, and conflict
-- records needed by browser IndexedDB, Expo SQLite, a local ALERT-CIA server,
-- and Supabase Cloud to share one idempotent sync protocol.

begin;

do $$ begin
  create type public.sync_destination as enum ('cloud', 'local_server');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sync_operation_type as enum (
    'create',
    'update',
    'delete',
    'submit',
    'send',
    'acknowledge',
    'upload_attachment',
    'resolve_conflict'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sync_entity_type as enum (
    'incident',
    'dispatch',
    'assignment',
    'acknowledgement',
    'pcr',
    'patient',
    'assessment',
    'vital_signs',
    'treatment',
    'transport',
    'handover',
    'attachment',
    'signature',
    'completion_status',
    'reference_data'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sync_status as enum (
    'pending',
    'validated',
    'processing',
    'partially_synced',
    'synced',
    'failed',
    'rejected',
    'conflict',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.device_kind as enum ('react_pwa', 'expo_android', 'local_server', 'admin_console');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.device_status as enum ('pending', 'active', 'suspended', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conflict_status as enum ('open', 'assigned', 'resolved', 'rejected', 'superseded');
exception when duplicate_object then null; end $$;

create table if not exists public.device_registrations (
  id uuid primary key default gen_random_uuid(),
  device_uuid uuid not null unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  device_kind public.device_kind not null,
  device_label text not null,
  platform text,
  app_version text,
  push_token_hash text,
  credential_public_key text,
  credential_key_id text,
  credential_issued_at timestamptz,
  credential_expires_at timestamptz,
  offline_access_expires_at timestamptz,
  token_version integer not null default 1 check (token_version > 0),
  status public.device_status not null default 'pending',
  last_seen_at timestamptz,
  last_seen_ip inet,
  last_user_agent text,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint device_label_not_blank check (length(trim(device_label)) > 0),
  constraint device_status_revocation_consistency check (
    (status in ('revoked', 'suspended') and revoked_at is not null)
    or (status not in ('revoked', 'suspended'))
  ),
  constraint device_credential_expiry_order check (
    credential_expires_at is null
    or credential_issued_at is null
    or credential_expires_at > credential_issued_at
  ),
  constraint device_credential_key_not_blank check (
    credential_key_id is null or length(trim(credential_key_id)) > 0
  )
);

create table if not exists public.sync_operations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  idempotency_key text not null unique,
  request_nonce uuid not null unique,
  device_id uuid not null references public.device_registrations(id) on delete restrict,
  device_uuid uuid not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  station_id uuid references public.stations(id) on delete set null,
  destination public.sync_destination not null,
  entity_type public.sync_entity_type not null,
  operation_type public.sync_operation_type not null,
  sync_status public.sync_status not null default 'pending',
  entity_id uuid,
  local_entity_id uuid,
  server_entity_id uuid,
  incident_id uuid references public.incidents(id) on delete set null,
  response_id uuid references public.responses(id) on delete set null,
  dispatch_form_id uuid references public.dispatch_forms(id) on delete set null,
  pcr_report_id uuid references public.pcr_reports(id) on delete set null,
  attachment_id uuid,
  dependency_operation_id uuid references public.sync_operations(operation_id) on delete set null,
  payload_schema_version integer not null default 1 check (payload_schema_version > 0),
  payload jsonb not null,
  payload_hash text not null,
  base_version integer,
  client_version integer not null default 1 check (client_version > 0),
  server_version integer,
  priority integer not null default 100 check (priority between 0 and 1000),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 50),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  error_code text,
  last_sync_error text,
  conflict_id uuid,
  synced_to_local boolean not null default false,
  synced_to_cloud boolean not null default false,
  local_synced_at timestamptz,
  cloud_synced_at timestamptz,
  created_at_device timestamptz not null,
  updated_at_device timestamptz not null,
  received_at_cloud timestamptz not null default now(),
  processed_at timestamptz,
  rejected_at timestamptz,
  rejected_reason text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint sync_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint sync_idempotency_key_not_blank check (length(trim(idempotency_key)) >= 16),
  constraint sync_payload_hash_sha256 check (payload_hash ~ '^[a-fA-F0-9]{64}$'),
  constraint sync_device_uuid_matches_registry check (device_uuid is not null),
  constraint sync_entity_id_present check (coalesce(entity_id, local_entity_id, server_entity_id, incident_id, response_id, dispatch_form_id, pcr_report_id, attachment_id) is not null),
  constraint sync_device_timestamp_order check (updated_at_device >= created_at_device),
  constraint sync_retry_window_required check (
    sync_status not in ('pending', 'failed', 'partially_synced')
    or next_attempt_at is not null
  ),
  constraint sync_terminal_processed_at check (
    sync_status not in ('synced', 'rejected', 'cancelled')
    or processed_at is not null
    or rejected_at is not null
  )
);

create table if not exists public.conflict_records (
  id uuid primary key default gen_random_uuid(),
  sync_operation_id uuid references public.sync_operations(id) on delete set null,
  operation_id uuid references public.sync_operations(operation_id) on delete set null,
  entity_type public.sync_entity_type not null,
  entity_id uuid not null,
  local_entity_id uuid,
  server_entity_id uuid,
  incident_id uuid references public.incidents(id) on delete set null,
  response_id uuid references public.responses(id) on delete set null,
  dispatch_form_id uuid references public.dispatch_forms(id) on delete set null,
  pcr_report_id uuid references public.pcr_reports(id) on delete set null,
  reported_by_profile_id uuid references public.profiles(id) on delete set null default auth.uid(),
  reported_by_device_id uuid references public.device_registrations(id) on delete set null,
  station_id uuid references public.stations(id) on delete set null,
  conflict_reason text not null,
  conflict_status public.conflict_status not null default 'open',
  severity integer not null default 50 check (severity between 0 and 100),
  base_version integer,
  local_version integer,
  server_version integer,
  local_updated_at_device timestamptz,
  server_updated_at timestamptz,
  local_values jsonb not null,
  server_values jsonb not null,
  resolution_values jsonb,
  assigned_to uuid references public.profiles(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at timestamptz,
  constraint conflict_reason_not_blank check (length(trim(conflict_reason)) > 0),
  constraint conflict_json_objects check (
    jsonb_typeof(local_values) = 'object'
    and jsonb_typeof(server_values) = 'object'
    and (resolution_values is null or jsonb_typeof(resolution_values) = 'object')
  ),
  constraint conflict_resolution_consistency check (
    (conflict_status = 'resolved' and resolved_by is not null and resolved_at is not null and resolution_values is not null)
    or conflict_status <> 'resolved'
  )
);

alter table public.sync_operations
  drop constraint if exists sync_operations_conflict_id_fkey,
  add constraint sync_operations_conflict_id_fkey
    foreign key (conflict_id) references public.conflict_records(id) on delete set null;

create index if not exists device_registrations_profile_status_idx
  on public.device_registrations(profile_id, status, updated_at desc)
  where deleted_at is null;

create index if not exists device_registrations_station_status_idx
  on public.device_registrations(station_id, status, last_seen_at desc)
  where deleted_at is null;

create index if not exists sync_operations_profile_status_idx
  on public.sync_operations(profile_id, sync_status, next_attempt_at, priority, created_at_device)
  where deleted_at is null;

create index if not exists sync_operations_device_status_idx
  on public.sync_operations(device_id, sync_status, next_attempt_at)
  where deleted_at is null;

create index if not exists sync_operations_dependency_idx
  on public.sync_operations(dependency_operation_id)
  where dependency_operation_id is not null and deleted_at is null;

create index if not exists sync_operations_entity_idx
  on public.sync_operations(entity_type, entity_id, created_at_device)
  where deleted_at is null;

create index if not exists sync_operations_response_idx
  on public.sync_operations(response_id, sync_status, created_at_device)
  where response_id is not null and deleted_at is null;

create index if not exists sync_operations_dispatch_idx
  on public.sync_operations(dispatch_form_id, sync_status, created_at_device)
  where dispatch_form_id is not null and deleted_at is null;

create index if not exists sync_operations_pcr_idx
  on public.sync_operations(pcr_report_id, sync_status, created_at_device)
  where pcr_report_id is not null and deleted_at is null;

create index if not exists sync_operations_payload_gin_idx
  on public.sync_operations using gin(payload jsonb_path_ops)
  where deleted_at is null;

create index if not exists conflict_records_entity_open_idx
  on public.conflict_records(entity_type, entity_id, severity desc, created_at)
  where conflict_status in ('open', 'assigned') and deleted_at is null;

create index if not exists conflict_records_response_idx
  on public.conflict_records(response_id, conflict_status, created_at desc)
  where response_id is not null and deleted_at is null;

create index if not exists conflict_records_pcr_idx
  on public.conflict_records(pcr_report_id, conflict_status, created_at desc)
  where pcr_report_id is not null and deleted_at is null;

create unique index if not exists conflict_records_one_open_entity_idx
  on public.conflict_records(entity_type, entity_id)
  where conflict_status in ('open', 'assigned') and deleted_at is null;

create or replace function public.is_active_registered_device(target_device_id uuid, target_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.device_registrations d
    join public.profiles p on p.id = d.profile_id
    where d.id = target_device_id
      and d.profile_id = target_profile_id
      and d.status = 'active'
      and d.deleted_at is null
      and p.account_status = 'active'
      and p.deleted_at is null
      and (d.credential_expires_at is null or d.credential_expires_at > now())
      and (d.offline_access_expires_at is null or d.offline_access_expires_at > now())
  );
$$;

create or replace function public.sync_operation_authorized(
  target_profile_id uuid,
  target_device_id uuid,
  target_response_id uuid,
  target_dispatch_form_id uuid,
  target_pcr_report_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_admin()
    or (
      target_profile_id = auth.uid()
      and public.is_active_registered_device(target_device_id, auth.uid())
    )
    or (
      public.is_dispatcher()
      and exists (
        select 1
        from public.profiles actor
        join public.profiles owner on owner.station_id is not distinct from actor.station_id
        where actor.id = auth.uid()
          and owner.id = target_profile_id
          and actor.station_id is not null
          and actor.deleted_at is null
          and owner.deleted_at is null
      )
    )
    or (
      target_response_id is not null
      and exists (
        select 1
        from public.responses r
        where r.id = target_response_id
          and r.responding_team_id in (select public.user_team_ids())
      )
    )
    or (
      target_dispatch_form_id is not null
      and exists (
        select 1
        from public.dispatch_forms d
        join public.responses r on r.id = d.response_id
        where d.id = target_dispatch_form_id
          and r.responding_team_id in (select public.user_team_ids())
      )
    )
    or (
      target_pcr_report_id is not null
      and exists (
        select 1
        from public.pcr_reports p
        where p.id = target_pcr_report_id
          and (
            p.responding_team_id in (select public.user_team_ids())
            or exists (
              select 1
              from public.responses r
              where r.id = p.response_id
                and r.responding_team_id in (select public.user_team_ids())
            )
          )
      )
    );
$$;

create or replace function public.enforce_device_registration_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.profile_id := auth.uid();
    if tg_op = 'INSERT' then
      new.status := 'pending';
    else
      new.status := old.status;
      new.revoked_by := old.revoked_by;
      new.revoked_at := old.revoked_at;
      new.revoke_reason := old.revoke_reason;
      new.credential_public_key := old.credential_public_key;
      new.credential_key_id := old.credential_key_id;
      new.credential_issued_at := old.credential_issued_at;
      new.credential_expires_at := old.credential_expires_at;
      new.offline_access_expires_at := old.offline_access_expires_at;
      new.token_version := old.token_version;
    end if;
  end if;

  select p.station_id into new.station_id
  from public.profiles p
  where p.id = new.profile_id;

  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.enforce_sync_operation_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  registered_device public.device_registrations%rowtype;
begin
  select * into registered_device
  from public.device_registrations
  where id = new.device_id
    and device_uuid = new.device_uuid
    and deleted_at is null;

  if not found then
    raise exception 'Registered device does not match sync operation';
  end if;

  if auth.uid() is not null and not public.is_admin() and registered_device.profile_id <> auth.uid() then
    raise exception 'Device is not registered to the authenticated profile';
  end if;

  if registered_device.status <> 'active' then
    raise exception 'Device is not active';
  end if;

  if registered_device.credential_expires_at is not null and registered_device.credential_expires_at <= now() then
    raise exception 'Device credential is expired';
  end if;

  if registered_device.offline_access_expires_at is not null and registered_device.offline_access_expires_at <= now() then
    raise exception 'Device offline access is expired';
  end if;

  new.profile_id := registered_device.profile_id;
  new.station_id := registered_device.station_id;
  new.next_attempt_at := coalesce(new.next_attempt_at, now());
  new.payload_hash := lower(new.payload_hash);
  new.updated_by := auth.uid();

  return new;
end;
$$;

create or replace function public.audit_hybrid_sync_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs(action, table_name, record_id, previous_values, new_values)
  values (
    case when tg_op = 'INSERT' then 'create'::public.audit_action else 'update'::public.audit_action end,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end;
$$;

drop trigger if exists enforce_device_registration_integrity on public.device_registrations;
create trigger enforce_device_registration_integrity
before insert or update on public.device_registrations
for each row execute function public.enforce_device_registration_integrity();

drop trigger if exists set_device_registrations_updated_at on public.device_registrations;
create trigger set_device_registrations_updated_at
before update on public.device_registrations
for each row execute function public.set_updated_at();

drop trigger if exists enforce_sync_operation_integrity on public.sync_operations;
create trigger enforce_sync_operation_integrity
before insert or update on public.sync_operations
for each row execute function public.enforce_sync_operation_integrity();

drop trigger if exists set_sync_operations_updated_at on public.sync_operations;
create trigger set_sync_operations_updated_at
before update on public.sync_operations
for each row execute function public.set_updated_at();

drop trigger if exists set_conflict_records_updated_at on public.conflict_records;
create trigger set_conflict_records_updated_at
before update on public.conflict_records
for each row execute function public.set_updated_at();

drop trigger if exists audit_device_registrations on public.device_registrations;
create trigger audit_device_registrations
after insert or update on public.device_registrations
for each row execute function public.audit_hybrid_sync_change();

drop trigger if exists audit_sync_operations on public.sync_operations;
create trigger audit_sync_operations
after insert or update on public.sync_operations
for each row execute function public.audit_hybrid_sync_change();

drop trigger if exists audit_conflict_records on public.conflict_records;
create trigger audit_conflict_records
after insert or update on public.conflict_records
for each row execute function public.audit_hybrid_sync_change();

alter table public.device_registrations enable row level security;
alter table public.sync_operations enable row level security;
alter table public.conflict_records enable row level security;

drop policy if exists device_registrations_admin_all on public.device_registrations;
drop policy if exists device_registrations_owner_read on public.device_registrations;
drop policy if exists device_registrations_owner_insert on public.device_registrations;
drop policy if exists device_registrations_owner_update_limited on public.device_registrations;

create policy device_registrations_admin_all
on public.device_registrations for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy device_registrations_owner_read
on public.device_registrations for select to authenticated
using (profile_id = auth.uid() and deleted_at is null);

create policy device_registrations_owner_insert
on public.device_registrations for insert to authenticated
with check (
  profile_id = auth.uid()
  and status = 'pending'
  and deleted_at is null
);

drop policy if exists sync_operations_admin_all on public.sync_operations;
drop policy if exists sync_operations_owner_insert on public.sync_operations;
drop policy if exists sync_operations_owner_read on public.sync_operations;
drop policy if exists sync_operations_authorized_entity_read on public.sync_operations;

create policy sync_operations_admin_all
on public.sync_operations for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy sync_operations_owner_insert
on public.sync_operations for insert to authenticated
with check (
  profile_id = auth.uid()
  and public.is_active_registered_device(device_id, auth.uid())
  and sync_status = 'pending'
  and deleted_at is null
);

create policy sync_operations_owner_read
on public.sync_operations for select to authenticated
using (profile_id = auth.uid() and deleted_at is null);

create policy sync_operations_authorized_entity_read
on public.sync_operations for select to authenticated
using (
  deleted_at is null
  and public.sync_operation_authorized(profile_id, device_id, response_id, dispatch_form_id, pcr_report_id)
);

drop policy if exists conflict_records_admin_all on public.conflict_records;
drop policy if exists conflict_records_authorized_read on public.conflict_records;
drop policy if exists conflict_records_authorized_insert on public.conflict_records;
drop policy if exists conflict_records_admin_update on public.conflict_records;

create policy conflict_records_admin_all
on public.conflict_records for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy conflict_records_authorized_read
on public.conflict_records for select to authenticated
using (
  deleted_at is null
  and (
    reported_by_profile_id = auth.uid()
    or assigned_to = auth.uid()
    or public.sync_operation_authorized(reported_by_profile_id, reported_by_device_id, response_id, dispatch_form_id, pcr_report_id)
  )
);

create policy conflict_records_authorized_insert
on public.conflict_records for insert to authenticated
with check (
  reported_by_profile_id = auth.uid()
  and (
    reported_by_device_id is null
    or public.is_active_registered_device(reported_by_device_id, auth.uid())
  )
  and deleted_at is null
);

create policy conflict_records_admin_update
on public.conflict_records for update to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert on public.device_registrations to authenticated;
grant select, insert on public.sync_operations to authenticated;
grant select, insert on public.conflict_records to authenticated;
grant update on public.device_registrations, public.sync_operations, public.conflict_records to authenticated;

grant usage on type
  public.sync_destination,
  public.sync_operation_type,
  public.sync_entity_type,
  public.sync_status,
  public.device_kind,
  public.device_status,
  public.conflict_status
to authenticated;

revoke execute on function public.enforce_device_registration_integrity() from public, anon, authenticated;
revoke execute on function public.enforce_sync_operation_integrity() from public, anon, authenticated;
revoke execute on function public.audit_hybrid_sync_change() from public, anon, authenticated;
revoke execute on function public.is_active_registered_device(uuid, uuid) from public, anon;
revoke execute on function public.sync_operation_authorized(uuid, uuid, uuid, uuid, uuid) from public, anon;

grant execute on function
  public.is_active_registered_device(uuid, uuid),
  public.sync_operation_authorized(uuid, uuid, uuid, uuid, uuid)
to authenticated;

commit;
