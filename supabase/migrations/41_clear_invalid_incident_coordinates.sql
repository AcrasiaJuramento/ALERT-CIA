-- Clear malformed incident pins that landed outside the Echague operating area.
-- These usually appear as tiny 0.x coordinates and render the picker near Null Island.

begin;

update public.responses
set latitude = null,
    longitude = null,
    location_geography = null,
    updated_at = now()
where latitude is not null
  and longitude is not null
  and not (
    latitude between 16.50 and 16.92
    and longitude between 121.44 and 121.90
  );

update public.incidents
set latitude = null,
    longitude = null,
    location = null,
    updated_at = now()
where latitude is not null
  and longitude is not null
  and not (
    latitude between 16.50 and 16.92
    and longitude between 121.44 and 121.90
  );

commit;
