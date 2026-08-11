update public.scraper_records
set
  classification_confidence = case
    when lower(concat_ws(' ', incident_type, category, title, snippet)) ~ '(accident|aksidente|bangga|collision|crash|salpok|nasagasaan|vehicular)'
      and lower(concat_ws(' ', incident_type, category, title, snippet)) ~ '(motorcycle|motorsiklo|tricycle|truck|bus|car|vehicle|sasakyan|pedestrian)'
      then 'medium'
    when incident_type = 'vehicular' or category = 'vehicular'
      then 'medium'
    else 'low'
  end,
  classification_score = case
    when lower(concat_ws(' ', incident_type, category, title, snippet)) ~ '(accident|aksidente|bangga|collision|crash|salpok|nasagasaan|vehicular)'
      and lower(concat_ws(' ', incident_type, category, title, snippet)) ~ '(motorcycle|motorsiklo|tricycle|truck|bus|car|vehicle|sasakyan|pedestrian)'
      then 0.55
    when incident_type = 'vehicular' or category = 'vehicular'
      then 0.45
    else 0.15
  end,
  classification_reason = case
    when lower(concat_ws(' ', incident_type, category, title, snippet)) ~ '(carnapping|stolen|robbery|theft|holdap|batas trapiko|traffic law|paalala|reminder)'
      then 'Estimated from legacy scraped text: non-accident traffic/crime context found.'
    when lower(concat_ws(' ', incident_type, category, title, snippet)) ~ '(accident|aksidente|bangga|collision|crash|salpok|nasagasaan|vehicular)'
      then 'Estimated from legacy scraped text because no saved classifier metadata exists.'
    else 'Legacy scraped record was created before confidence scoring and needs review.'
  end,
  updated_at = now()
where deleted_at is null
  and (classification_confidence is null or classification_confidence = '');
