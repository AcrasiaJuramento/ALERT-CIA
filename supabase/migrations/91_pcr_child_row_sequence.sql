-- Keep PCR vital-sign and medication row order consistent with the working mobile workflow.

begin;

alter table public.pcr_vital_signs
  add column if not exists sequence_no integer;

with ordered as (
  select id, row_number() over (partition by pcr_report_id order by created_at, id)::integer as sequence_no
  from public.pcr_vital_signs
)
update public.pcr_vital_signs as vital
set sequence_no = ordered.sequence_no
from ordered
where ordered.id = vital.id
  and vital.sequence_no is null;

alter table public.pcr_vital_signs
  alter column sequence_no set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pcr_vital_signs_sequence_positive'
      and conrelid = 'public.pcr_vital_signs'::regclass
  ) then
    alter table public.pcr_vital_signs
      add constraint pcr_vital_signs_sequence_positive check (sequence_no > 0);
  end if;
end;
$$;

create unique index if not exists pcr_vital_signs_report_sequence_idx
  on public.pcr_vital_signs(pcr_report_id, sequence_no);

alter table public.pcr_medications
  add column if not exists sequence_no integer;

with ordered as (
  select id, row_number() over (partition by pcr_report_id order by created_at, id)::integer as sequence_no
  from public.pcr_medications
)
update public.pcr_medications as medication
set sequence_no = ordered.sequence_no
from ordered
where ordered.id = medication.id
  and medication.sequence_no is null;

alter table public.pcr_medications
  alter column sequence_no set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pcr_medications_sequence_positive'
      and conrelid = 'public.pcr_medications'::regclass
  ) then
    alter table public.pcr_medications
      add constraint pcr_medications_sequence_positive check (sequence_no > 0);
  end if;
end;
$$;

create unique index if not exists pcr_medications_report_sequence_idx
  on public.pcr_medications(pcr_report_id, sequence_no);

-- Older web/LAN sync RPCs do not send sequence_no. Assign it without changing
-- their payload contract, matching the mobile compatibility behavior.
create or replace function public.assign_pcr_child_sequence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.sequence_no is null then
    perform pg_advisory_xact_lock(hashtextextended(new.pcr_report_id::text || ':' || tg_table_name, 0));
    if tg_table_name = 'pcr_vital_signs' then
      select coalesce(max(sequence_no), 0) + 1 into new.sequence_no
      from public.pcr_vital_signs where pcr_report_id = new.pcr_report_id;
    elsif tg_table_name = 'pcr_medications' then
      select coalesce(max(sequence_no), 0) + 1 into new.sequence_no
      from public.pcr_medications where pcr_report_id = new.pcr_report_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_pcr_vital_sequence on public.pcr_vital_signs;
create trigger assign_pcr_vital_sequence
before insert on public.pcr_vital_signs
for each row execute function public.assign_pcr_child_sequence();

drop trigger if exists assign_pcr_medication_sequence on public.pcr_medications;
create trigger assign_pcr_medication_sequence
before insert on public.pcr_medications
for each row execute function public.assign_pcr_child_sequence();

commit;
