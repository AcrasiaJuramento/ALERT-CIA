update public.scraper_records r
set
  classification_confidence = coalesce(
    nullif(r.classification_confidence, ''),
    nullif(r.raw_payload->>'classification_confidence', ''),
    nullif(r.raw_payload #>> '{classification,confidence}', ''),
    i.classification_confidence
  ),
  classification_score = coalesce(
    nullif(r.classification_score, 0),
    case
      when nullif(r.raw_payload->>'classification_score', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (r.raw_payload->>'classification_score')::numeric
      else null
    end,
    case
      when nullif(r.raw_payload #>> '{classification,score}', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (r.raw_payload #>> '{classification,score}')::numeric
      else null
    end,
    nullif(i.classification_score, 0),
    r.classification_score
  ),
  classification_reason = coalesce(
    nullif(r.classification_reason, ''),
    nullif(r.raw_payload->>'classification_reason', ''),
    nullif(r.raw_payload #>> '{classification,reason}', ''),
    i.classification_reason
  ),
  article_content_hash = coalesce(
    nullif(r.article_content_hash, ''),
    nullif(r.raw_payload->>'article_content_hash', ''),
    i.article_content_hash
  ),
  location_confidence = case
    when r.location_confidence <> '{}'::jsonb then r.location_confidence
    when r.raw_payload ? 'location_confidence' then r.raw_payload->'location_confidence'
    when r.raw_payload #> '{location,confidence}' is not null then r.raw_payload #> '{location,confidence}'
    else i.location_confidence
  end,
  updated_at = now()
from public.scraped_incidents i
where r.scraped_incident_id = i.id
  and r.deleted_at is null
  and (
    r.classification_confidence is null
    or r.classification_confidence = ''
    or r.classification_score = 0
    or r.classification_reason is null
    or r.classification_reason = ''
    or r.article_content_hash is null
    or r.article_content_hash = ''
    or r.location_confidence = '{}'::jsonb
  );
