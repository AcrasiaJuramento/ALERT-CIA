-- Secure, append-only audit history for ALERT-CIA web and mobile clients.

begin;

alter table public.audit_logs alter column action drop not null;
alter table public.audit_logs add column if not exists action_name text;
alter table public.audit_logs add column if not exists module text;
alter table public.audit_logs add column if not exists record_reference text;
alter table public.audit_logs add column if not exists actor_name text;
alter table public.audit_logs add column if not exists actor_role text;
alter table public.audit_logs add column if not exists description text;
alter table public.audit_logs add column if not exists platform text not null default 'Database';
alter table public.audit_logs add column if not exists status text not null default 'success';
alter table public.audit_logs add column if not exists request_id text;

update public.audit_logs
set action_name = upper(coalesce(action::text, 'UPDATE')),
    module = upper(coalesce(table_name, 'SYSTEM')),
    record_reference = coalesce(record_id::text, response_id::text),
    description = coalesce(description, initcap(coalesce(action::text, 'update')) || ' on ' || coalesce(table_name, 'system'))
where action_name is null;

alter table public.audit_logs alter column action_name set not null;
alter table public.audit_logs alter column module set not null;
alter table public.audit_logs alter column action_name set default 'LEGACY_EVENT';
alter table public.audit_logs alter column module set default 'SYSTEM';

create index if not exists audit_logs_created_at_desc_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_profile_id, created_at desc);
create index if not exists audit_logs_action_name_idx on public.audit_logs(action_name);
create index if not exists audit_logs_module_idx on public.audit_logs(module);
create index if not exists audit_logs_record_reference_idx on public.audit_logs(record_reference);
create index if not exists audit_logs_platform_idx on public.audit_logs(platform);
create index if not exists audit_logs_status_idx on public.audit_logs(status);

