import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { point as turfPoint, booleanPointInPolygon } from '@turf/turf';
import { MapPin } from 'lucide-react';
import isabelaGeoJsonUrl from '../data/Isabela.geojson?url';
import { ECHAGUE_GIS, getFeatureBarangayName, matchBarangayName } from '../data/gisConfig';

const ECHAGUE_GEOJSON_URL = '/data/echague_barangays.geojson';
const COORDINATE_PADDING = 0.1;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeLocationGeography(lat, lng) {
  return `SRID=4326;POINT(${Number(lng).toFixed(7)} ${Number(lat).toFixed(7)})`;
}

function isCoordinateInEchagueArea(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const { southWest, northEast } = ECHAGUE_GIS.bounds;
  return latitude >= southWest[0] - COORDINATE_PADDING
    && latitude <= northEast[0] + COORDINATE_PADDING
    && longitude >= southWest[1] - COORDINATE_PADDING
    && longitude <= northEast[1] + COORDINATE_PADDING;
}

async function fetchGeoJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.json();
}

function findContainingFeature(collection, lat, lng) {
  const point = turfPoint([Number(lng), Number(lat)]);
  return (collection?.features || []).find((feature) => {
    try {
      return booleanPointInPolygon(point, feature);
    } catch {
      return false;
    }
  });
}

function PinClickHandler({ onPin }) {
  useMapEvents({
    click: event => onPin(event.latlng),
  });
  return null;
}

function MapViewController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: false });
  }, [center, map, zoom]);
  return null;
}

export default function IncidentLocationPicker({ value = {}, locationText = '', onChange, height = 280 }) {
  const [echagueGeoJson, setEchagueGeoJson] = useState(null);
  const [isabelaGeoJson, setIsabelaGeoJson] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      fetchGeoJson(ECHAGUE_GEOJSON_URL),
      fetchGeoJson(isabelaGeoJsonUrl),
    ]).then(([echague, isabela]) => {
      if (!mounted) return;
      if (echague.status === 'fulfilled') setEchagueGeoJson(echague.value);
      if (isabela.status === 'fulfilled') setIsabelaGeoJson(isabela.value);
      if (echague.status === 'rejected' && isabela.status === 'rejected') {
        setLoadError('Barangay boundary files could not be loaded.');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedLat = Number(value.latitude ?? value.lat);
  const selectedLng = Number(value.longitude ?? value.lng);
  const hasPin = isCoordinateInEchagueArea(selectedLat, selectedLng);
  const hasInvalidPin = (value.latitude || value.lat || value.longitude || value.lng) && !hasPin;
  const center = hasPin ? [selectedLat, selectedLng] : ECHAGUE_GIS.center;

  const boundaryCollection = useMemo(() => echagueGeoJson || isabelaGeoJson, [echagueGeoJson, isabelaGeoJson]);

  const handlePin = async ({ lat, lng }) => {
    if (!isCoordinateInEchagueArea(lat, lng)) {
      onChange?.({
        barangay: '',
        latitude: '',
        longitude: '',
        locationText,
        locationGeography: '',
        boundarySource: 'outside Echague bounds',
      });
      return;
    }

    const echagueFeature = findContainingFeature(echagueGeoJson, lat, lng);
    const fallbackFeature = echagueFeature ? null : findContainingFeature(isabelaGeoJson, lat, lng);
    const feature = echagueFeature || fallbackFeature;
    const rawBarangay = getFeatureBarangayName(feature);
    const barangay = rawBarangay ? matchBarangayName(rawBarangay) : '';
    const coordinatesText = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    onChange?.({
      barangay,
      latitude: Number(lat.toFixed(7)),
      longitude: Number(lng.toFixed(7)),
      locationText: locationText || coordinatesText,
      locationGeography: makeLocationGeography(lat, lng),
      boundarySource: echagueFeature ? 'echague_barangays.geojson' : fallbackFeature ? 'Isabela.geojson' : 'unmatched',
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-blue-500" />
          Exact Incident Pin
        </div>
        <div className="text-[10px] text-muted-foreground">
          {hasPin ? `${selectedLat.toFixed(6)}, ${selectedLng.toFixed(6)}` : 'Click the map to pin location'}
        </div>
      </div>
      <div style={{ height }}>
        <MapContainer
          center={center}
          zoom={hasPin ? 15 : 12}
          minZoom={10}
          className="h-full w-full"
          scrollWheelZoom
        >
          <MapViewController center={center} zoom={hasPin ? 15 : 12} />
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {boundaryCollection && (
            <GeoJSON
              key={hasPin ? `${selectedLat}-${selectedLng}` : 'boundaries'}
              data={boundaryCollection}
              style={() => ({ color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.04 })}
            />
          )}
          <PinClickHandler onPin={handlePin} />
          {hasPin && <Marker position={[selectedLat, selectedLng]} />}
        </MapContainer>
      </div>
      <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        {loadError || (hasInvalidPin ? 'Invalid saved coordinates ignored. Click inside Echague to set the exact incident pin.' : value.boundarySource ? `Barangay source: ${value.boundarySource}` : 'GeoJSON boundary detection fills the barangay after pinning.')}
      </div>
    </div>
  );
}
