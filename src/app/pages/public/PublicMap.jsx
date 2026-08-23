import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Car, Clock, Crosshair, LocateFixed, MapPin,
  Megaphone, Navigation, RefreshCw, Route, Search, ShieldAlert, X, Volume2, VolumeX
} from 'lucide-react';
import { LeafletIncidentMap } from '../../components/map/LeafletIncidentMap';
import navVoice from '../../utils/navigationVoice';
import {
  listPublishedAdvisories,
  listPublicHazardZones,
  supabase,
} from '../../services/supabase';
import { ECHAGUE_CENTER, getIncidentLatLng, getZoneLatLng, hasValidLatLng } from '../../utils/mapData';
import { isIncidentCompleted } from '../../utils/incidentStatus';
import { loadPublicAccidentIncidents } from '../../utils/publicIncidentFeed';
import {
  calculateAccidentProneAreas,
  formatRiskLevel,
  riskStyles,
} from '../../utils/accidentProneAreas';
import { useGeolocation } from '../../contexts/GeolocationContext';
import { getAccidentProneAreaRadiusMeters } from '../../utils/accidentProneWarningZones';
import {
  canStartAutomaticReroute,
  getNextOffRouteConfirmationCount,
  normalizeBrowserPosition,
} from '../../utils/routeNavigation';

const quickDestinations = [
  { label: 'Echague Municipal Hall', latLng: [16.705, 121.676] },
  { label: 'Echague Public Market', latLng: [16.7042, 121.6781] },
  { label: 'MDRRMO Echague', latLng: [16.706, 121.6752] },
  { label: 'Isabela State University Main Campus', latLng: [16.7138, 121.6823] },
  { label: 'Cagayan Valley Road', latLng: [16.7008, 121.6844] },
];

const ALERT_VOICE_DISTANCE_KM = 0.1;

const severityTone = {
  critical: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
  warning: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300',
  moderate: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300',
  resolved: 'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300',
};

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

function parsePointInput(value = '', searchOptions = quickDestinations) {
  const quick = searchOptions.find(item => item.label.toLowerCase() === value.trim().toLowerCase());
  if (quick) return { label: quick.label, latLng: quick.latLng };

  const match = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { label: value.trim(), latLng: [lat, lng] };
}

