-- Prevent one workflow action from creating repeated notification rows.
-- This keeps the existing table shape and permits a later, distinct update.
begin;

create or replace function public.notification_event_action(
  notification_title text,
  notification_message text,
  notification_type public.notification_type
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(concat_ws(' ', notification_title, notification_message)) ~ 'return|correction' then 'pcr_returned'
    when lower(concat_ws(' ', notification_title, notification_message)) ~ 'reject' then 'pcr_rejected'
    when lower(concat_ws(' ', notification_title, notification_message)) ~ 'verif' then 'pcr_verified'
    when lower(concat_ws(' ', notification_title, notification_message)) ~ 'submit|pending review' then 'pcr_submitted'
    when lower(concat_ws(' ', notification_title, notification_message)) ~ 'dispatch.*accept|accept.*dispatch' then 'dispatch_accepted'
    when lower(concat_ws(' ', notification_title, notification_message)) ~ 'dispatch.*sent|incoming dispatch'
      or notification_type::text = 'dispatch_sent' then 'dispatch_sent'
    when lower(concat_ws(' ', notification_title, notification_message)) ~ 'response.*complet|returned to base'
      or notification_type::text = 'response_completed' then 'response_completed'
    when notification_type::text like 'pcr_%' then notification_type::text
    else notification_type::text
  end;
$$;

create or replace function public.prevent_duplicate_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_action text;
  event_record text;
  event_recipient text;
  event_signature text;
begin
  event_action := public.notification_event_action(new.title, new.message, new.type);
  event_record := coalesce(new.pcr_report_id::text, new.dispatch_form_id::text, new.response_id::text, 'unlinked');
  event_recipient := concat_ws(':', coalesce(new.recipient_profile_id::text, ''), coalesce(new.recipient_team_id::text, ''));
  event_signature := concat_ws('|', event_record, event_action, event_recipient);

  -- Serialize equal events so concurrent requests cannot both pass the check.
  perform pg_advisory_xact_lock(hashtextextended(event_signature, 0));

  if exists (
    select 1
    from public.notifications n
    where coalesce(n.pcr_report_id::text, n.dispatch_form_id::text, n.response_id::text, 'unlinked') = event_record
      and concat_ws(':', coalesce(n.recipient_profile_id::text, ''), coalesce(n.recipient_team_id::text, '')) = event_recipient
      and public.notification_event_action(n.title, n.message, n.type) = event_action
      and n.created_at >= statement_timestamp() - interval '15 seconds'
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_notification_insert on public.notifications;
create trigger prevent_duplicate_notification_insert
before insert on public.notifications
for each row execute function public.prevent_duplicate_notification_insert();

comment on function public.prevent_duplicate_notification_insert() is
  'Suppresses concurrent/retried inserts for the same record, action, and recipient for 15 seconds.';

commit;
