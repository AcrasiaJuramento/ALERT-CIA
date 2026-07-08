import { useEffect, useMemo, useState } from 'react';
import { GeoJSON, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { point as turfPoint, booleanPointInPolygon } from '@turf/turf';
import { MapPin } from 'lucide-react';
import isabelaGeoJsonUrl from '../data/Isabela.geojson?url';
import { ECHAGUE_GIS, getFeatureBarangayName, matchBarangayName } from '../data/gisConfig';

const ECHAGUE_GEOJSON_URL = '/data/echague_barangays.geojson';

function makeLocationGeography(lat, lng) {
  return `SRID=4326;POINT(${Number(lng).toFixed(7)} ${Number(lat).toFixed(7)})`;
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
  const hasPin = Number.isFinite(selectedLat) && Number.isFinite(selectedLng);
  const center = hasPin ? [selectedLat, selectedLng] : ECHAGUE_GIS.center;

  const boundaryCollection = useMemo(() => echagueGeoJson || isabelaGeoJson, [echagueGeoJson, isabelaGeoJson]);

  const handlePin = async ({ lat, lng }) => {
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
        {loadError || (value.boundarySource ? `Barangay source: ${value.boundarySource}` : 'GeoJSON boundary detection fills the barangay after pinning.')}
      </div>
    </div>
  );
}
