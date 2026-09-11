-- One record ID may have only one active request/submission transition at a time.
begin;

create or replace function public.prevent_repeated_active_pcr_submission()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status::text in (
    'submitted',
    'pending_dispatcher_review',
    'accepted_by_dispatcher',
    'linked_to_dispatch',
    'pending_admin_verification'
  ) and new.status = old.status then
    raise exception using
      errcode = 'P0001',
      message = 'This record already has a pending request/submission.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_repeated_active_pcr_submission on public.pcr_reports;
create trigger prevent_repeated_active_pcr_submission
before update on public.pcr_reports
for each row execute function public.prevent_repeated_active_pcr_submission();

create or replace function public.prevent_repeated_active_dispatch_request()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status::text in (
    'sent_to_responding_team',
    'accepted_by_responding_team',
    'pcr_in_progress',
    'pcr_completed',
    'pending_admin_verification'
  ) and new.status = old.status
    and new.sent_at is distinct from old.sent_at then
    raise exception using
      errcode = 'P0001',
      message = 'This record already has a pending request/submission.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_repeated_active_dispatch_request on public.dispatch_forms;
create trigger prevent_repeated_active_dispatch_request
before update on public.dispatch_forms
for each row execute function public.prevent_repeated_active_dispatch_request();

commit;
