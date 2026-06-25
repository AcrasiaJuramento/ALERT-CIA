-- Shared enum types used by the normalized ALERT-CIA schema.

begin;

do $$ begin
  create type public.app_role as enum ('administrator', 'dispatcher', 'field_responder', 'public_user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('pending', 'active', 'inactive', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.team_status as enum ('off_duty', 'available', 'assigned', 'responding', 'back_to_base');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dispatch_status as enum (
    'draft',
    'dispatched',
    'sent_to_responding_team',
    'accepted_by_responding_team',
    'pcr_in_progress',
    'pcr_completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pcr_status as enum ('draft', 'in_progress', 'submitted', 'verified', 'rejected', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.incident_priority as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.incident_classification as enum ('medical', 'trauma', 'mvc', 'fire', 'rescue', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum ('dispatch_sent', 'dispatch_accepted', 'pcr_created', 'pcr_submitted', 'response_completed', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audit_action as enum ('create', 'update', 'delete', 'send', 'accept', 'submit', 'verify', 'reject', 'resolve', 'back_to_base', 'login');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cache_scope as enum ('dashboard', 'analytics', 'barangay_map', 'reports', 'public');
exception when duplicate_object then null; end $$;

commit;
