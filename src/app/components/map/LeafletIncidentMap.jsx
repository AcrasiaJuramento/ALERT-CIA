import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ChevronDown, LocateFixed, Layers, RefreshCw } from 'lucide-react';
import { ECHAGUE_CENTER, getAdvisoryLatLng, getBoundsForIncidents } from '../../utils/mapData';
import { isIncidentCompleted } from '../../utils/incidentStatus';
import { loadIsabelaBoundaryCollection } from '../../data/isabelaBarangayGeometry';
import { AdvisoryMarkersLayer } from './AdvisoryMarkersLayer';
import { ClusteredIncidentMarkers } from './ClusteredIncidentMarkers';
import { HazardZonesLayer } from './HazardZonesLayer';
import { HeatmapLayer } from './HeatmapLayer';
import { RouteLayer } from './RouteLayer';

function FitMapToData({ incidents, advisories, selectedIncidentId, selectedAdvisoryId }) {
  const map = useMap();

  useEffect(() => {
    if (selectedIncidentId || selectedAdvisoryId) return;
    const advisoryPoints = advisories.map(getAdvisoryLatLng).filter(Boolean);
    const bounds = [...(getBoundsForIncidents(incidents) || []), ...advisoryPoints];
    if (!bounds?.length) return;

    map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 14,
    });
  }, [advisories, incidents, map, selectedAdvisoryId, selectedIncidentId]);

  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (event) => {
      onMapClick?.(event.latlng, event);
    },
  });

  return null;
}

function UserLocationLayer({ enabled, followUser }) {
  const map = useMap();
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const nextPosition = [coords.latitude, coords.longitude];
        setPosition(nextPosition);
        setError('');
        if (followUser) {
          map.flyTo(nextPosition, Math.max(map.getZoom(), 15), { duration: 0.5 });
        }
      },
      () => setError('Location permission denied'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, followUser, map]);

  useEffect(() => {
    if (!position) return;

    const marker = L.circleMarker(position, {
      radius: 8,
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.9,
      weight: 3,
    });

    const accuracy = L.circle(position, {
      radius: 35,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      weight: 1,
    });

    marker.bindPopup('Your current location');
    marker.addTo(map);
    accuracy.addTo(map);

    return () => {
      map.removeLayer(marker);
      map.removeLayer(accuracy);
    };
  }, [map, position]);

  return error ? (
    <div className="absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-950/90 px-3 py-2 text-xs text-red-100 shadow-lg">
      {error}
    </div>
  ) : null;
}

function PlannerPointsLayer({ points = {} }) {
  const visiblePoints = [
    ['current', points.current],
    ['start', points.start],
    ['destination', points.destination],
  ].filter(([, point]) => point?.latLng);

  return visiblePoints.map(([key, point]) => (
    <CircleMarker
      key={key}
      center={point.latLng}
      radius={9}
      pathOptions={{
        color: key === 'destination' ? '#dc2626' : key === 'start' ? '#2563eb' : '#16a34a',
        fillColor: key === 'destination' ? '#ef4444' : key === 'start' ? '#3b82f6' : '#22c55e',
        fillOpacity: 0.9,
        weight: 3,
      }}
    >
      <Popup>{point.label || (key === 'destination' ? 'Point B' : key === 'start' ? 'Point A' : 'Current GPS location')}</Popup>
    </CircleMarker>
  ));
}

