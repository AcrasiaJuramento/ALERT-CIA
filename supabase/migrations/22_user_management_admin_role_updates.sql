-- Allow administrators to replace a user's single operational role.

begin;

grant delete on public.profile_roles to authenticated;

commit;
