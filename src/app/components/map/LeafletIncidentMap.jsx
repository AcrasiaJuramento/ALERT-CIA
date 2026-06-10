import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed, Layers, RefreshCw } from 'lucide-react';
import { incidents as defaultIncidents, heatmapZones, dangerZones } from '../../data/mockData';
import { ECHAGUE_CENTER, getBoundsForIncidents } from '../../utils/mapData';
import { ClusteredIncidentMarkers } from './ClusteredIncidentMarkers';
import { HazardZonesLayer } from './HazardZonesLayer';
import { HeatmapLayer } from './HeatmapLayer';
import { RouteLayer } from './RouteLayer';

function FitMapToData({ incidents, selectedIncidentId }) {
  const map = useMap();

  useEffect(() => {
    if (selectedIncidentId) return;
    const bounds = getBoundsForIncidents(incidents);
    if (!bounds?.length) return;

    map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 14,
    });
  }, [incidents, map, selectedIncidentId]);

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

export function LeafletIncidentMap({
  height = '100%',
  incidents = defaultIncidents,
  selectedIncidentId,
  onMarkerClick,
  showControls = true,
  showHeatmap = true,
  showDangerZones = true,
  showMarkers = true,
  clusterMarkers = true,
  routes = [],
  compact = false,
  autoFit = true,
  onMapClick,
}) {
  const [layers, setLayers] = useState({
    heatmap: showHeatmap,
    dangerZones: showDangerZones,
    incidents: showMarkers,
    routes: true,
    locate: false,
  });
  const [followUser, setFollowUser] = useState(false);

  const activeIncidents = useMemo(
    () => incidents.filter((incident) => incident.status !== 'resolved'),
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onMapClick={onMapClick} />
        <ZoomControl position="bottomright" />
        {autoFit && <FitMapToData incidents={incidents} selectedIncidentId={selectedIncidentId} />}
        <ClusteredIncidentMarkers
          incidents={layers.incidents ? incidents : []}
          selectedIncidentId={selectedIncidentId}
          onMarkerClick={onMarkerClick}
          enabled={clusterMarkers}
        />
        {!clusterMarkers && layers.incidents && (
          <ClusteredIncidentMarkers
            incidents={incidents}
            selectedIncidentId={selectedIncidentId}
            onMarkerClick={onMarkerClick}
            enabled={false}
          />
        )}
        <HeatmapLayer points={heatmapZones} enabled={layers.heatmap} />
        <HazardZonesLayer zones={dangerZones} enabled={layers.dangerZones} />
        <RouteLayer routes={layers.routes ? routes : []} />
        <UserLocationLayer enabled={layers.locate} followUser={followUser} />
      </MapContainer>

      {!compact && (
        <div className="absolute left-3 top-3 z-[500] rounded-lg border border-border bg-card/95 p-2 text-xs shadow-lg backdrop-blur">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-blue-400" />
            Layers
          </div>
          {[
            ['incidents', 'Incidents'],
            ['heatmap', 'Heatmap'],
            ['dangerZones', 'Geofences'],
            ['routes', 'Routes'],
          ].map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 py-0.5 text-foreground/85">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(event) => setLayers((current) => ({ ...current, [key]: event.target.checked }))}
                className="accent-blue-500"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}

      {showControls && (
        <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
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

      <div className="absolute bottom-3 left-3 z-[500] rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-foreground">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-semibold">{activeIncidents.length}</span>
          <span className="text-muted-foreground">active incidents</span>
        </div>
      </div>
    </div>
  );
}
