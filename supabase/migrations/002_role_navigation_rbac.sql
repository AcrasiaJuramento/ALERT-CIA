-- Align backend authorization with the officer-side role experience.
-- Field responders create PCRs; dispatchers and administrators review them.

begin;

create or replace function public.can_access_pcr(target_pcr_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('administrator')
    or exists (
      select 1
      from public.pcr_reports p
      where p.id = target_pcr_id
        and p.deleted_at is null
        and (
          p.created_by = auth.uid()
          or p.station_id = public.current_station_id()
            and (public.has_role('dispatcher') or public.has_role('supervisor'))
          or exists (
            select 1 from public.pcr_crew_members c
            where c.pcr_report_id = p.id and c.profile_id = auth.uid()
          )
        )
    );
$$;

create or replace function public.can_edit_pcr(target_pcr_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('administrator')
    or public.has_role('field_responder')
      and exists (
        select 1
        from public.pcr_reports p
        where p.id = target_pcr_id
          and p.deleted_at is null
          and p.status in ('draft', 'rejected')
          and (
            p.created_by = auth.uid()
            or exists (
              select 1 from public.pcr_crew_members c
              where c.pcr_report_id = p.id and c.profile_id = auth.uid()
            )
          )
      );
$$;

create or replace function public.review_pcr(target_pcr_id uuid, decision public.pcr_status, comments text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role('administrator') or public.has_role('dispatcher')) then
    raise exception 'Not authorized to review PCR reports';
  end if;
  if decision not in ('verified', 'rejected') then raise exception 'Decision must be verified or rejected'; end if;
  if decision = 'rejected' and nullif(trim(comments), '') is null then raise exception 'Rejection comments are required'; end if;

  perform set_config('app.pcr_transition', 'true', true);
  update public.pcr_reports
    set status = decision,
        verified_by = case when decision = 'verified' then auth.uid() else null end,
        verified_at = case when decision = 'verified' then now() else null end,
        rejection_reason = case when decision = 'rejected' then comments else null end
    where id = target_pcr_id
      and (station_id = public.current_station_id() or public.has_role('administrator'));
  if not found then raise exception 'PCR not found or inaccessible'; end if;

  insert into public.pcr_reviews(pcr_report_id, decision, comments) values (target_pcr_id, decision, comments);
  insert into public.audit_logs(table_name, record_id, action, new_value)
  values ('pcr_reports', target_pcr_id::text, case when decision = 'verified' then 'verify'::public.audit_action else 'reject'::public.audit_action end, jsonb_build_object('decision', decision, 'comments', comments));
end;
$$;

drop policy if exists pcr_insert_own on public.pcr_reports;
create policy pcr_insert_own on public.pcr_reports for insert to authenticated
with check (
  created_by = auth.uid()
  and station_id = public.current_station_id()
  and public.has_role('field_responder')
);

drop policy if exists analytics_station_read on public.analytics_daily_metrics;
create policy analytics_station_read on public.analytics_daily_metrics for select to authenticated
using (
  public.has_role('administrator')
  or public.has_role('dispatcher') and station_id = public.current_station_id()
);

drop policy if exists audit_admin_supervisor_read on public.audit_logs;
create policy audit_admin_dispatcher_read on public.audit_logs for select to authenticated
using (public.has_role('administrator') or public.has_role('dispatcher'));

commit;
