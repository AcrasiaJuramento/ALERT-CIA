-- Fail deployment clearly if migration 56 was skipped, then refresh PostgREST.

do $$
declare
  required_function text;
begin
  foreach required_function in array array[
    'create_standalone_pcr(jsonb)',
    'submit_standalone_pcr(uuid)',
    'review_standalone_pcr(uuid,text,text)',
    'link_standalone_pcr_dispatch(uuid,jsonb)',
    'review_reverse_workflow_admin(uuid,text,text)',
    'resubmit_reverse_workflow_admin(uuid)'
  ] loop
    if to_regprocedure('public.' || required_function) is null then
      raise exception 'Required reverse-workflow function public.% is missing. Apply migration 56 first.', required_function;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

drop policy if exists field_create_manual_pcr_response on public.responses;
create policy field_create_manual_pcr_response on public.responses for insert to authenticated
with check (
  accepted_by_profile_id = auth.uid()
  and status = 'pcr_in_progress'
  and exists (select 1 from public.profile_roles pr where pr.profile_id = auth.uid() and pr.role = 'field_responder')
);

drop policy if exists field_read_manual_pcr_response on public.responses;
create policy field_read_manual_pcr_response on public.responses for select to authenticated
using (accepted_by_profile_id = auth.uid());

drop policy if exists field_update_manual_pcr_response on public.responses;
create policy field_update_manual_pcr_response on public.responses for update to authenticated
using (accepted_by_profile_id = auth.uid())
with check (accepted_by_profile_id = auth.uid());

notify pgrst, 'reload schema';