const BASEMAP_PROVIDERS = [
  {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  {
    name: 'Carto',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
  {
    name: 'Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
];

function ResilientTileLayer({ onUnavailable, onRecovered }) {
  const [providerIndex, setProviderIndex] = useState(0);
  const failures = useRef(0);
  const provider = BASEMAP_PROVIDERS[providerIndex];
  return (
    <TileLayer
      key={provider.url}
      attribution={provider.attribution}
      url={provider.url}
      crossOrigin="anonymous"
      eventHandlers={{
        load: () => {
          failures.current = 0;
          onRecovered?.(provider.name);
        },
        tileerror: () => {
          failures.current += 1;
          if (failures.current < 6) return;
          failures.current = 0;
          if (providerIndex < BASEMAP_PROVIDERS.length - 1) {
            setProviderIndex(index => index + 1);
          } else {
            onUnavailable?.();
          }
        },
      }}
    />
  );
}

function MapResizeHandler() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const resize = () => map.invalidateSize({ pan: false });
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const timer = setTimeout(resize, 0);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

function LocalIsabelaBasemap({ enabled }) {
  const [collection, setCollection] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    loadIsabelaBoundaryCollection().then((data) => {
      if (active) setCollection(data);
    });
    return () => { active = false; };
  }, [enabled]);
  if (!enabled || !collection?.features?.length) return null;
  return (
    <GeoJSON
      data={collection}
      style={{ color: '#64748b', weight: 0.75, fillColor: '#f8fafc', fillOpacity: 0.42 }}
      onEachFeature={(feature, layer) => {
        layer.bindTooltip(`${feature.properties?.NAME_3 || 'Barangay'}, ${feature.properties?.NAME_2 || 'Isabela'}`, { sticky: true });
      }}
    />
  );
}

function IncidentBarangayBoundaries({ incidents = [] }) {
  const collection = useMemo(() => {
    const unique = new Map();
    incidents.forEach((incident) => {
      const feature = incident.barangayBoundary;
      if (!feature) return;
      const key = feature.properties?.GID_3 || JSON.stringify(feature.properties || {});
      unique.set(key, feature);
    });
    return { type: 'FeatureCollection', features: [...unique.values()] };
  }, [incidents]);

  if (!collection.features.length) return null;
  const boundaryKey = collection.features.map(feature => feature.properties?.GID_3 || '').join('|');
  return (
    <GeoJSON
      key={boundaryKey}
      data={collection}
      style={{ color: '#60a5fa', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.08 }}
      onEachFeature={(feature, layer) => {
        const barangay = feature.properties?.NAME_3 || 'Barangay';
        const municipality = feature.properties?.NAME_2 || 'Isabela';
        layer.bindTooltip(`${barangay}, ${municipality}`, { sticky: true });
      }}
    />
  );
}

export function LeafletIncidentMap({
  height = '100%',
  incidents = [],
  selectedIncidentId,
  onMarkerClick,
  showControls = true,
  showHeatmap = true,
  showDangerZones = true,
  showMarkers = true,
  advisoryMarkers = [],
  selectedAdvisoryId,
  onAdvisoryClick,
  clusterMarkers = true,
  routes = [],
  hazardZones = [],
  plannerPoints = {},
  compact = false,
  autoFit = true,
  onMapClick,
  externalLayers,
  onExternalLayersChange,
  hideLayerControl = false,
  spreadOverlappingMarkers = false,
}) {
  const [layers, setLayers] = useState({
    heatmap: showHeatmap,
    dangerZones: showDangerZones,
    incidents: showMarkers,
    advisories: true,
    routes: true,
    locate: false,
  });
  const [followUser, setFollowUser] = useState(false);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [basemapUnavailable, setBasemapUnavailable] = useState(false);
  const effectiveLayers = { ...layers, ...(externalLayers || {}) };
  const setLayerValue = (key, checked) => {
    if (externalLayers && onExternalLayersChange) {
      onExternalLayersChange({ ...externalLayers, [key]: checked });
      return;
    }
    setLayers((current) => ({ ...current, [key]: checked }));
  };

  const activeIncidents = useMemo(
    () => incidents.filter((incident) => !isIncidentCompleted(incident.status)),
    [incidents]
  );

  return (
    <div className="relative w-full overflow-hidden border border-border bg-slate-950" style={{ height }}>
      <MapContainer
        center={ECHAGUE_CENTER}
        zoom={13}
        minZoom={11}
        maxZoom={19}
        className="h-full w-full"
        zoomControl={false}
        scrollWheelZoom
      >
        <ResilientTileLayer
          onUnavailable={() => setBasemapUnavailable(true)}
          onRecovered={() => setBasemapUnavailable(false)}
        />
        <LocalIsabelaBasemap enabled={basemapUnavailable} />
        <MapResizeHandler />
        <MapClickHandler onMapClick={onMapClick} />
        <ZoomControl position="bottomright" />
        {autoFit && (
          <FitMapToData
            incidents={incidents}
            advisories={advisoryMarkers}
            selectedIncidentId={selectedIncidentId}
            selectedAdvisoryId={selectedAdvisoryId}
          />
        )}
        <IncidentBarangayBoundaries incidents={effectiveLayers.incidents ? incidents : []} />
        <ClusteredIncidentMarkers
          incidents={effectiveLayers.incidents ? incidents : []}
          selectedIncidentId={selectedIncidentId}
          onMarkerClick={onMarkerClick}
          enabled={clusterMarkers}
          spreadOverlapping={spreadOverlappingMarkers}
        />
        {!clusterMarkers && effectiveLayers.incidents && (
          <ClusteredIncidentMarkers
            incidents={incidents}
            selectedIncidentId={selectedIncidentId}
            onMarkerClick={onMarkerClick}
            enabled={false}
            spreadOverlapping={spreadOverlappingMarkers}
          />
        )}
        <AdvisoryMarkersLayer
          advisories={effectiveLayers.advisories ? advisoryMarkers : []}
          selectedAdvisoryId={selectedAdvisoryId}
          onAdvisoryClick={onAdvisoryClick}
        />
        <HeatmapLayer points={[]} enabled={effectiveLayers.heatmap} />
        <HazardZonesLayer zones={hazardZones} enabled={effectiveLayers.dangerZones} />
        <RouteLayer routes={effectiveLayers.routes ? routes : []} />
        <PlannerPointsLayer points={plannerPoints} />
        <UserLocationLayer enabled={layers.locate} followUser={followUser} />
      </MapContainer>

      {basemapUnavailable && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-lg border border-amber-500/30 bg-amber-50/95 px-3 py-1.5 text-[10px] font-medium text-amber-800 shadow">
          Offline boundary map — external street tiles unavailable
        </div>
      )}

      {!compact && !hideLayerControl && (
        <div className="absolute left-3 top-3 z-[500] text-xs">
          <button
            onClick={() => setLayerMenuOpen(current => !current)}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card/95 px-3 font-semibold text-muted-foreground shadow-lg backdrop-blur hover:bg-secondary hover:text-foreground"
            title="Map layers"
          >
            <Layers className="h-3.5 w-3.5 text-blue-400" />
            Layers
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${layerMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {layerMenuOpen && (
            <div className="mt-2 w-44 rounded-lg border border-border bg-card/95 p-2 shadow-xl backdrop-blur">
              {[
                ['incidents', 'Incidents'],
                ['advisories', 'Advisories'],
                ['heatmap', 'Heatmap'],
                ['dangerZones', 'Geofences'],
                ['routes', 'Routes'],
              ].map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-foreground/85 hover:bg-secondary">
                  <input
                    type="checkbox"
                    checked={effectiveLayers[key]}
                    onChange={(event) => setLayerValue(key, event.target.checked)}
                    className="accent-blue-500"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {showControls && (
        <div className="absolute bottom-28 right-3 z-[500] flex flex-col gap-2">
          <button
            onClick={() => setLayers((current) => ({ ...current, locate: !current.locate }))}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-lg transition-all ${
              layers.locate
                ? 'border-blue-500 bg-blue-600 text-white'
                : 'border-border bg-card/95 text-foreground hover:bg-secondary'
            }`}
            title="Track current location"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
          <button
            onClick={() => setFollowUser((current) => !current)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border shadow-lg transition-all ${
              followUser
                ? 'border-green-500 bg-green-600 text-white'
                : 'border-border bg-card/95 text-foreground hover:bg-secondary'
            }`}
            title="Follow current location"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {!compact && <div className="absolute bottom-3 left-3 z-[500] rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-foreground">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-semibold">{activeIncidents.length}</span>
          <span className="text-muted-foreground">active incidents</span>
        </div>
      </div>}
    </div>
  );
}
