# Echague GIS Boundary Assets

Place official GIS files for the Municipality of Echague, Isabela in this folder.

Required:

- `barangays.geojson` - official barangay boundary polygons as a GeoJSON `FeatureCollection`

Optional overlays:

- `municipal-boundary.geojson` - official municipal boundary polygon
- `roads.geojson` - official or validated road line overlays
- `rivers.geojson` - official or validated river line overlays

Supported source formats:

- GeoJSON can be used directly.
- KML polygon placemarks can be imported in the app and should be saved here as GeoJSON for deployment.
- SHP/KMZ should be converted to GeoJSON before deployment.

Required barangay feature property:

- Prefer `BRGY_NAME`.
- The loader also accepts `BARANGAY`, `Bgy_Name`, `brgy_name`, `name`, `Name`, `NAME`, and `ADM4_EN`.

Accuracy rule:

- Do not commit traced, estimated, AI-generated, or screenshot-derived boundaries as authoritative GIS data.

ArcGIS REST option:

- Set `VITE_PSA_BARANGAY_LAYER4_URL` to the official PSA Barangay Boundary Layer 4 ArcGIS REST endpoint.
- Optionally set `VITE_PSA_BARANGAY_LAYER4_QUERY` when the service requires a municipality/province filter.
