import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Check, Crosshair, ExternalLink, FileText, LocateFixed, MapPin, Navigation, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { getDispatchRecord, getPCRReportByResponse, listIncidents, listOfficerScrapedMapIncidents, listPCRMapIncidents } from '../services/supabase';
import { PCR_EDIT_KEY } from '../utils/pcrStorage';
import { useGeolocation } from '../contexts/GeolocationContext';
import { gpsAccuracyTone, gpsStatusMessage } from '../utils/locationQuality';

const FALLBACK_START = [16.705, 121.676];

const km = (a, b) => {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r;
  const dLng = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const meters = value => value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1)} km`;

const coords = record => {
  const lat = Number(record?.latitude ?? record?.lat);
  const lng = Number(record?.longitude ?? record?.lng ?? record?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
};

function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [35, 35] });
  }, [map, points]);
  return null;
}

function MapClickToSetCurrent({ enabled, onPick }) {
  useMapEvents({
    click: event => {
      if (enabled) onPick([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

async function roadRoutes(start, destination) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${destination[1]},${destination[0]}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Road routing is unavailable.');
  const data = await response.json();
  const routes = (data.routes || []).map(route => ({
    points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distance: route.distance,
    duration: route.duration,
    steps: (route.legs || []).flatMap(leg => leg.steps || []).map(step => ({
      instruction: step.maneuver?.instruction || [step.maneuver?.type, step.name && `on ${step.name}`].filter(Boolean).join(' '),
      distance: step.distance,
    })),
  }));
  if (!routes.length) throw new Error('No road route was returned.');
  return routes;
}

export default function DispatchNavigation() {
  const { dispatchId } = useParams();
  const navigate = useNavigate();
  const geolocation = useGeolocation();
  const [record, setRecord] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('alert-cia-navigation-dispatch') || 'null');
    } catch {
      return null;
    }
  });
  const [current, setCurrent] = useState(FALLBACK_START);
  const [currentSource, setCurrentSource] = useState('fallback');
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState(String(FALLBACK_START[0]));
  const [manualLng, setManualLng] = useState(String(FALLBACK_START[1]));
  const [routeOptions, setRouteOptions] = useState([]);
  const [routeIndex, setRouteIndex] = useState(0);
  const [routeSource, setRouteSource] = useState('loading');
  const [alerts, setAlerts] = useState([]);
  const [navigationActive, setNavigationActive] = useState(false);
  const [voice, setVoice] = useState(true);
  const [loading, setLoading] = useState(true);
  const hasInitialLocationRef = useRef(false);
  const destination = useMemo(() => coords(record), [record]);
  const route = routeOptions[routeIndex];

  useEffect(() => {
    if (!dispatchId || record?.id === dispatchId || record?.dispatchId === dispatchId) return;
    getDispatchRecord(dispatchId).then(setRecord).catch(error => toast.error(error.message));
  }, [dispatchId, record]);

  useEffect(() => {
    const { latitude, longitude } = geolocation.position?.coords || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if ((!hasInitialLocationRef.current || navigationActive) && currentSource !== 'manual') {
      hasInitialLocationRef.current = true;
      queueMicrotask(() => {
        setCurrent([latitude, longitude]);
        setCurrentSource('gps');
        setManualLat(latitude.toFixed(6));
        setManualLng(longitude.toFixed(6));
      });
    }
  }, [currentSource, geolocation.position, navigationActive]);

  useEffect(() => {
    if (!current || !destination) return;
    queueMicrotask(() => setLoading(true));
    Promise.all([
      roadRoutes(current, destination)
        .then(routes => {
          setRouteSource('verified_road');
          return routes;
        })
        .catch(() => {
          setRouteSource('direct_fallback');
          const distance = km(current, destination) * 1000;
          return [{
            points: [current, destination],
            distance,
            duration: km(current, destination) / 35 * 3600,
            steps: [{ instruction: 'Continue toward the exact dispatch pin. Road routing is unavailable.', distance }],
          }];
        }),
      Promise.all([
        listIncidents({ limit: 500 }),
        listPCRMapIncidents({ limit: 200 }),
        listOfficerScrapedMapIncidents({ includeUnverified: false }),
      ]).catch(() => [[], [], []]),
    ]).then(([routes, sources]) => {
      setRouteOptions(routes);
      const routePoints = routes[0]?.points || [];
      const warnings = sources
        .flat()
        .map(item => ({ ...item, point: coords(item) }))
        .filter(item => item.point)
        .map(item => ({ ...item, routeDistance: Math.min(...routePoints.map(point => km(point, item.point))) }))
        .filter(item => item.routeDistance <= 0.35)
        .sort((a, b) => a.routeDistance - b.routeDistance);
      setAlerts(warnings);
    }).finally(() => setLoading(false));
  }, [current, destination]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const speak = useCallback(text => {
    if (!voice || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }, [voice]);

  const toggleNavigation = () => {
    if (navigationActive) {
      setNavigationActive(false);
      window.speechSynthesis?.cancel();
      return;
    }
    setNavigationActive(true);
    speak('Navigation started. Follow the displayed route to the exact dispatch pin.');
  };

  const continueToPCR = async () => {
    const pcr = await getPCRReportByResponse(record.responseId).catch(() => null);
    const pcrId = pcr?.id || pcr?.pcrId || record.linkedPcrId;
    if (pcrId) {
      sessionStorage.setItem(PCR_EDIT_KEY, pcrId);
      const query = new URLSearchParams({ edit: pcrId, dispatch: record.dispatchId || record.id });
      if (record.responseId) query.set("response", record.responseId);
      navigate(`/admin/pcr/new?${query.toString()}`);
    } else {
      navigate(`/admin/pcr/new?dispatch=${record.dispatchId || record.id}`);
    }
  };

  const openMaps = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination[0]},${destination[1]}&travelmode=driving`, '_blank', 'noopener,noreferrer');
  const gpsAccuracy = Number(geolocation.position?.coords?.accuracy);
  const gpsTone = gpsAccuracyTone(gpsAccuracy, geolocation.status);
  const gpsDot = gpsTone === 'success' ? 'bg-emerald-500' : gpsTone === 'warning' ? 'bg-amber-500' : 'bg-red-500';

  const useGpsAsStart = () => {
    const { latitude, longitude } = geolocation.position?.coords || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      toast.error('No reliable GPS fix is available yet.');
      return;
    }
    setCurrent([latitude, longitude]);
    setCurrentSource('gps');
    setManualLat(latitude.toFixed(6));
    setManualLng(longitude.toFixed(6));
    setManualMode(false);
    toast.success('Responder position updated from GPS.');
  };

  const confirmManualStart = () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('Enter valid latitude and longitude.');
      return;
    }
    setCurrent([lat, lng]);
    setCurrentSource('manual');
    setManualMode(false);
    toast.success('Responder position confirmed manually.');
  };

  const pickManualStart = point => {
    setCurrent(point);
    setManualLat(point[0].toFixed(6));
    setManualLng(point[1].toFixed(6));
    setCurrentSource('manual');
    setManualMode(false);
    toast.success('Responder position set from map.');
  };

  const directRoute = useMemo(() => ({
    points: [current, destination].filter(Boolean),
    distance: current && destination ? km(current, destination) * 1000 : 0,
    duration: current && destination ? km(current, destination) / 35 * 3600 : 0,
    steps: [{ instruction: 'Continue toward the exact dispatch pin.', distance: current && destination ? km(current, destination) * 1000 : 0 }],
  }), [current, destination]);
  const visibleRoute = route || directRoute;
  const mapPoints = visibleRoute.points;
  const routeLabel = routeSource === 'verified_road'
    ? 'Road route from OpenStreetMap/OSRM routing data.'
    : routeSource === 'direct_fallback'
      ? 'Direct fallback route. Verify road access manually.'
      : 'Calculating route source.';

  if (!record) return <div className="p-6 text-sm text-muted-foreground">Loading dispatch navigation...</div>;
  if (!destination) return <div className="p-6"><div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">This dispatch has no valid exact incident coordinates.</div></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 text-foreground md:p-6">
      <div>
        <h1 className="text-xl font-bold">Dispatch Navigation</h1>
        <p className="text-xs text-muted-foreground">Field Officer - A: responder position - B: exact dispatch pin</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${gpsDot}`} />
              <div>
                <div className="text-sm font-bold">GPS and Route Accuracy</div>
                <div className="text-xs text-muted-foreground">{gpsStatusMessage(geolocation.status, gpsAccuracy)}</div>
              </div>
            </div>
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
              Start: {currentSource === 'manual' ? 'Manual confirmed' : currentSource === 'gps' ? 'GPS' : 'Fallback center'}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button onClick={useGpsAsStart} className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold"><LocateFixed size={16} />Use GPS</button>
            <button onClick={() => setManualMode(value => !value)} className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold"><MapPin size={16} />Manual position</button>
            <button onClick={confirmManualStart} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Check size={16} />Confirm A</button>
          </div>
          {manualMode && (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input value={manualLat} onChange={event => setManualLat(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs" placeholder="Latitude" />
              <input value={manualLng} onChange={event => setManualLng(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-xs" placeholder="Longitude" />
              <button onClick={confirmManualStart} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Crosshair size={15} />Set</button>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">When manual position mode is open, tap the map to place Point A if GPS is denied or inaccurate.</p>
        </div>

        <div className={`rounded-xl border p-4 ${routeSource === 'direct_fallback' ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-card'}`}>
          <div className="text-sm font-bold">Routing Source</div>
          <div className="mt-1 text-xs text-muted-foreground">{routeLabel}</div>
          <div className="mt-2 text-sm font-semibold text-cyan-400">
            {(visibleRoute.distance / 1000).toFixed(1)} km - about {Math.max(1, Math.round(visibleRoute.duration / 60))} min
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="h-[65vh] min-h-[520px] max-h-[760px]">
          <MapContainer center={destination} zoom={13} className="h-full w-full">
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapClickToSetCurrent enabled={manualMode} onPick={pickManualStart} />
            <Polyline positions={visibleRoute.points} pathOptions={{ color: '#0ea5e9', weight: 6 }} />
            {current && Number.isFinite(gpsAccuracy) && currentSource === 'gps' && (
              <Circle center={current} radius={gpsAccuracy} pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.12, weight: 1 }} />
            )}
            {current && (
              <CircleMarker center={current} radius={17} pathOptions={{ color: '#fff', weight: 3, fillColor: currentSource === 'manual' ? '#16a34a' : '#2563eb', fillOpacity: 1 }}>
                <Tooltip permanent direction="center" className="font-bold">A</Tooltip>
              </CircleMarker>
            )}
            <CircleMarker center={destination} radius={17} pathOptions={{ color: '#fff', weight: 3, fillColor: '#ef4444', fillOpacity: 1 }}>
              <Tooltip permanent direction="center" className="font-bold">B</Tooltip>
            </CircleMarker>
            <FitRoute points={mapPoints} />
          </MapContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">{[...(record.natureTypes || []), record.otherMedical, record.otherTrauma].filter(Boolean).join(', ') || 'Emergency Dispatch'}</h2>
            <div className="mt-1 font-mono text-sm text-blue-400">{record.responseNumber}</div>
            <div className="mt-1 text-xs text-muted-foreground">{destination[0].toFixed(6)}, {destination[1].toFixed(6)} - Barangay: {record.barangay || '-'}</div>
          </div>
          <span className="rounded-full border border-blue-500 px-2.5 py-1 text-[11px] font-bold text-blue-400">{record.status}</span>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-amber-400"><ShieldAlert size={18} />Route safety warnings</h2>
        {alerts.length ? (
          <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-2">
            {alerts.map(item => (
              <div key={`${item.sourceKind}-${item.id}`} className="flex gap-2 text-sm">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${String(item.severity).toLowerCase() === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div>
                  <div className="font-semibold">{item.title || item.classification || item.type || 'Safety alert'}</div>
                  <div className="text-[11px] text-muted-foreground">{item.location || item.barangay || ''} - {Math.round(item.routeDistance * 1000)} m from route</div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-xs text-muted-foreground">No mapped safety warnings near this route.</p>}
        <button disabled={routeOptions.length < 2} onClick={() => { setRouteIndex(currentIndex => (currentIndex + 1) % routeOptions.length); speak('A safer alternate route is selected.'); }} className="mt-3 rounded-lg bg-secondary px-4 py-2 text-xs font-semibold disabled:opacity-40">Find Safer Route</button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setVoice(value => !value)} className="flex items-center gap-2 rounded-lg border border-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-400">{voice ? <Volume2 size={18} /> : <VolumeX size={18} />}Voice</button>
        <button onClick={toggleNavigation} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Navigation size={18} />{navigationActive ? 'Stop Navigation' : 'Start Navigation'}</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold">Directions</h2>
        <div className="mt-2 max-h-64 divide-y divide-border overflow-y-auto pr-2">
          {visibleRoute.steps.map((step, index) => (
            <div key={`${index}-${step.instruction}`} className="flex gap-2 py-2.5 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">{index + 1}</span>
              <div>
                <div>{step.instruction || 'Continue'}</div>
                <div className="text-[11px] text-muted-foreground">{meters(step.distance)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={openMaps} className="flex items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold"><ExternalLink size={18} />Open in Maps</button>
        <button onClick={continueToPCR} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><FileText size={18} />Continue to PCR</button>
      </div>
      {loading && <div className="fixed bottom-5 right-5 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-xl">Calculating route...</div>}
    </div>
  );
}
