import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { point as turfPoint, booleanPointInPolygon } from '@turf/turf';
import { Check, Crosshair, MapPin, Search, X } from 'lucide-react';
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftPin, setDraftPin] = useState(null);
  const [searchQuery, setSearchQuery] = useState(locationText || '');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

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

  const resolvePin = ({ lat, lng }) => {
    if (!isCoordinateInEchagueArea(lat, lng)) {
      setLoadError('Choose a location inside Echague.');
      return null;
    }

    const echagueFeature = findContainingFeature(echagueGeoJson, lat, lng);
    const fallbackFeature = echagueFeature ? null : findContainingFeature(isabelaGeoJson, lat, lng);
    const feature = echagueFeature || fallbackFeature;
    const rawBarangay = getFeatureBarangayName(feature);
    const barangay = rawBarangay ? matchBarangayName(rawBarangay) : '';
    const coordinatesText = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
    return {
      barangay,
      latitude: Number(lat.toFixed(7)),
      longitude: Number(lng.toFixed(7)),
      locationText: locationText || coordinatesText,
      locationGeography: makeLocationGeography(lat, lng),
      boundarySource: echagueFeature ? 'echague_barangays.geojson' : fallbackFeature ? 'Isabela.geojson' : 'unmatched',
    };
  };

  const openPicker = () => {
    setDraftPin(hasPin ? { lat: selectedLat, lng: selectedLng } : { lat: ECHAGUE_GIS.center[0], lng: ECHAGUE_GIS.center[1] });
    setPickerOpen(true);
  };
  const searchLocation = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=ph&q=${encodeURIComponent(`${query}, Echague, Isabela`)}`);
      if (!response.ok) throw new Error('Search unavailable');
      const rows = (await response.json()).map(item => ({ ...item, lat: Number(item.lat), lng: Number(item.lon) })).filter(item => isCoordinateInEchagueArea(item.lat, item.lng));
      setSearchResults(rows);
      if (!rows.length) setLoadError('No matching location found inside Echague.');
    } catch {
      setLoadError('Location search is unavailable. You can still place the pin manually.');
    } finally {
      setSearching(false);
    }
  };
  const chooseSearchResult = result => {
    setSearchQuery(result.display_name || searchQuery);
    setDraftPin({ lat: result.lat, lng: result.lng });
    setSearchResults([]);
    setPickerOpen(true);
  };
  const useGps = () => navigator.geolocation?.getCurrentPosition(position => {
    const next = { lat: position.coords.latitude, lng: position.coords.longitude };
    if (!isCoordinateInEchagueArea(next.lat, next.lng)) setLoadError('Your current GPS position is outside Echague.');
    else setDraftPin(next);
  }, () => setLoadError('Unable to read the current GPS position.'), { enableHighAccuracy: true, timeout: 10000 });
  const confirmPin = () => {
    const resolved = draftPin && resolvePin(draftPin);
    if (!resolved) return;
    onChange?.({ ...resolved, locationText: searchQuery.trim() || resolved.locationText });
    setPickerOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-3"><Search className="h-4 w-4 text-cyan-400"/><div className="min-w-0 flex-1"><div className="text-xs font-bold">Find a location before pinning</div><div className="text-[10px] text-muted-foreground">Search an address, landmark, or barangay.</div></div><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && searchLocation()} className="min-w-0 flex-1 rounded-lg border border-border bg-input-background px-3 py-2 text-sm" placeholder="Search location"/><button type="button" onClick={searchLocation} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">{searching ? 'Searching…' : 'Search'}</button></div>
        {searchResults.length > 0 && <div className="absolute left-3 right-3 top-full z-[1200] mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-xl">{searchResults.map(result => <button type="button" key={result.place_id} onClick={() => chooseSearchResult(result)} className="block w-full border-b border-border px-3 py-2 text-left text-xs hover:bg-secondary">{result.display_name}</button>)}</div>}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-blue-500" />
          Exact Incident Pin · Echague
        </div>
        <div className="text-[10px] text-muted-foreground">
          Tap map to choose
        </div>
      </div>
      <div role="button" tabIndex={0} onClick={openPicker} onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && openPicker()} className="relative block w-full cursor-pointer text-left" style={{ height }}>
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
          {hasPin && <Marker position={[selectedLat, selectedLng]} />}
        </MapContainer>
        <span className="pointer-events-none absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Tap map to place exact pin</span>
      </div>
      <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        {loadError || (hasInvalidPin ? 'Invalid saved coordinates ignored.' : hasPin ? `${selectedLat.toFixed(6)}, ${selectedLng.toFixed(6)}` : 'Search a location or tap the map to place the incident pin.')}
      </div>
    </div>
      {pickerOpen && <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/70 p-4"><div className="flex h-[min(720px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"><div className="flex items-center justify-between border-b border-border p-3"><div><div className="font-bold">Place Exact Incident Pin</div><div className="text-[10px] text-muted-foreground">Pan or pinch to zoom, then tap the exact location.</div></div><button type="button" onClick={() => setPickerOpen(false)}><X/></button></div><div className="min-h-0 flex-1"><MapContainer center={draftPin ? [draftPin.lat, draftPin.lng] : ECHAGUE_GIS.center} zoom={draftPin ? 15 : 12} minZoom={10} className="h-full w-full" scrollWheelZoom><MapViewController center={draftPin ? [draftPin.lat, draftPin.lng] : ECHAGUE_GIS.center} zoom={draftPin ? 15 : 12}/><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>{boundaryCollection && <GeoJSON data={boundaryCollection} style={() => ({ color: '#2563eb', weight: 1.5, fillColor: '#2563eb', fillOpacity: 0.06 })}/>}<PinClickHandler onPin={setDraftPin}/>{draftPin && <Marker position={[draftPin.lat, draftPin.lng]}/>}</MapContainer></div><div className="flex items-center gap-2 border-t border-border p-3"><div className="mr-auto text-xs font-semibold text-blue-300">{draftPin ? `${draftPin.lat.toFixed(6)}, ${draftPin.lng.toFixed(6)}` : 'No pin selected'}</div><button type="button" onClick={useGps} className="flex items-center gap-1 rounded-lg border border-cyan-500 px-3 py-2 text-xs font-bold text-cyan-300"><Crosshair size={15}/>GPS</button><button type="button" onClick={confirmPin} className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"><Check size={15}/>Use this pin</button></div></div></div>}
    </div>
  );
}
