create or replace function public.promote_scraper_record_to_incident(target_record_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.scraper_records%rowtype;
  incident_id uuid;
  mapped_classification public.incident_classification;
  mapped_priority public.incident_priority;
  scraper_event_at timestamptz;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_dispatcher()) then
    raise exception 'Not authorized to promote scraper records';
  end if;

  select * into target
  from public.scraper_records
  where id = target_record_id and deleted_at is null;

  if not found then
    raise exception 'Scraper record not found';
  end if;

  scraper_event_at := coalesce(
    case
      when nullif(target.raw_payload ->> 'incident_at', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (target.raw_payload ->> 'incident_at')::timestamptz
      else null
    end,
    case
      when nullif(target.raw_payload ->> 'published_at', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (target.raw_payload ->> 'published_at')::timestamptz
      else null
    end,
    case
      when nullif(target.raw_payload #>> '{article,published_at}', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (target.raw_payload #>> '{article,published_at}')::timestamptz
      else null
    end,
    target.scraped_at,
    now()
  );

  mapped_classification := case
    when target.category = 'vehicular' then 'mvc'::public.incident_classification
    when target.incident_type = 'fire' then 'fire'::public.incident_classification
    when target.incident_type in ('flood', 'earthquake', 'landslide') then 'rescue'::public.incident_classification
    else 'other'::public.incident_classification
  end;

  mapped_priority := case
    when lower(coalesce(target.severity, '')) in ('black', 'red', 'critical') then 'critical'::public.incident_priority
    when lower(coalesce(target.severity, '')) in ('yellow', 'high') then 'high'::public.incident_priority
    when lower(coalesce(target.severity, '')) in ('green', 'low') then 'low'::public.incident_priority
    else 'medium'::public.incident_priority
  end;

  if target.related_incident_id is null then
    insert into public.incidents(
      barangay_id,
      classification,
      subtype,
      priority,
      title,
      description,
      incident_date,
      incident_time,
      location_text,
      location,
      public_visible,
      status,
      record_origin,
      external_source_url,
      scraper_record_id
    )
    values (
      target.barangay_id,
      mapped_classification,
      target.incident_type,
      mapped_priority,
      target.title,
      target.snippet,
      (scraper_event_at at time zone 'Asia/Manila')::date,
      (scraper_event_at at time zone 'Asia/Manila')::time,
      coalesce(target.location_text, target.display_name),
      target.location,
      target.public_visible,
      'draft',
      'promoted_scraped',
      target.source_url,
      target.id
    )
    returning id into incident_id;
  else
    incident_id := target.related_incident_id;
  end if;

  update public.scraper_records
  set related_incident_id = incident_id,
      status = 'promoted',
      public_visible = true,
      processed_at = now()
  where id = target_record_id;

  return incident_id;
end;
$$;

grant execute on function public.promote_scraper_record_to_incident(uuid) to authenticated;
