import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Car, Clock, Crosshair, LocateFixed, MapPin,
  Navigation, RefreshCw, Route, ShieldAlert, X
} from 'lucide-react';
import { LeafletIncidentMap } from '../../components/map/LeafletIncidentMap';
import {
  listIncidents,
  listPublicHazardZones,
  listPublicPCRMapIncidents,
  listPublicScrapedMapIncidents,
  supabase,
} from '../../services/supabase';
import { ECHAGUE_CENTER, getIncidentLatLng, getZoneLatLng } from '../../utils/mapData';
import { isIncidentCompleted } from '../../utils/incidentStatus';

const quickDestinations = [
  { label: 'Echague Municipal Hall', latLng: [16.705, 121.676] },
  { label: 'Echague Public Market', latLng: [16.7042, 121.6781] },
  { label: 'MDRRMO Echague', latLng: [16.706, 121.6752] },
  { label: 'Cagayan Valley Road', latLng: [16.7008, 121.6844] },
];

const severityTone = {
  critical: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
  warning: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300',
  moderate: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300',
  resolved: 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300',
};

function sanitizeForPublic(record = {}) {
  const type = record.type || record.classification || 'incident';
  return {
    ...record,
    sourceLabel: record.sourceKind === 'pcr_report' ? 'Verified emergency response' : record.sourceLabel || 'Approved public report',
    assignedTeam: 'Emergency responders',
    title: record.title || `${type} alert`,
    description: record.sourceKind === 'pcr_report'
      ? 'Emergency response activity has been verified in this area. Keep distance and follow official guidance.'
      : record.description || 'Use caution near this area and consider another route if conditions are unsafe.',
  };
}

function hasMapCoordinates(record) {
  return Number.isFinite(Number(record?.lat)) && Number.isFinite(Number(record?.lng));
}