create or replace function public.redact_audit_values(input jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when input is null then null else input - array[
    'password','password_hash','encrypted_password','token','access_token','refresh_token','secret','secret_key','api_key',
    'patient_name','patient_first_name','patient_middle_name','patient_last_name','patient_birthdate','birthdate',
    'patient_address','address','contact_number','contact_person','caller_contact','email','description','notes',
    'medical_history','assessment_findings','chief_complaint','medications','interventions','form_data','data'
  ] end;
$$;

create or replace function public.audit_module_name(table_value text)
returns text language sql immutable as $$
  select case
    when table_value in ('pcr_reports','pcr_vital_signs','pcr_medications','pcr_interventions','pcr_attachments') then 'PCR'
    when table_value in ('responses','dispatch_forms','dispatch_patients') then 'DISPATCH'
    when table_value in ('incidents','incident_media') then 'INCIDENT'
    when table_value in ('hazard_zones','scraped_incidents','gis_landmark_registry') then 'MAP'
    when table_value in ('profiles','profile_roles','team_members') then 'USER'
    when table_value in ('notification_preferences','system_settings','role_permissions') then 'SETTINGS'
    else upper(replace(table_value, '_', ' '))
  end;
$$;

create or replace function public.audit_request_ip()
returns inet language plpgsql stable set search_path = public, pg_temp as $$
declare value text;
begin
  value := split_part(coalesce(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-forwarded-for', ''), ',', 1);
  if btrim(value) = '' then return null; end if;
  return btrim(value)::inet;
exception when others then return null;
end;
$$;

create or replace function public.audit_request_platform()
returns text language sql stable set search_path = public, pg_temp as $$
  select case
    when lower(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-client-info') like '%alert-cia-expo%' then 'Mobile'
    when lower(coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'x-client-info') like '%alert-cia-web%' then 'Web'
    else 'Database'
  end;
$$;

create or replace function public.audit_action_name(table_value text, operation text, old_row jsonb, new_row jsonb)
returns text language plpgsql immutable as $$
declare
  prefix text := case
    when table_value like 'pcr_%' then 'PCR'
    when table_value in ('responses','dispatch_forms','dispatch_patients') then 'DISPATCH'
    when table_value in ('incidents','incident_media') then 'INCIDENT'
    when table_value in ('hazard_zones','scraped_incidents','gis_landmark_registry') then 'MAP_PIN'
    when table_value in ('profiles','profile_roles','team_members') then 'USER'
    else upper(table_value)
  end;
  next_status text := lower(coalesce(new_row->>'status', new_row->>'account_status', ''));
  old_status text := lower(coalesce(old_row->>'status', old_row->>'account_status', ''));
begin
  if operation = 'INSERT' then return prefix || '_CREATED'; end if;
  if operation = 'DELETE' then return prefix || '_DELETED'; end if;
  if table_value = 'pcr_reports' and coalesce(old_row->>'response_id', '') = '' and coalesce(new_row->>'response_id', '') <> '' then return 'PCR_LINKED_TO_DISPATCH'; end if;
  if table_value in ('responses','dispatch_forms') and coalesce(old_row->>'responding_team_id', old_row->>'assigned_team_id', '') is distinct from coalesce(new_row->>'responding_team_id', new_row->>'assigned_team_id', '') then return 'DISPATCH_ASSIGNED'; end if;
  if next_status is distinct from old_status and next_status <> '' then
    if table_value = 'pcr_reports' then
      if next_status in ('submitted','pending_dispatcher_review','pending_admin_verification') then return 'PCR_SUBMITTED'; end if;
      if next_status in ('accepted','accepted_by_dispatcher') then return 'PCR_ACCEPTED'; end if;
      if next_status in ('rejected','returned','returned_to_field_officer','returned_for_correction') then return 'PCR_REJECTED'; end if;
      if next_status = 'verified' then return 'PCR_VERIFIED'; end if;
      if next_status = 'completed' then return 'PCR_COMPLETED'; end if;
    end if;
    if table_value in ('responses','dispatch_forms') then
      if next_status like '%accept%' then return 'DISPATCH_ACCEPTED'; end if;
      if next_status in ('completed','pcr_completed','back_to_base') then return 'DISPATCH_COMPLETED'; end if;
      if next_status in ('cancelled','canceled') then return 'DISPATCH_CANCELLED'; end if;
    end if;
    if table_value = 'incidents' and next_status in ('verified','approved') then return 'INCIDENT_VERIFIED'; end if;
    if table_value in ('hazard_zones','scraped_incidents','gis_landmark_registry') and next_status in ('verified','approved') then return 'MAP_PIN_VERIFIED'; end if;
    return prefix || '_' || upper(regexp_replace(next_status, '[^a-z0-9]+', '_', 'g'));
  end if;
  if table_value = 'profile_roles' then return 'USER_ROLE_CHANGED'; end if;
  if table_value = 'team_members' then return 'DISPATCH_ASSIGNMENT_CHANGED'; end if;
  return prefix || '_UPDATED';
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  new_row jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  current_row jsonb := coalesce(new_row, old_row);
  related_response_id uuid;
  related_record_id uuid;
  actor_display text;
  actor_role_value text;
  event_action text;
  reference_value text;
begin
  related_record_id := nullif(current_row->>'id', '')::uuid;
  related_response_id := case when nullif(current_row->>'response_id', '') is not null then (current_row->>'response_id')::uuid else null end;
  event_action := public.audit_action_name(tg_table_name, tg_op, old_row, new_row);
  reference_value := coalesce(current_row->>'response_number', current_row->>'reference_number', current_row->>'id', related_response_id::text);

  select p.display_name, pr.role::text into actor_display, actor_role_value
  from public.profiles p
  left join public.profile_roles pr on pr.profile_id = p.id
  where p.id = auth.uid()
  limit 1;

  insert into public.audit_logs(
    actor_profile_id, actor_name, actor_role, action_name, module, table_name, record_id, response_id,
    record_reference, previous_values, new_values, description, platform, status, ip_address, user_agent
  ) values (
    auth.uid(), coalesce(actor_display, 'System'), coalesce(actor_role_value, 'system'), event_action,
    public.audit_module_name(tg_table_name), tg_table_name, related_record_id, related_response_id,
    reference_value, public.redact_audit_values(old_row), public.redact_audit_values(new_row),
    replace(initcap(replace(lower(event_action), '_', ' ')), 'Pcr', 'PCR') || coalesce(' [' || reference_value || ']', ''),
    public.audit_request_platform(), 'success', public.audit_request_ip(), coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'user-agent'
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.log_audit_event(
  p_action_name text,
  p_module text,
  p_record_reference text default null,
  p_description text default null,
  p_platform text default 'Web',
  p_status text default 'success',
  p_metadata jsonb default '{}'::jsonb,
  p_request_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_id uuid;
  actor_display text;
  actor_role_value text;
  normalized_action text := upper(regexp_replace(coalesce(p_action_name, ''), '[^A-Za-z0-9]+', '_', 'g'));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if normalized_action not in ('USER_LOGIN','USER_LOGOUT','SETTINGS_UPDATED','PERMISSIONS_UPDATED') then
    raise exception 'Unsupported client audit action';
  end if;
  select p.display_name, pr.role::text into actor_display, actor_role_value
  from public.profiles p left join public.profile_roles pr on pr.profile_id = p.id
  where p.id = auth.uid() limit 1;
  insert into public.audit_logs(actor_profile_id, actor_name, actor_role, action_name, module, table_name,
    record_reference, new_values, description, platform, status, request_id, ip_address, user_agent)
  values (auth.uid(), actor_display, actor_role_value, normalized_action, upper(coalesce(p_module, 'SYSTEM')), 'client_event',
    p_record_reference, public.redact_audit_values(p_metadata), left(coalesce(p_description, normalized_action), 500),
    case when p_platform in ('Web','Mobile') then p_platform else 'Web' end,
    case when p_status in ('success','failed') then p_status else 'success' end, p_request_id,
    public.audit_request_ip(), coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb->>'user-agent')
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.get_audit_log_summary()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.audit_logs),
    'today', (select count(*) from public.audit_logs where created_at >= date_trunc('day', now())),
    'failed', (select count(*) from public.audit_logs where status = 'failed'),
    'activeUsers', (select count(distinct actor_profile_id) from public.audit_logs where created_at >= now() - interval '24 hours' and actor_profile_id is not null)
  );
end;
$$;

create or replace function public.prevent_audit_log_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'Audit history is append-only'; end;
$$;

create or replace function public.normalize_audit_log_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  legacy_action text := lower(coalesce(new.action::text, ''));
  actor_display text;
  actor_role_value text;
begin
  if new.actor_profile_id is null then new.actor_profile_id := auth.uid(); end if;
  if new.action_name is null or new.action_name = 'LEGACY_EVENT' then
    new.action_name := case
      when legacy_action = 'accept' and new.table_name in ('responses','dispatch_forms') then 'DISPATCH_ACCEPTED'
      when legacy_action = 'submit' and new.table_name = 'pcr_reports' then 'PCR_SUBMITTED'
      when legacy_action = 'verify' and new.table_name = 'pcr_reports' then 'PCR_VERIFIED'
      when legacy_action = 'reject' and new.table_name = 'pcr_reports' then 'PCR_REJECTED'
      when legacy_action in ('resolve','back_to_base') and new.table_name in ('responses','dispatch_forms') then 'DISPATCH_COMPLETED'
      else upper(coalesce(nullif(legacy_action, ''), 'SYSTEM_EVENT'))
    end;
  end if;
  if new.module is null or new.module = 'SYSTEM' then new.module := public.audit_module_name(new.table_name); end if;
  if new.record_reference is null then new.record_reference := coalesce(new.record_id::text, new.response_id::text); end if;
  if new.actor_name is null or new.actor_role is null then
    select p.display_name, pr.role::text into actor_display, actor_role_value
    from public.profiles p left join public.profile_roles pr on pr.profile_id = p.id
    where p.id = new.actor_profile_id limit 1;
    new.actor_name := coalesce(new.actor_name, actor_display, 'System');
    new.actor_role := coalesce(new.actor_role, actor_role_value, 'system');
  end if;
  new.previous_values := public.redact_audit_values(new.previous_values);
  new.new_values := public.redact_audit_values(new.new_values);
  new.description := coalesce(new.description, replace(initcap(replace(lower(new.action_name), '_', ' ')), 'Pcr', 'PCR') || coalesce(' [' || new.record_reference || ']', ''));
  if exists (
    select 1 from public.audit_logs existing
    where existing.action_name = new.action_name
      and existing.actor_profile_id is not distinct from new.actor_profile_id
      and coalesce(existing.record_id, existing.response_id) is not distinct from coalesce(new.record_id, new.response_id)
      and existing.created_at >= now() - interval '2 seconds'
  ) then return null; end if;
  return new;
end;
$$;

drop trigger if exists normalize_audit_log_insert on public.audit_logs;
create trigger normalize_audit_log_insert before insert on public.audit_logs
for each row execute function public.normalize_audit_log_insert();

drop trigger if exists prevent_audit_log_update_delete on public.audit_logs;
create trigger prevent_audit_log_update_delete before update or delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

do $$
declare item text;
begin
  foreach item in array array['responses','dispatch_forms','dispatch_patients','pcr_reports','pcr_attachments','incidents','incident_media','hazard_zones','scraped_incidents','profiles','profile_roles','team_members','notification_preferences'] loop
    if to_regclass('public.' || item) is not null then
      execute format('drop trigger if exists audit_%I on public.%I', item, item);
      execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', item, item);
    end if;
  end loop;
end $$;

alter table public.audit_logs enable row level security;
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.prevent_audit_log_mutation() from public, anon, authenticated;
revoke execute on function public.normalize_audit_log_insert() from public, anon, authenticated;
grant execute on function public.log_audit_event(text,text,text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.get_audit_log_summary() to authenticated;

commit;
