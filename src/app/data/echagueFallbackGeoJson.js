import { ECHAGUE_BARANGAYS, ECHAGUE_GIS } from './gisConfig';

export function createEchagueBarangayFallbackGeoJson() {
  const [south, west] = ECHAGUE_GIS.bounds.southWest;
  const [north, east] = ECHAGUE_GIS.bounds.northEast;
  const columns = 8;
  const rows = Math.ceil(ECHAGUE_BARANGAYS.length / columns);
  const latStep = (north - south) / rows;
  const lngStep = (east - west) / columns;

  return {
    type: 'FeatureCollection',
    metadata: {
      source: 'Generated fallback grid for local development',
      projection: 'EPSG:4326',
      authoritative: false,
    },
    features: ECHAGUE_BARANGAYS.map((name, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const minLng = west + (column * lngStep);
      const maxLng = column === columns - 1 ? east : minLng + lngStep;
      const maxLat = north - (row * latStep);
      const minLat = row === rows - 1 ? south : maxLat - latStep;

      return {
        type: 'Feature',
        properties: {
          BRGY_NAME: name,
          MUNICIPALITY: 'Echague',
          PROVINCE: 'Isabela',
          SOURCE: 'Generated fallback grid',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [minLng, minLat],
            [maxLng, minLat],
            [maxLng, maxLat],
            [minLng, maxLat],
            [minLng, minLat],
          ]],
        },
      };
    }),
  };
}
