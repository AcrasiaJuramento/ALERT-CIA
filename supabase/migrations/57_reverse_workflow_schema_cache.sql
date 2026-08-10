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
