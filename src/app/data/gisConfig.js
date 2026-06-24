export const ECHAGUE_GIS = {
  id: 'echague-isabela',
  name: 'Municipality of Echague',
  province: 'Isabela',
  country: 'Philippines',
  center: [16.7070, 121.6730],
  zoom: 11,
  bounds: {
    southWest: [16.60, 121.54],
    northEast: [16.82, 121.80],
  },
  barangayBoundaryServiceUrl: import.meta.env.VITE_PSA_BARANGAY_LAYER4_URL || '',
  barangayBoundaryServiceWhere: import.meta.env.VITE_PSA_BARANGAY_LAYER4_QUERY || '',
  barangayGeoJsonUrl: '/data/echague_barangays.geojson',
  municipalGeoJsonUrl: '/gis/echague/municipal-boundary.geojson',
  roadsGeoJsonUrl: '/gis/echague/roads.geojson',
  riversGeoJsonUrl: '/gis/echague/rivers.geojson',
  boundaryRefreshMs: 60000,
  supportedImports: ['GeoJSON', 'Shapefile (.shp zipped as GeoJSON after conversion)', 'KML/KMZ converted to GeoJSON'],
};

export const ECHAGUE_GIS_BOUNDARY_SOURCES = [
  {
    label: 'PSA Barangay Boundary Layer 4',
    type: 'arcgis',
    url: ECHAGUE_GIS.barangayBoundaryServiceUrl,
    where: ECHAGUE_GIS.barangayBoundaryServiceWhere,
  },
  {
    label: 'Local GeoJSON fallback',
    type: 'geojson',
    url: ECHAGUE_GIS.barangayGeoJsonUrl,
  },
].filter((source) => source.url);

export const ECHAGUE_BARANGAYS = [
  'Angoluan',
  'Annafunan',
  'Arabiat',
  'Aromin',
  'Babaran',
  'Bacradal',
  'Benguet',
  'Buneg',
  'Busilelao',
  'Cabugao (Poblacion)',
  'Caniguing',
  'Carulay',
  'Castillo',
  'Dammang East',
  'Dammang West',
  'Diasan',
  'Dicaraoyan',
  'Dugayong',
  'Fugu',
  'Garit Norte',
  'Garit Sur',
  'Gucab',
  'Gumbauan',
  'Ipil',
  'Libertad',
  'Mabbayad',
  'Mabuhay',
  'Madadamian',
  'Magleticia',
  'Malibago',
  'Maligaya',
  'Malitao',
  'Narra',
  'Nilumisu',
  'Pag-asa',
  'Pangal Norte',
  'Pangal Sur',
  'Rumang-ay',
  'Salay',
  'Salvacion',
  'San Antonio Ugad',
  'San Antonio Minit',
  'San Carlos',
  'San Fabian',
  'San Felipe',
  'San Juan',
  'San Manuel',
  'San Miguel',
  'San Salvador',
  'Santa Ana',
  'Santa Cruz',
  'Santa Maria',
  'Santa Monica',
  'Santo Domingo',
  'Silauan Norte (Poblacion)',
  'Silauan Sur (Poblacion)',
  'Sinabbaran',
  'Soyung (Poblacion)',
  'Taggappan (Poblacion)',
  'Tuguegarao',
  'Villa Campo',
  'Villa Fermin',
  'Villa Rey',
  'Villa Victoria',
];

export function normalizeBarangayName(value = '') {
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\((poblacion|formerly atelan)\)/g, '')
    .replace(/brgy\.?|barangay|poblacion/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function getFeatureBarangayName(feature) {
  const properties = feature?.properties || {};
  return (
    properties.NAME_3 ||
    properties.name ||
    properties.Barangay ||
    properties.BRGY_NAME ||
    properties.BARANGAY ||
    properties.Bgy_Name ||
    properties.brgy_name ||
    properties.Name ||
    properties.NAME ||
    properties.ADM4_EN ||
    properties.ADM4_PCODE ||
    ''
  );
}

export function matchBarangayName(value, barangays = ECHAGUE_BARANGAYS) {
  const normalized = normalizeBarangayName(value);
  return barangays.find((barangay) => normalizeBarangayName(barangay) === normalized) || value;
}

export function getBoundaryFeatureText(feature) {
  return Object.values(feature?.properties || {})
    .map((value) => String(value ?? ''))
    .join(' ')
    .toLowerCase();
}

export function isEchagueBoundaryFeature(feature) {
  const text = getBoundaryFeatureText(feature);
  return text.includes('echague') || text.includes('echague, isabela') || text.includes('isabela');
}