function distanceKm(from, to) {
  if (!from || !to) return 0;
  const [lat1, lon1] = from.map(Number);
  const [lat2, lon2] = to.map(Number);
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parsePointInput(value = '') {
  const quick = quickDestinations.find(item => item.label.toLowerCase() === value.trim().toLowerCase());
  if (quick) return { label: quick.label, latLng: quick.latLng };

  const match = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { label: value.trim(), latLng: [lat, lng] };
}

function nearestPointDistanceKm(point, routePoints = []) {
  if (!routePoints.length) return Infinity;
  return Math.min(...routePoints.map(routePoint => distanceKm(point, routePoint)));
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return '-';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function fallbackRoute(start, destination) {
  const distance = distanceKm(start.latLng, destination.latLng);
  return {
    positions: [start.latLng, destination.latLng],
    distanceKm: distance,
    durationMinutes: Math.max(2, Math.round((distance / 28) * 60)),
    provider: 'Direct safety route',
    steps: [
      { instruction: `Start from ${start.label || 'Point A'}`, distance: 0 },
      { instruction: `Continue toward ${destination.label || 'Point B'} while monitoring nearby alerts.`, distance: distance * 1000 },
      { instruction: `Arrive at ${destination.label || 'destination'}`, distance: 0 },
    ],
  };
}

async function fetchRoute(start, destination) {
  const startLngLat = `${start.latLng[1]},${start.latLng[0]}`;
  const endLngLat = `${destination.latLng[1]},${destination.latLng[0]}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${startLngLat};${endLngLat}?overview=full&geometries=geojson&steps=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Routing service unavailable.');
  const payload = await response.json();
  const route = payload.routes?.[0];
  if (!route?.geometry?.coordinates?.length) throw new Error('No route found.');

  return {
    positions: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    provider: 'OSRM road route',
    steps: (route.legs || []).flatMap(leg => (leg.steps || []).map(step => ({
      instruction: step.maneuver?.modifier
        ? `${step.maneuver.type} ${step.maneuver.modifier} on ${step.name || 'road'}`
        : `${step.maneuver?.type || 'Continue'} on ${step.name || 'road'}`,
      distance: step.distance,
    }))).slice(0, 12),
  };
}

function buildRouteAlerts({ incidents, hazardZones, routePoints, currentLocation }) {
  const incidentAlerts = incidents
    .map(item => {
      const distance = nearestPointDistanceKm(getIncidentLatLng(item), routePoints);
      const approach = currentLocation ? distanceKm(currentLocation, getIncidentLatLng(item)) : distance;
      return {
        id: item.id,
        label: item.title || `${item.type || 'Incident'} alert`,
        type: item.type || 'incident',
        severity: item.severity || 'moderate',
        distance,
        approach,
        description: item.description,
      };
    })
    .filter(item => item.distance <= 0.6);

  const zoneAlerts = hazardZones
    .map(zone => {
      const zonePoint = getZoneLatLng(zone);
      const distance = nearestPointDistanceKm(zonePoint, routePoints);
      const approach = currentLocation ? distanceKm(currentLocation, zonePoint) : distance;
      return {
        id: zone.id,
        label: zone.label,
        type: zone.type,
        severity: zone.severity === 'critical' ? 'critical' : zone.severity === 'high' ? 'warning' : 'moderate',
        distance,
        approach,
        description: zone.description || 'Hazard zone near this route.',
      };
    })
    .filter(item => item.distance <= 0.8);

  return [...incidentAlerts, ...zoneAlerts]
    .sort((first, second) => first.approach - second.approach)
    .slice(0, 8);
}

export default function PublicMap() {
  const [incidents, setIncidents] = useState([]);
  const [hazardZones, setHazardZones] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [pinMode, setPinMode] = useState(null);
  const [start, setStart] = useState(null);
  const [destination, setDestination] = useState(null);
  const [startInput, setStartInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [routePlan, setRoutePlan] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [routeError, setRouteError] = useState('');

  const loadMap = async () => {
    setLoading(true);
    setError('');
    try {
      const [official, pcrLinked, scraped, zones] = await Promise.all([
        listIncidents({ publicOnly: true, limit: 300 }),
        listPublicPCRMapIncidents({ limit: 100 }),
        listPublicScrapedMapIncidents({ limit: 100 }),
        listPublicHazardZones({ limit: 100 }),
      ]);
      const officialIds = new Set(official.map(item => item.id));
      const pcrOnly = pcrLinked.filter(item => !officialIds.has(item.relatedIncidentId));
      setIncidents([...official, ...pcrOnly, ...scraped].filter(hasMapCoordinates).map(sanitizeForPublic));
      setHazardZones(zones);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load live map data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMap();
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase
      .channel('public-live-navigation-records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scraper_records' }, () => loadMap())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => loadMap())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hazard_zones' }, () => loadMap())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => setCurrentLocation([coords.latitude, coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!currentLocation || start?.label !== 'Current GPS location') return;
    setStart(current => current ? { ...current, latLng: currentLocation } : current);
  }, [currentLocation, start?.label]);

  useEffect(() => {
    let cancelled = false;
    async function updateRoute() {
      if (!start?.latLng || !destination?.latLng) {
        setRoutePlan(null);
        return;
      }
      setRouteLoading(true);
      setRouteError('');
      try {
        const nextRoute = await fetchRoute(start, destination);
        if (!cancelled) setRoutePlan(nextRoute);
      } catch (requestError) {
        if (!cancelled) {
          setRoutePlan(fallbackRoute(start, destination));
          setRouteError(`${requestError.message || 'Routing service unavailable.'} Showing direct safety route.`);
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }
    updateRoute();
    return () => {
      cancelled = true;
    };
  }, [destination, start]);

  const activeIncidents = useMemo(() => incidents.filter(item => !isIncidentCompleted(item.status)), [incidents]);
  const selectedIncident = incidents.find(item => item.id === selectedIncidentId);
  const routePoints = useMemo(() => routePlan?.positions || [], [routePlan]);
  const routeAlerts = useMemo(
    () => buildRouteAlerts({ incidents: activeIncidents, hazardZones, routePoints, currentLocation }),
    [activeIncidents, currentLocation, hazardZones, routePoints]
  );
  const nearestRisks = useMemo(
    () => [...activeIncidents]
      .map(item => ({ ...item, distance: distanceKm(currentLocation || ECHAGUE_CENTER, getIncidentLatLng(item)) }))
      .sort((first, second) => first.distance - second.distance)
      .slice(0, 6),
    [activeIncidents, currentLocation]
  );
  const route = routePlan
    ? [{
        id: 'planned-route',
        label: `${start?.label || 'Point A'} to ${destination?.label || 'Point B'}`,
        positions: routePlan.positions,
        color: routeAlerts.some(alert => alert.severity === 'critical') ? '#dc2626' : '#2563eb',
        weight: 6,
      }]
    : [];

  const setPointFromInput = (kind) => {
    const parsed = parsePointInput(kind === 'start' ? startInput : destinationInput);
    if (!parsed) {
      setRouteError('Enter coordinates as "16.705, 121.676" or choose a quick destination.');
      return;
    }
    if (kind === 'start') setStart(parsed);
    else setDestination(parsed);
  };

  const useGpsStart = () => {
    if (!currentLocation) {
      setRouteError('Allow location access to use GPS as Point A.');
      return;
    }
    setStart({ label: 'Current GPS location', latLng: currentLocation });
    setStartInput('Current GPS location');
    setRouteError('');
  };

  const handleMapClick = (latlng) => {
    if (!pinMode) return;
    const point = { label: pinMode === 'start' ? 'Pinned Point A' : 'Pinned Point B', latLng: [latlng.lat, latlng.lng] };
    if (pinMode === 'start') {
      setStart(point);
      setStartInput(`${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
    } else {
      setDestination(point);
      setDestinationInput(`${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
    }
    setPinMode(null);
    setRouteError('');
  };

  const clearRoute = () => {
    setStart(null);
    setDestination(null);
    setRoutePlan(null);
    setStartInput('');
    setDestinationInput('');
    setRouteError('');
  };

  const approachingAlert = routeAlerts.find(alert => alert.approach <= 0.35);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="grid min-h-screen lg:grid-cols-[1fr_390px]">
        <main className="relative min-h-[72vh] lg:min-h-screen">
          <LeafletIncidentMap
            height="100vh"
            incidents={incidents}
            hazardZones={hazardZones}
            routes={route}
            plannerPoints={{
              current: currentLocation ? { label: 'Current GPS location', latLng: currentLocation } : null,
              start,
              destination,
            }}
            selectedIncidentId={selectedIncidentId || undefined}
            onMarkerClick={setSelectedIncidentId}
            onMapClick={handleMapClick}
            showControls
            showHeatmap={false}
            showDangerZones
            clusterMarkers={false}
            autoFit={!route.length && !selectedIncidentId}
          />

          <div className="absolute left-4 top-4 z-[500] w-[min(calc(100%-2rem),430px)] rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-blue-500" />
                <h1 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Live Safety Navigation</h1>
              </div>
              <button onClick={loadMap} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary" title="Refresh alerts">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <RouteInput
                label="Point A"
                value={startInput}
                placeholder="Start or lat,lng"
                onChange={setStartInput}
                onApply={() => setPointFromInput('start')}
                onPin={() => setPinMode(pinMode === 'start' ? null : 'start')}
                active={pinMode === 'start'}
              />
              <RouteInput
                label="Point B"
                value={destinationInput}
                placeholder="Destination or lat,lng"
                onChange={setDestinationInput}
                onApply={() => setPointFromInput('destination')}
                onPin={() => setPinMode(pinMode === 'destination' ? null : 'destination')}
                active={pinMode === 'destination'}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={useGpsStart} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                <LocateFixed className="h-3.5 w-3.5" />
                Use GPS start
              </button>
              <button onClick={clearRoute} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                Clear route
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {quickDestinations.map(item => (
                <button
                  key={item.label}
                  onClick={() => {
                    setDestination(item);
                    setDestinationInput(item.label);
                  }}
                  className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {item.label}
                </button>
              ))}
            </div>
            {pinMode && <p className="mt-2 text-[11px] font-medium text-blue-500">Tap the map to set {pinMode === 'start' ? 'Point A' : 'Point B'}.</p>}
            {routeError && <p className="mt-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-[11px] text-orange-500">{routeError}</p>}
          </div>

          {approachingAlert && (
            <div className="absolute left-1/2 top-4 z-[520] hidden w-[360px] -translate-x-1/2 rounded-xl border border-orange-500/40 bg-orange-500/95 p-3 text-white shadow-xl lg:block">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>
                  <div className="text-xs font-bold">{approachingAlert.label} ahead</div>
                  <p className="text-[11px] text-white/90">Approaching in {formatDistance(approachingAlert.approach)}. Slow down and consider rerouting.</p>
                </div>
              </div>
            </div>
          )}

          <div className="absolute bottom-5 left-4 right-4 z-[500] rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur lg:right-auto lg:w-[460px]">
            <div className="flex items-start gap-3">
              <ShieldAlert className={`mt-0.5 h-5 w-5 ${routeAlerts.some(alert => alert.severity === 'critical') ? 'text-red-500' : 'text-blue-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-foreground">
                  {routePlan ? `${routePlan.provider}: ${formatDistance(routePlan.distanceKm)}` : selectedIncident?.title || 'Plan a safe route'}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {routePlan
                    ? `${routePlan.durationMinutes} min estimate. ${routeAlerts.length} safety alert${routeAlerts.length === 1 ? '' : 's'} near this route.`
                    : 'Set Point A and Point B, or pin them on the map, to generate safety-aware route guidance.'}
                </p>
                {routeLoading && <p className="mt-1 text-[11px] text-blue-500">Generating route...</p>}
              </div>
            </div>
          </div>
        </main>

        <aside className="border-l border-border bg-card">
          <div className="border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-bold text-foreground">Route Guidance</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{activeIncidents.length} public incident alerts / {hazardZones.length} hazard zones</p>
            {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-border p-4">
            <Metric label="Critical" value={routeAlerts.filter(item => item.severity === 'critical').length} />
            <Metric label="Route Alerts" value={routeAlerts.length} />
            <Metric label="Steps" value={routePlan?.steps?.length || 0} />
          </div>

          <Panel title="Active Route Alerts">
            {routeAlerts.map(alert => (
              <div key={`${alert.type}-${alert.id}`} className={`rounded-lg border p-3 ${severityTone[alert.severity] || severityTone.moderate}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{alert.label}</span>
                  <span className="text-[10px]">{formatDistance(alert.distance)} off route</span>
                </div>
                <p className="mt-1 text-[11px] opacity-80">{alert.description}</p>
              </div>
            ))}
            {!routeAlerts.length && <p className="text-xs text-muted-foreground">No active alerts within the route corridor.</p>}
          </Panel>

          <Panel title="Directions">
            {routePlan?.steps?.map((step, index) => (
              <div key={`${step.instruction}-${index}`} className="flex gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{index + 1}</div>
                <div>
                  <div className="text-xs font-semibold text-foreground capitalize">{step.instruction.replaceAll('_', ' ')}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{formatDistance((step.distance || 0) / 1000)}</div>
                </div>
              </div>
            ))}
            {!routePlan && <p className="text-xs text-muted-foreground">Directions appear after Point A and Point B are set.</p>}
          </Panel>

          <Panel title="Nearby Road Risks">
            {nearestRisks.map(incident => (
              <button
                key={incident.id}
                onClick={() => setSelectedIncidentId(incident.id)}
                className={`w-full rounded-lg border border-border p-3 text-left hover:bg-secondary/50 ${selectedIncidentId === incident.id ? 'bg-secondary' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold capitalize text-foreground">{incident.type || 'Incident'}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDistance(incident.distance)}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{incident.location || 'Mapped public alert'}</p>
              </button>
            ))}
            {!nearestRisks.length && <p className="text-xs text-muted-foreground">No approved public map alerts are available.</p>}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function RouteInput({ label, value, placeholder, onChange, onApply, onPin, active }) {
  return (
    <div className="grid grid-cols-[58px_1fr_auto_auto] items-center gap-2">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-blue-500"
        list="live-map-destinations"
      />
      <button onClick={onApply} className="rounded-lg bg-secondary px-2.5 py-2 text-[10px] font-semibold text-foreground hover:bg-secondary/80">Set</button>
      <button onClick={onPin} className={`grid h-8 w-8 place-items-center rounded-lg border ${active ? 'border-blue-500 bg-blue-600 text-white' : 'border-border text-muted-foreground hover:bg-secondary'}`} title={`Pin ${label} on map`}>
        <Crosshair className="h-3.5 w-3.5" />
      </button>
      <datalist id="live-map-destinations">
        {quickDestinations.map(item => <option key={item.label} value={item.label} />)}
      </datalist>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 text-center">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="border-b border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Route className="h-3.5 w-3.5 text-blue-500" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