async function searchPlaceSuggestions(value = '', limit = 6) {
  const query = value.trim();
  if (!query || query.length < 2) return [];

  const searchParams = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  const response = await fetch(`/api/geocode?${searchParams.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Place search is unavailable.');

  const payload = await response.json();
  return (Array.isArray(payload.results) ? payload.results : [])
    .filter(item => item.label && item.latLng?.every(Number.isFinite))
    .slice(0, limit);
}

async function searchPlaceInput(value = '') {
  const candidates = await searchPlaceSuggestions(value, 5);
  const best = candidates[0];
  if (!best) return null;
  return { label: best.label, latLng: best.latLng, type: best.type, source: best.source };
}

function nearestPointDistanceKm(point, routePoints = []) {
  if (!routePoints.length) return Infinity;
  return Math.min(...routePoints.map(routePoint => distanceKm(point, routePoint)));
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return '-';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function riskRadiusKm(area = {}) {
  return getAccidentProneAreaRadiusMeters(area) / 1000;
}

function riskSeverity(area = {}) {
  if (area.risk_level === 'Critical') return 'critical';
  if (area.risk_level === 'High') return 'warning';
  return 'moderate';
}

function routeRiskPriority(alert = {}) {
  if (alert.type === 'accident-prone-area' && alert.riskLevel === 'Critical') return 6;
  if (alert.severity === 'critical') return 5;
  if (alert.type === 'accident-prone-area' && alert.riskLevel === 'High') return 4;
  if (alert.severity === 'warning' || alert.severity === 'high') return 3;
  if (alert.severity === 'moderate') return 2;
  return 1;
}

function compareRouteAlertsForAvoidance(first, second) {
  return routeRiskPriority(second) - routeRiskPriority(first)
    || Number(first.distance || 0) - Number(second.distance || 0)
    || Number(first.approach || 0) - Number(second.approach || 0);
}

function routeSafetyProfile(route, alerts = [], baseRoute = null) {
  const criticalRiskAreas = alerts.filter(alert => alert.type === 'accident-prone-area' && alert.riskLevel === 'Critical').length;
  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical').length;
  const highRiskAreas = alerts.filter(alert => alert.type === 'accident-prone-area' && alert.riskLevel === 'High').length;
  const warningAlerts = alerts.filter(alert => alert.severity === 'warning' || alert.severity === 'high').length;
  const moderateAlerts = alerts.filter(alert => alert.severity === 'moderate').length;
  const safetyScore = alerts.reduce((total, alert) => {
    const hierarchyPenalty = routeRiskPriority(alert) * 100;
    const proximityPenalty = Math.max(0, 1 - Number(alert.distance || 0)) * 10;
    const riskScorePenalty = Number(alert.riskScore || 0);
    return total + hierarchyPenalty + proximityPenalty + riskScorePenalty;
  }, 0);

  return {
    criticalRiskAreas,
    criticalAlerts,
    highRiskAreas,
    warningAlerts,
    moderateAlerts,
    totalAlerts: alerts.length,
    safetyScore: Math.round(safetyScore * 10) / 10,
    distanceKm: route?.distanceKm || 0,
    durationMinutes: route?.durationMinutes || 0,
    extraDistanceKm: Math.max(0, (route?.distanceKm || 0) - (baseRoute?.distanceKm || 0)),
    extraDurationMinutes: Math.max(0, (route?.durationMinutes || 0) - (baseRoute?.durationMinutes || 0)),
  };
}

function compareRouteProfiles(first, second) {
  return first.criticalRiskAreas - second.criticalRiskAreas
    || first.criticalAlerts - second.criticalAlerts
    || first.highRiskAreas - second.highRiskAreas
    || first.warningAlerts - second.warningAlerts
    || first.moderateAlerts - second.moderateAlerts
    || first.totalAlerts - second.totalAlerts
    || first.safetyScore - second.safetyScore
    || first.extraDistanceKm - second.extraDistanceKm
    || first.extraDurationMinutes - second.extraDurationMinutes;
}

function routeProfileSummary(profile = {}) {
  return `${profile.criticalRiskAreas} critical risk area${profile.criticalRiskAreas === 1 ? '' : 's'}, ${profile.highRiskAreas} high risk area${profile.highRiskAreas === 1 ? '' : 's'}, ${profile.totalAlerts} total alert${profile.totalAlerts === 1 ? '' : 's'}`;
}

function naturalInstruction(instruction = '') {
  const text = String(instruction || '')
    .replaceAll('_', ' ')
    .replace(/\bturn\b/i, 'Turn')
    .replace(/\bcontinue\b/i, 'Continue')
    .replace(/\bdepart\b/i, 'Start')
    .replace(/\barrive\b/i, 'You have arrived')
    .replace(/\bon road\b/i, 'on this road')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return 'Continue along the route.';
  return text.endsWith('.') ? text : `${text}.`;
}

function routeReadyMessage(routePlan, alertsCount) {
  const distance = Math.round(routePlan.distanceKm * 10) / 10;
  const alertText = alertsCount
    ? `${alertsCount} safety warning${alertsCount === 1 ? '' : 's'} along the way`
    : 'no safety warnings along this route';
  return `Route is ready. It is about ${distance} kilometers and should take around ${routePlan.durationMinutes} minutes. I found ${alertText}.`;
}

function approachingAlertMessage(alert) {
  const label = alert?.label || 'Safety warning';
  const description = alert?.description ? ` ${alert.description}` : '';
  return `Heads up. ${label} ahead.${description}`;
}

function pointVoiceKey(point) {
  if (!point?.latLng) return point?.label || '';
  if (point.label === 'Current GPS location') return point.label;
  const [lat, lng] = point.latLng.map(value => Number(value).toFixed(4));
  return `${point.label || 'point'}:${lat},${lng}`;
}

function describePinnedLocation(latLng, kind, searchOptions = []) {
  const nearby = searchOptions
    .map(item => ({ ...item, distance: distanceKm(latLng, item.latLng) }))
    .filter(item => Number.isFinite(item.distance))
    .sort((first, second) => first.distance - second.distance)[0];

  if (nearby?.distance <= 0.35) {
    return `${kind === 'start' ? 'Start' : 'Destination'} near ${nearby.label}`;
  }

  if (nearby?.distance <= 1.5) {
    return `${kind === 'start' ? 'Start' : 'Destination'} around ${nearby.label}`;
  }

  return kind === 'start' ? 'Pinned start location' : 'Pinned destination';
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

function normalizeOsrmRoute(route, provider = 'OSRM road route') {
  return {
    positions: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    provider,
    steps: (route.legs || []).flatMap(leg => (leg.steps || []).map(step => ({
      instruction: step.maneuver?.modifier
        ? `${step.maneuver.type} ${step.maneuver.modifier} on ${step.name || 'road'}`
        : `${step.maneuver?.type || 'Continue'} on ${step.name || 'road'}`,
      distance: step.distance,
      latLng: step.maneuver?.location ? [step.maneuver.location[1], step.maneuver.location[0]] : null,
    }))).slice(0, 64),
  };
}

async function fetchRouteOptions(start, destination, provider = 'OSRM road route') {
  const waypoints = (start.waypoints || destination.waypoints || []);
  const coords = [
    `${start.latLng[1]},${start.latLng[0]}`,
    ...waypoints.map(w => `${w[1]},${w[0]}`),
    `${destination.latLng[1]},${destination.latLng[0]}`,
  ].join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Routing service unavailable.');
  const payload = await response.json();
  const routes = (payload.routes || []).filter(route => route?.geometry?.coordinates?.length);
  if (!routes.length) throw new Error('No route found.');

  return routes.map(route => normalizeOsrmRoute(route, provider));
}

async function fetchRoute(start, destination) {
  return (await fetchRouteOptions(start, destination))[0];
}

function buildRouteAlerts({ incidents, hazardZones, accidentProneAreas, routePoints, currentLocation }) {
  const incidentAlerts = incidents
    .map(item => {
      const latLng = getIncidentLatLng(item);
      const distance = nearestPointDistanceKm(latLng, routePoints);
      const approach = currentLocation ? distanceKm(currentLocation, latLng) : distance;
      return {
        id: item.id,
        label: item.title || `${item.type || 'Incident'} alert`,
        type: item.type || 'incident',
        severity: item.severity || 'moderate',
        latLng,
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
        latLng: zonePoint,
        distance,
        approach,
        description: zone.description || 'Hazard zone near this route.',
      };
    })
    .filter(item => item.distance <= 0.8);

  const accidentProneAlerts = accidentProneAreas
    .map(area => {
      const latLng = [Number(area.latitude), Number(area.longitude)];
      const centerDistance = nearestPointDistanceKm(latLng, routePoints);
      const routeDistance = Math.max(0, centerDistance - riskRadiusKm(area));
      const approach = currentLocation ? distanceKm(currentLocation, latLng) : routeDistance;
      return {
        id: area.area_id,
        label: `${formatRiskLevel(area.risk_level)}: ${area.barangay}`,
        type: 'accident-prone-area',
        severity: riskSeverity(area),
        riskLevel: area.risk_level,
        riskScore: area.total_risk_score,
        riskRadiusKm: riskRadiusKm(area),
        latLng,
        distance: routeDistance,
        approach,
        description: `${area.most_common_incident_type || 'Road incident'} risk area near this route. Slow down and stay alert.`,
      };
    })
    .filter(item => item.latLng.every(Number.isFinite))
    .filter(item => item.distance <= 0.12);

  return [...incidentAlerts, ...zoneAlerts, ...accidentProneAlerts]
    .sort(compareRouteAlertsForAvoidance)
    .slice(0, 12);
}

function routeDirectnessRatio(route, directDistanceKm) {
  if (!route?.distanceKm || !Number.isFinite(directDistanceKm) || directDistanceKm <= 0) return Infinity;
  return route.distanceKm / directDistanceKm;
}

function hasBacktrackSpur(route, startPoint, destinationPoint) {
  const positions = route?.positions || [];
  if (positions.length < 6 || !startPoint?.latLng || !destinationPoint?.latLng) return false;

  const totalDirect = distanceKm(startPoint.latLng, destinationPoint.latLng);
  if (!Number.isFinite(totalDirect) || totalDirect <= 0) return false;
  let previousProgress = -Infinity;
  let backtrackCount = 0;

  for (const point of positions) {
    const fromStart = distanceKm(startPoint.latLng, point);
    const toDestination = distanceKm(point, destinationPoint.latLng);
    const progress = fromStart - toDestination;
    if (previousProgress - progress > Math.max(0.18, totalDirect * 0.08)) {
      backtrackCount += 1;
    }
    previousProgress = Math.max(previousProgress, progress);
  }

  return backtrackCount >= 2;
}

function isPracticalRoute(route, startPoint, destinationPoint, baseRoute) {
  const directDistance = distanceKm(startPoint.latLng, destinationPoint.latLng);
  const baseDistance = baseRoute?.distanceKm || directDistance;
  if (routeDirectnessRatio(route, directDistance) > 2.6) return false;
  if (route.distanceKm > Math.max(baseDistance * 1.65, baseDistance + 4)) return false;
  if (hasBacktrackSpur(route, startPoint, destinationPoint)) return false;
  return true;
}

export default function PublicMap() {
  const geolocation = useGeolocation();
  const [incidents, setIncidents] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [hazardZones, setHazardZones] = useState([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [pinMode, setPinMode] = useState(null);
  const [start, setStart] = useState(null);
  const [destination, setDestination] = useState(null);
  const [startInput, setStartInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [focusedLocation, setFocusedLocation] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [routePlan, setRoutePlan] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const [muted, setMuted] = useState(navVoice.isMuted());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showModerateRisk, setShowModerateRisk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [routeError, setRouteError] = useState('');
  const spokenRouteKeyRef = useRef('');
  const spokenAlertIdsRef = useRef(new Set());
  const lastRouteAlertIdsRef = useRef([]);
  const [avoidancePrompt, setAvoidancePrompt] = useState(null);
  const [continuedAlertIds, setContinuedAlertIds] = useState([]);
  const [safetyRouteWaypoint, setSafetyRouteWaypoint] = useState(null);
  const [safetyRouteSourceId, setSafetyRouteSourceId] = useState('');
  const [pendingSaferRoute, setPendingSaferRoute] = useState(null);
  const currentLocationRef = useRef(null);
  const destinationRef = useRef(null);
  const routePlanRef = useRef(null);
  const navigationActiveRef = useRef(false);
  const offRouteCountRef = useRef(0);
  const isReroutingRef = useRef(false);
  const lastRerouteAtRef = useRef(0);
  const routeRequestSequenceRef = useRef(0);
  const routeEndpointsKeyRef = useRef('');

  destinationRef.current = destination;
  routePlanRef.current = routePlan;
  navigationActiveRef.current = navigationActive;

  const recalculateRoute = useCallback(async (origin, selectedDestination, options = {}) => {
    if (!origin?.latLng?.every(Number.isFinite) || !selectedDestination?.latLng?.every(Number.isFinite)) {
      return false;
    }

    const {
      automatic = false,
      fallbackOnError = false,
      provider = 'OSRM road route',
      waypoints = [],
    } = options;
    const requestId = ++routeRequestSequenceRef.current;
    const routedOrigin = waypoints.length ? { ...origin, waypoints } : origin;

    if (automatic) {
      isReroutingRef.current = true;
      lastRerouteAtRef.current = Date.now();
    }
    setRouteLoading(true);
    if (!automatic) setRouteError('');

    try {
      const nextRoute = await fetchRoute(routedOrigin, selectedDestination);
      if (requestId !== routeRequestSequenceRef.current) return false;

      const resolvedRoute = provider === 'OSRM road route'
        ? nextRoute
        : { ...nextRoute, provider };
      routePlanRef.current = resolvedRoute;
      routeEndpointsKeyRef.current = `${origin.latLng.join(',')}>${selectedDestination.latLng.join(',')}`;
      offRouteCountRef.current = 0;
      setRoutePlan(resolvedRoute);
      setCurrentStepIndex(0);
      setPendingSaferRoute(null);

      if (automatic) {
        setStart(origin);
        setStartInput(origin.label);
        setSafetyRouteWaypoint(null);
        setSafetyRouteSourceId('');
        setAvoidancePrompt(null);
        setContinuedAlertIds([]);
        lastRouteAlertIdsRef.current = [];
        setRouteError('Route updated automatically from your latest GPS location.');
      }
      return true;
    } catch (requestError) {
      if (requestId !== routeRequestSequenceRef.current) return false;

      if (fallbackOnError) {
        const directRoute = fallbackRoute(origin, selectedDestination);
        routePlanRef.current = directRoute;
        routeEndpointsKeyRef.current = `${origin.latLng.join(',')}>${selectedDestination.latLng.join(',')}`;
        setRoutePlan(directRoute);
        setPendingSaferRoute(null);
        setRouteError(`${requestError.message || 'Routing service unavailable.'} Showing direct safety route.`);
      } else if (automatic) {
        setRouteError(`${requestError.message || 'Automatic rerouting is temporarily unavailable.'} Keeping the last route and continuing GPS tracking.`);
      } else {
        setRouteError(requestError.message || 'Routing service unavailable. Keeping the last route.');
      }
      return false;
    } finally {
      if (requestId === routeRequestSequenceRef.current) setRouteLoading(false);
      if (automatic) isReroutingRef.current = false;
    }
  }, []);

  const loadMap = async () => {
    setLoading(true);
    setError('');
    try {
      const [publicIncidents, zones, activeAdvisories] = await Promise.all([
        loadPublicAccidentIncidents({ officialLimit: 500, scrapedLimit: 200, pcrLimit: 200 }),
        listPublicHazardZones({ limit: 100 }),
        listPublishedAdvisories({ limit: 100 }),
      ]);
      setIncidents(publicIncidents.filter(hasValidLatLng));
      setAdvisories(activeAdvisories.filter(item => item.coordinates));
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, () => loadMap())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pcr_reports' }, () => loadMap())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hazard_zones' }, () => loadMap())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'public_advisories' }, () => loadMap())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    navVoice.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    const location = normalizeBrowserPosition(geolocation.position);
    if (!location) return;

    currentLocationRef.current = location;
    setCurrentLocation(location.latLng);

    if (!navigationActiveRef.current || !destinationRef.current) return;
    const activeRoute = routePlanRef.current?.positions || [];
    if (activeRoute.length < 2) return;

    offRouteCountRef.current = getNextOffRouteConfirmationCount(
      offRouteCountRef.current,
      location,
      activeRoute,
    );
    if (!canStartAutomaticReroute({
      navigationActive: navigationActiveRef.current,
      hasDestination: Boolean(destinationRef.current),
      routeCoordinates: activeRoute,
      offRouteCount: offRouteCountRef.current,
      isRerouting: isReroutingRef.current,
      lastRerouteAt: lastRerouteAtRef.current,
    })) return;

    offRouteCountRef.current = 0;
    const latestDestination = destinationRef.current;
    void recalculateRoute(
      { label: 'Current GPS location', latLng: location.latLng },
      latestDestination,
      { automatic: true },
    );
  }, [geolocation.position, recalculateRoute]);

  useEffect(() => {
    if (navigationActive || !start?.latLng || !destination?.latLng) return;
    const routeKey = `${start.latLng.join(',')}>${destination.latLng.join(',')}`;
    if (routeEndpointsKeyRef.current === routeKey) return;
    void recalculateRoute(start, destination, { fallbackOnError: true });
  }, [destination, navigationActive, recalculateRoute, start]);

  useEffect(() => () => {
    navigationActiveRef.current = false;
    routeRequestSequenceRef.current += 1;
    offRouteCountRef.current = 0;
    isReroutingRef.current = false;
  }, []);



  const activeIncidents = useMemo(() => incidents.filter(item => !isIncidentCompleted(item.status)), [incidents]);
  const publicRiskAreas = useMemo(() => {
    const areas = calculateAccidentProneAreas(incidents, { publicOnly: true });
    return showModerateRisk ? areas : areas.filter(area => ['High', 'Critical'].includes(area.risk_level));
  }, [incidents, showModerateRisk]);
  const selectedIncident = incidents.find(item => item.id === selectedIncidentId);
  const routePoints = useMemo(() => routePlan?.positions || [], [routePlan]);
  const routeAlerts = useMemo(
    () => buildRouteAlerts({ incidents: activeIncidents, hazardZones, accidentProneAreas: publicRiskAreas, routePoints, currentLocation }),
    [activeIncidents, currentLocation, hazardZones, publicRiskAreas, routePoints]
  );

  // Announce when a route is calculated
  useEffect(() => {
    if (!routePlan) return;
    const routeVoiceKey = `${pointVoiceKey(start)}>${pointVoiceKey(destination)}`;
    if (spokenRouteKeyRef.current === routeVoiceKey) return;
    spokenRouteKeyRef.current = routeVoiceKey;
    spokenAlertIdsRef.current = new Set();
    const alertsCount = routeAlerts.length || 0;
    navVoice.speak(routeReadyMessage(routePlan, alertsCount), { interrupt: false });
  }, [destination, routeAlerts.length, routePlan, start]);

  // Advance turn-by-turn based on current GPS location
  useEffect(() => {
    if (!navigationActive || !routePlan || !currentLocation) return undefined;
    const steps = routePlan.steps || [];
    if (!steps.length) return undefined;

    const nearestIndex = steps.reduce((best, step, idx) => {
      if (!step.latLng) return best;
      const d = distanceKm(currentLocation, step.latLng);
      if (d < best.dist) return { idx, dist: d };
      return best;
    }, { idx: 0, dist: Infinity });

    const nextIndex = Math.max(0, nearestIndex.idx);
    if (nextIndex !== currentStepIndex) {
      setCurrentStepIndex(nextIndex);
      const instruction = naturalInstruction(steps[nextIndex]?.instruction || 'Continue on your route.');
      navVoice.speak(instruction);
    }

    // speak alert warnings only inside 100 meters
    if (routeAlerts && routeAlerts.length) {
      const approaching = routeAlerts.find(a => a.approach <= ALERT_VOICE_DISTANCE_KM);
      const approachingId = approaching ? `${approaching.type}:${approaching.id}` : '';
      if (approaching && !spokenAlertIdsRef.current.has(approachingId)) {
        navVoice.speak(approachingAlertMessage(approaching));
        spokenAlertIdsRef.current.add(approachingId);
      }
    }

    return undefined;
  }, [navigationActive, currentLocation, routeAlerts, routePlan, currentStepIndex]);

  useEffect(() => {
    if (!routePlan || !start || !destination) return;
    const alerts = buildRouteAlerts({
      incidents: incidents.filter(item => !isIncidentCompleted(item.status)),
      hazardZones,
      accidentProneAreas: publicRiskAreas,
      routePoints,
      currentLocation,
    });
    const alertIds = alerts.map(a => `${a.type}:${a.id}`);
    const newAlerts = alertIds.filter(id => !lastRouteAlertIdsRef.current.includes(id));
    if (newAlerts.length && alerts.length && !avoidancePrompt && !pendingSaferRoute) {
      const first = alerts.find(a => `${a.type}:${a.id}` === newAlerts[0]);
      const firstId = first ? `${first.type}:${first.id}` : '';
      if (first && first.distance <= 0.6 && firstId !== safetyRouteSourceId && !continuedAlertIds.includes(firstId)) {
        setAvoidancePrompt(first);
      }
    }
    lastRouteAlertIdsRef.current = alertIds;
  }, [incidents, routePlan, start, destination, hazardZones, publicRiskAreas, routePoints, currentLocation, avoidancePrompt, pendingSaferRoute, continuedAlertIds, safetyRouteSourceId]);

  function offsetPoint(point, side, offsetMeters) {
    const offsetDegLat = offsetMeters / 111320;
    const offsetDegLon = offsetMeters / (40075000 * Math.cos(point[0] * Math.PI / 180) / 360);
    return [
      point[0] + side * offsetDegLat,
      point[1] - side * offsetDegLon,
    ];
  }

  function computeAvoidanceWaypointSets(routePts = [], alert) {
    if (!routePts.length || !alert) return null;
    const alertPoint = alert.latLng || null;
    const alertLatLng = alertPoint || null;
    if (!alertLatLng) return null;
    let best = { idx: -1, dist: Infinity };
    routePts.forEach((pt, idx) => {
      const d = distanceKm(alertLatLng, pt);
      if (d < best.dist) best = { idx, dist: d };
    });
    if (best.idx < 0) return null;
    const idx = best.idx;
    const pt = routePts[idx];
    const before = routePts[Math.max(0, idx - 10)] || pt;
    const after = routePts[Math.min(routePts.length - 1, idx + 10)] || pt;
    const next = routePts[Math.min(routePts.length - 1, idx + 3)] || pt;
    const lat1 = pt[0] * (Math.PI / 180);
    const lon1 = pt[1] * (Math.PI / 180);
    const lat2 = next[0] * (Math.PI / 180);
    const lon2 = next[1] * (Math.PI / 180);
    const heading = Math.atan2(Math.sin(lon2 - lon1) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1));
    const sideHint = Math.sign(Math.sin(heading)) || 1;
    const baseClearanceMeters = Math.max(250, Math.ceil(Number(alert.riskRadiusKm || 0.12) * 1000) + 220);
    const offsets = alert.type === 'accident-prone-area' && alert.riskLevel === 'Critical'
      ? [baseClearanceMeters, baseClearanceMeters + 350, baseClearanceMeters + 700, baseClearanceMeters + 1100, baseClearanceMeters + 1600]
      : [250, 400, 650, 900, 1200];
    const candidates = [];
    offsets.forEach(offsetMeters => {
      [sideHint, -sideHint].forEach(side => {
        candidates.push({
          label: `${offsetMeters}m side road`,
          waypoints: [offsetPoint(pt, side, offsetMeters)],
        });
        candidates.push({
          label: `${offsetMeters}m barangay bypass`,
          waypoints: [
            offsetPoint(before, side, offsetMeters),
            offsetPoint(after, side, offsetMeters),
          ],
        });
      });
    });
    return candidates;
  }
  const searchableLocations = useMemo(() => {
    const options = [
      ...quickDestinations.map(item => ({ ...item, type: 'Place' })),
    ].filter(item => item.label && item.latLng?.every(Number.isFinite));

    return [...new Map(options.map(item => [item.label.toLowerCase(), item])).values()];
  }, []);
  const nearestRisks = useMemo(
    () => [...activeIncidents]
      .map(item => ({ ...item, distance: distanceKm(currentLocation || ECHAGUE_CENTER, getIncidentLatLng(item)) }))
      .sort((first, second) => first.distance - second.distance)
      .slice(0, 6),
    [activeIncidents, currentLocation]
  );
  const route = routePlan
    ? [
      {
        id: 'planned-route',
        label: `${start?.label || 'Point A'} to ${destination?.label || 'Point B'}`,
        positions: routePlan.positions,
        color: routeAlerts.some(alert => alert.severity === 'critical') ? '#dc2626' : '#2563eb',
        weight: 6,
      },
      pendingSaferRoute && {
        id: 'proposed-safer-route',
        label: pendingSaferRoute.improved ? 'Proposed safer route' : 'Proposed alternate route',
        positions: pendingSaferRoute.route.positions,
        color: '#16a34a',
        weight: 5,
        opacity: 0.78,
        dashArray: '8 8',
      },
    ].filter(Boolean)
    : [];

  const recalculateForDestinationChange = (nextDestination) => {
    destinationRef.current = nextDestination;
    const latestLocation = currentLocationRef.current;
    if (!navigationActiveRef.current || !latestLocation) return;

    const gpsStart = { label: 'Current GPS location', latLng: latestLocation.latLng };
    offRouteCountRef.current = 0;
    setStart(gpsStart);
    setStartInput(gpsStart.label);
    void recalculateRoute(gpsStart, nextDestination, { fallbackOnError: true });
  };

  const setPointFromInput = async (kind) => {
    const inputValue = kind === 'start' ? startInput : destinationInput;
    const existingPoint = kind === 'start' ? start : destination;
    let parsed = existingPoint?.label === inputValue.trim()
      ? existingPoint
      : parsePointInput(inputValue, searchableLocations);

    if (!parsed && inputValue.trim()) {
      setRouteError('Searching for that location...');
      try {
        parsed = await searchPlaceInput(inputValue);
      } catch (searchError) {
        setRouteError(searchError.message || 'Place search is unavailable. Use Pin to choose the place on the map.');
        return;
      }
    }

    if (!parsed) {
      setRouteError('Location not found. Try a nearby landmark, or use Pin to choose the place on the map.');
      return;
    }
    if (kind === 'start') {
      setStart(parsed);
      setStartInput(parsed.label);
    } else {
      setDestination(parsed);
      setDestinationInput(parsed.label);
      recalculateForDestinationChange(parsed);
    }
    setSafetyRouteWaypoint(null);
    setSafetyRouteSourceId('');
    setPendingSaferRoute(null);
    setAvoidancePrompt(null);
    setContinuedAlertIds([]);
    lastRouteAlertIdsRef.current = [];
    setFocusedLocation(parsed);
    setRouteError('');
  };

  const selectRoutePoint = (kind, item) => {
    const point = { label: item.label, latLng: item.latLng, type: item.type, source: item.source };
    if (kind === 'start') {
      setStart(point);
      setStartInput(point.label);
    } else {
      setDestination(point);
      setDestinationInput(point.label);
      recalculateForDestinationChange(point);
    }
    setSafetyRouteWaypoint(null);
    setSafetyRouteSourceId('');
    setPendingSaferRoute(null);
    setAvoidancePrompt(null);
    setContinuedAlertIds([]);
    lastRouteAlertIdsRef.current = [];
    setFocusedLocation(point);
    setRouteError('');
  };

  const useGpsStart = () => {
    if (!currentLocation) {
      setRouteError('Allow location access to use GPS as Point A.');
      return;
    }
    setStart({ label: 'Current GPS location', latLng: currentLocation });
    setStartInput('Current GPS location');
    setSafetyRouteWaypoint(null);
    setSafetyRouteSourceId('');
    setPendingSaferRoute(null);
    setAvoidancePrompt(null);
    setContinuedAlertIds([]);
    lastRouteAlertIdsRef.current = [];
    setFocusedLocation({ label: 'Current GPS location', latLng: currentLocation });
    setRouteError('');
  };

  const handleMapClick = (latlng) => {
    if (!pinMode) return;
    const latLng = [latlng.lat, latlng.lng];
    const label = describePinnedLocation(latLng, pinMode, searchableLocations);
    const point = { label, latLng };
    if (pinMode === 'start') {
      setStart(point);
      setStartInput(label);
    } else {
      setDestination(point);
      setDestinationInput(label);
      setPendingSaferRoute(null);
      recalculateForDestinationChange(point);
    }
    if (pinMode === 'start') setPendingSaferRoute(null);
    setFocusedLocation(point);
    setPinMode(null);
    setRouteError('');
  };

  const clearRoute = () => {
    navigationActiveRef.current = false;
    destinationRef.current = null;
    routeRequestSequenceRef.current += 1;
    routePlanRef.current = null;
    routeEndpointsKeyRef.current = '';
    offRouteCountRef.current = 0;
    isReroutingRef.current = false;
    lastRerouteAtRef.current = 0;
    setNavigationActive(false);
    setRouteLoading(false);
    setStart(null);
    setDestination(null);
    setRoutePlan(null);
    setStartInput('');
    setDestinationInput('');
    setFocusedLocation(null);
    setSafetyRouteWaypoint(null);
    setSafetyRouteSourceId('');
    setAvoidancePrompt(null);
    setContinuedAlertIds([]);
    lastRouteAlertIdsRef.current = [];
    setRouteError('');
  };

  const toggleNavigation = () => {
    if (navigationActiveRef.current) {
      navigationActiveRef.current = false;
      routeRequestSequenceRef.current += 1;
      if (start?.latLng && destinationRef.current?.latLng) {
        routeEndpointsKeyRef.current = `${start.latLng.join(',')}>${destinationRef.current.latLng.join(',')}`;
      }
      offRouteCountRef.current = 0;
      isReroutingRef.current = false;
      setNavigationActive(false);
      setRouteLoading(false);
      window.speechSynthesis?.cancel();
      return;
    }

    const latestLocation = currentLocationRef.current;
    if (!destinationRef.current) {
      setRouteError('Select a destination before starting navigation.');
      return;
    }
    if (!latestLocation) {
      setRouteError('Allow location access and wait for a GPS fix before starting navigation.');
      return;
    }

    const gpsStart = { label: 'Current GPS location', latLng: latestLocation.latLng };
    navigationActiveRef.current = true;
    offRouteCountRef.current = 0;
    lastRerouteAtRef.current = 0;
    setStart(gpsStart);
    setStartInput(gpsStart.label);
    setNavigationActive(true);
    void recalculateRoute(gpsStart, destinationRef.current, { fallbackOnError: true });
  };

  const continueRiskRoute = () => {
    if (!avoidancePrompt) return;
    const alertId = `${avoidancePrompt.type}:${avoidancePrompt.id}`;
    setContinuedAlertIds(current => [...new Set([...current, alertId])]);
    setAvoidancePrompt(null);
    setPendingSaferRoute(null);
    setRouteError('Continuing on the current route. Safety alerts will remain visible.');
  };

  const requestSaferRoute = async () => {
    if (!avoidancePrompt) return;
    const latestLocation = currentLocationRef.current;
    const routingStart = navigationActiveRef.current && latestLocation
      ? { label: 'Current GPS location', latLng: latestLocation.latLng }
      : start;
    if (!routingStart?.latLng || !destination?.latLng) return;
    const detourCandidates = computeAvoidanceWaypointSets(routePoints, avoidancePrompt);
    if (!detourCandidates?.length) {
      setRouteError('Unable to build a safer route around this alert. You can continue carefully or choose a different destination.');
      return;
    }
    const alertId = `${avoidancePrompt.type}:${avoidancePrompt.id}`;
    setRouteError('Finding a safer route around the selected risk area...');
    navVoice.speak('Finding a safer route around the safety warning.');
    setRouteLoading(true);
    const requestId = ++routeRequestSequenceRef.current;

    try {
      const currentAlerts = routeAlerts;
      const baseAlternatives = await fetchRouteOptions(routingStart, destination, 'Alternative road route')
        .then(routes => routes.slice(1)
          .filter(route => isPracticalRoute(route, routingStart, destination, routePlan))
          .map((route, index) => ({
            route,
            waypoints: [],
            alerts: buildRouteAlerts({
              incidents: activeIncidents,
              hazardZones,
              accidentProneAreas: publicRiskAreas,
              routePoints: route.positions,
              currentLocation,
            }),
            label: `OSRM alternative ${index + 1}`,
          })))
        .catch(() => []);

      const detourRoutes = await Promise.all(detourCandidates.map(async candidate => {
        try {
          const routeOptions = await fetchRouteOptions({ ...routingStart, waypoints: candidate.waypoints }, destination, 'Barangay/local-road detour');
          return routeOptions
            .filter(route => isPracticalRoute(route, routingStart, destination, routePlan))
            .map(route => ({
              ...candidate,
              route,
              alerts: buildRouteAlerts({
                incidents: activeIncidents,
                hazardZones,
                accidentProneAreas: publicRiskAreas,
                routePoints: route.positions,
                currentLocation,
              }),
            }));
        } catch {
          return [];
        }
      }));

      const currentProfile = routeSafetyProfile(routePlan, currentAlerts, routePlan);
      const scoredCandidates = [...baseAlternatives, ...detourRoutes.flat()]
        .map(candidate => ({
          ...candidate,
          profile: routeSafetyProfile(candidate.route, candidate.alerts, routePlan),
        }));
      const best = scoredCandidates
        .sort((first, second) => compareRouteProfiles(first.profile, second.profile))[0];

      if (requestId !== routeRequestSequenceRef.current) return;

      if (!best) {
        setContinuedAlertIds(current => [...new Set([...current, alertId])]);
        setAvoidancePrompt(null);
        setRouteError('No practical direct alternate road was found. The current route is the most direct available route, so continue carefully or choose another destination.');
        navVoice.speak('No practical direct alternate road was found. Please continue carefully or choose another destination.');
        return;
      }

      const improved = compareRouteProfiles(best.profile, currentProfile) < 0;
      setAvoidancePrompt(null);
      const saferRoute = {
        ...best.route,
        provider: improved ? 'Proposed safer route' : 'Best available alternate route',
      };
      setPendingSaferRoute({
        route: saferRoute,
        alerts: best.alerts,
        waypoints: best.waypoints || [],
        sourceAlertId: alertId,
        currentProfile,
        proposedProfile: best.profile,
        improved,
      });
      setRouteError(
        improved
          ? 'Safer route found. Review the comparison, then accept the safer route or retain the first route.'
          : 'An alternate route was found, but it does not improve the safety hierarchy. Review it before changing routes.'
      );
      navVoice.speak(improved ? 'Safer route found. Please review before accepting.' : 'An alternate route was found, but the current route may still be best.');
    } finally {
      if (requestId === routeRequestSequenceRef.current) setRouteLoading(false);
    }
  };

  const acceptSaferRoute = () => {
    if (!pendingSaferRoute) return;
    const nextRoute = {
      ...pendingSaferRoute.route,
      provider: pendingSaferRoute.improved ? 'Safer road route' : 'Accepted alternate route',
    };
    setSafetyRouteWaypoint(pendingSaferRoute.waypoints || []);
    setSafetyRouteSourceId(pendingSaferRoute.sourceAlertId || '');
    lastRouteAlertIdsRef.current = pendingSaferRoute.alerts.map(alert => `${alert.type}:${alert.id}`);
    routePlanRef.current = nextRoute;
    routeEndpointsKeyRef.current = `${(currentLocationRef.current?.latLng || start?.latLng || []).join(',')}>${destination?.latLng?.join(',')}`;
    offRouteCountRef.current = 0;
    setRoutePlan(nextRoute);
    setPendingSaferRoute(null);
    setRouteError(`Safer route accepted. ${pendingSaferRoute.alerts.length} safety alert${pendingSaferRoute.alerts.length === 1 ? '' : 's'} remain near this route.`);
    navVoice.speak('Safer route accepted.');
  };

  const retainFirstRoute = () => {
    const sourceAlertId = pendingSaferRoute?.sourceAlertId || (avoidancePrompt ? `${avoidancePrompt.type}:${avoidancePrompt.id}` : '');
    if (sourceAlertId) {
      setContinuedAlertIds(current => [...new Set([...current, sourceAlertId])]);
    }
    setPendingSaferRoute(null);
    setAvoidancePrompt(null);
    setRouteError('Retained the first route. Safety alerts will remain visible for caution.');
    navVoice.speak('First route retained. Please continue carefully.');
  };

  const approachingAlert = routeAlerts.find(alert => alert.approach <= 0.35);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="relative h-[calc(100vh-4rem)] min-h-[620px] overflow-hidden">
          <LeafletIncidentMap
            height="100%"
            incidents={incidents}
            advisoryMarkers={advisories}
            hazardZones={hazardZones}
            accidentProneAreas={publicRiskAreas}
            publicSafeRiskPopups
            routes={route}
            plannerPoints={{
              current: currentLocation ? { label: 'Current GPS location', latLng: currentLocation } : null,
              start: start?.label === 'Current GPS location' ? null : start,
              destination,
            }}
            focusedLocation={focusedLocation}
            selectedIncidentId={selectedIncidentId || undefined}
            onMarkerClick={setSelectedIncidentId}
            onMapClick={handleMapClick}
            showControls
            showHeatmap={false}
            showDangerZones
            clusterMarkers={false}
            autoFit={!route.length && !selectedIncidentId}
            compact
            scope="isabela"
          />

          <div className="absolute left-3 top-3 z-[500] md:left-4">
            <button onClick={loadMap} className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow-lg backdrop-blur hover:bg-secondary" title="Refresh alerts">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
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

          <div className="absolute bottom-4 left-4 z-[520] max-w-md rounded-xl border border-border bg-card/95 p-3 text-xs shadow-xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="font-semibold text-foreground">Accident-Prone Areas</div>
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showModerateRisk}
                  onChange={event => setShowModerateRisk(event.target.checked)}
                  className="accent-blue-600"
                />
                Show moderate
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(riskStyles).map(([level, style]) => (
                <span key={level} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-1 text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.color }} />
                  {formatRiskLevel(level)}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              Accident-prone areas shown on this map are based on verified incident records and are intended for public safety awareness.
            </p>
          </div>

        </main>

        <aside className="border-l border-border bg-card lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-bold text-foreground">Route Guidance</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{activeIncidents.length} public incident alerts / {publicRiskAreas.length} accident-prone areas / {hazardZones.length} hazard zones</p>
            {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}
          </div>

          <RoutePlanner
            startInput={startInput}
            destinationInput={destinationInput}
            onStartChange={setStartInput}
            onDestinationChange={setDestinationInput}
            onSetStart={() => setPointFromInput('start')}
            onSetDestination={() => setPointFromInput('destination')}
            onUseGpsStart={useGpsStart}
            onClearRoute={clearRoute}
            onPinStart={() => setPinMode(pinMode === 'start' ? null : 'start')}
            onPinDestination={() => setPinMode(pinMode === 'destination' ? null : 'destination')}
            pinMode={pinMode}
            routeError={routeError}
            routeLoading={routeLoading}
            routePlan={routePlan}
            routeAlerts={routeAlerts}
            selectedIncident={selectedIncident}
            searchOptions={searchableLocations}
            onSelectRoutePoint={selectRoutePoint}
            avoidancePrompt={avoidancePrompt}
            onContinueRiskRoute={continueRiskRoute}
            onRequestSaferRoute={requestSaferRoute}
            pendingSaferRoute={pendingSaferRoute}
            onAcceptSaferRoute={acceptSaferRoute}
            onRetainFirstRoute={retainFirstRoute}
            saferRouteActive={Boolean(safetyRouteWaypoint)}
            navigationActive={navigationActive}
            onToggleNavigation={toggleNavigation}
            muted={muted}
            onToggleMute={() => setMuted(m => !m)}
          />

          <div className="grid grid-cols-3 gap-2 border-b border-border p-4">
            <Metric label="Critical" value={routeAlerts.filter(item => item.severity === 'critical').length} />
            <Metric label="Route Alerts" value={routeAlerts.length} />
            <Metric label="Steps" value={routePlan?.steps?.length || 0} />
          </div>

          <Panel title="Active Route Alerts">
            {advisories.map(advisory => (
              <div key={`advisory-${advisory.id}`} className={`rounded-lg border p-3 ${severityTone[advisory.severity] || severityTone.warning}`}>
                <div className="flex items-center gap-2">
                  <Megaphone className="h-3.5 w-3.5" />
                  <span className="text-xs font-bold">{advisory.title}</span>
                </div>
                <p className="mt-1 text-[11px] opacity-80">{advisory.message}</p>
              </div>
            ))}
            {routeAlerts.map(alert => (
              <div key={`${alert.type}-${alert.id}`} className={`rounded-lg border p-3 ${severityTone[alert.severity] || severityTone.moderate}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{alert.label}</span>
                  <span className="text-[10px]">{formatDistance(alert.distance)} off route</span>
                </div>
                <p className="mt-1 text-[11px] opacity-80">{alert.description}</p>
              </div>
            ))}
            {!routeAlerts.length && !advisories.length && <p className="text-xs text-muted-foreground">No active alerts within the route corridor.</p>}
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

function RoutePlanner({
  startInput,
  destinationInput,
  onStartChange,
  onDestinationChange,
  onSetStart,
  onSetDestination,
  onUseGpsStart,
  onClearRoute,
  onPinStart,
  onPinDestination,
  pinMode,
  routeError,
  routeLoading,
  routePlan,
  routeAlerts,
  selectedIncident,
  searchOptions,
  onSelectRoutePoint,
  avoidancePrompt,
  onContinueRiskRoute,
  onRequestSaferRoute,
  pendingSaferRoute,
  onAcceptSaferRoute,
  onRetainFirstRoute,
  saferRouteActive,
  navigationActive,
  onToggleNavigation,
  muted,
  onToggleMute,
}) {
  const [activeSearchId, setActiveSearchId] = useState(null);

  return (
    <section className="border-b border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Live Safety Navigation</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onToggleMute} title={muted ? 'Unmute voice' : 'Mute voice'} className="rounded-md p-2 hover:bg-secondary">
            {muted ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-blue-500" />}
          </button>
          <button onClick={onToggleNavigation} title={navigationActive ? 'Stop navigation' : 'Start navigation'} className={`ml-1 inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold ${navigationActive ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
            {navigationActive ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <RouteInput
          id="public-map-start-search"
          label="Point A"
          value={startInput}
          placeholder="Search start location"
          onChange={onStartChange}
          onApply={onSetStart}
          onPin={onPinStart}
          active={pinMode === 'start'}
          searchOptions={searchOptions}
          searchPlaces={searchPlaceSuggestions}
          onSelect={item => onSelectRoutePoint('start', item)}
          open={activeSearchId === 'start'}
          onOpen={() => setActiveSearchId('start')}
          onClose={() => setActiveSearchId(current => current === 'start' ? null : current)}
        />
        <RouteInput
          id="public-map-destination-search"
          label="Point B"
          value={destinationInput}
          placeholder="Search destination"
          onChange={onDestinationChange}
          onApply={onSetDestination}
          onPin={onPinDestination}
          active={pinMode === 'destination'}
          searchOptions={searchOptions}
          searchPlaces={searchPlaceSuggestions}
          onSelect={item => onSelectRoutePoint('destination', item)}
          open={activeSearchId === 'destination'}
          onOpen={() => setActiveSearchId('destination')}
          onClose={() => setActiveSearchId(current => current === 'destination' ? null : current)}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onUseGpsStart} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
          <LocateFixed className="h-3.5 w-3.5" />
          Use GPS
        </button>
        <button onClick={onClearRoute} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      <div className="mt-3 grid gap-1.5">
        {quickDestinations.map(item => (
          <button
            key={item.label}
            onClick={() => onSelectRoutePoint('destination', { ...item, type: 'Place' })}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-left text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <span className="truncate">{item.label}</span>
            <MapPin className="h-3.5 w-3.5 shrink-0" />
          </button>
        ))}
      </div>

      {pinMode && (
        <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-300">
          Tap the map to pin {pinMode === 'start' ? 'Point A' : 'Point B'}.
        </div>
      )}
      {routeError && <p className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-500">{routeError}</p>}

      {avoidancePrompt && (
        <div className="mt-3 rounded-lg border border-orange-500/40 bg-orange-500/10 p-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-foreground">Safety warning on this route</div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {avoidancePrompt.label} is near or on your route. You can continue with caution or ask ALERT-CIA to find a safer route around it.
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={onContinueRiskRoute} className="rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
              Continue
            </button>
            <button onClick={onRequestSaferRoute} className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-700">
              Safer route
            </button>
          </div>
        </div>
      )}

      {pendingSaferRoute && (
        <div className="mt-3 rounded-lg border border-green-500/40 bg-green-500/10 p-3">
          <div className="flex items-start gap-2">
            <Route className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-foreground">
                {pendingSaferRoute.improved ? 'Safer route available' : 'Alternate route available'}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                The dashed green route is scored by safety hierarchy first: critical risk areas, critical alerts, high risk areas, warning alerts, then route length and time.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-[11px]">
            <div className="rounded-md border border-border bg-background/70 p-2">
              <div className="font-semibold text-foreground">First route</div>
              <div className="mt-0.5 text-muted-foreground">{routeProfileSummary(pendingSaferRoute.currentProfile)}</div>
            </div>
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-2">
              <div className="font-semibold text-green-600 dark:text-green-300">System safer route</div>
              <div className="mt-0.5 text-muted-foreground">
                {routeProfileSummary(pendingSaferRoute.proposedProfile)}
                {pendingSaferRoute.proposedProfile.extraDistanceKm > 0 && ` / +${formatDistance(pendingSaferRoute.proposedProfile.extraDistanceKm)}`}
                {pendingSaferRoute.proposedProfile.extraDurationMinutes > 0 && ` / +${pendingSaferRoute.proposedProfile.extraDurationMinutes} min`}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={onRetainFirstRoute} className="rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
              Retain first route
            </button>
            <button onClick={onAcceptSaferRoute} className="rounded-lg bg-green-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-green-700">
              Accept safer route
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className={`mt-0.5 h-5 w-5 ${routeAlerts.some(alert => alert.severity === 'critical') ? 'text-red-500' : 'text-blue-500'}`} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-foreground">
              {routePlan ? `${routePlan.provider}: ${formatDistance(routePlan.distanceKm)}` : selectedIncident?.title || 'Plan a safe route'}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {routePlan
                ? `${routePlan.durationMinutes} min estimate. ${routeAlerts.length} safety alert${routeAlerts.length === 1 ? '' : 's'} near this route.${saferRouteActive ? ' Safer routing is active.' : ''}`
                : 'Search by place name, choose a suggestion, use GPS, or pin Point A and Point B on the map.'}
            </p>
            {routeLoading && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-500">
                <Clock className="h-3.5 w-3.5 animate-pulse" />
                Generating route
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RouteInput({
  id,
  label,
  value,
  placeholder,
  onChange,
  onApply,
  onPin,
  active,
  searchOptions,
  searchPlaces,
  onSelect,
  open,
  onOpen,
  onClose,
}) {
  const [suggestions, setSuggestions] = useState(searchOptions);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const trimmedValue = value.trim();

  useEffect(() => {
    const localMatches = searchOptions.filter(item => item.label.toLowerCase().includes(trimmedValue.toLowerCase()));
    if (trimmedValue.length < 2) {
      setSuggestions(searchOptions.slice(0, 6));
      setLoading(false);
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const remoteMatches = await searchPlaces(trimmedValue, 7);
        if (requestIdRef.current !== requestId) return;
        const combined = [...localMatches, ...remoteMatches]
          .filter(item => item.label && item.latLng?.every(Number.isFinite));
        setSuggestions([...new Map(combined.map(item => [item.label.toLowerCase(), item])).values()].slice(0, 8));
      } catch {
        if (requestIdRef.current === requestId) setSuggestions(localMatches.slice(0, 6));
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchOptions, searchPlaces, trimmedValue]);

  const chooseSuggestion = (item) => {
    onChange(item.label);
    onSelect(item);
    onClose();
  };

  const applyValue = () => {
    onClose();
    onApply();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</label>
        <button onClick={onPin} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${active ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`} title={`Pin ${label} on map`}>
          <Crosshair className="h-3.5 w-3.5" />
          Pin
        </button>
      </div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            id={id}
            value={value}
            onChange={event => {
              onChange(event.target.value);
              onOpen();
            }}
            onFocus={onOpen}
            onBlur={() => window.setTimeout(onClose, 120)}
            onKeyDown={event => {
              if (event.key === 'Enter') applyValue();
              if (event.key === 'Escape') onClose();
            }}
            placeholder={placeholder}
            className="h-10 w-full min-w-0 rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none focus:border-blue-500"
          />
          {open && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-[700] max-h-44 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-2xl">
              {loading && <div className="px-3 py-2 text-[11px] text-muted-foreground">Searching map locations...</div>}
              {!loading && suggestions.map(item => (
                <button
                  key={`${id}-${item.id || item.label}`}
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => chooseSuggestion(item)}
                  className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-secondary"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground">{item.label}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{item.source || 'Saved place'}{item.type ? ` - ${item.type}` : ''}</span>
                  </span>
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                </button>
              ))}
              {!loading && trimmedValue.length >= 2 && !suggestions.length && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">No matching map locations found.</div>
              )}
            </div>
          )}
        </div>
        <button onClick={applyValue} className="h-10 rounded-lg bg-secondary px-3 text-xs font-semibold text-foreground hover:bg-secondary/80">Set</button>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-2 py-3 text-center">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="border-b border-border p-4 last:border-b-0">
      <div className="mb-3 flex items-center gap-2">
        <Route className="h-3.5 w-3.5 text-blue-500" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
