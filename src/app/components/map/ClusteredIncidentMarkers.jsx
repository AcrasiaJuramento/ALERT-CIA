import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import { AlertTriangle, Flame, Droplets, Heart, MapPin, ShieldAlert } from 'lucide-react';
import { getIncidentLatLng } from '../../utils/mapData';
import { getIncidentStatusLabel } from '../../utils/incidentStatus';

const severityColors = {
  critical: '#dc2626',
  warning: '#f97316',
  moderate: '#eab308',
  resolved: '#22c55e',
};

const typeIcons = {
  vehicular: AlertTriangle,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: ShieldAlert,
  other: MapPin,
};

function MarkerGlyph({ incident }) {
  const Icon = typeIcons[incident.type] || MapPin;
  const color = severityColors[incident.severity] || '#3b82f6';

  return (
    <div
      className="leaflet-incident-marker"
      style={{
        '--marker-color': color,
      }}
    >
      <Icon size={14} strokeWidth={2.4} />
    </div>
  );
}

function PopupContent({ incident }) {
  const isExternal = incident.sourceKind && incident.sourceKind !== 'official';

  return (
    <div className="min-w-48 text-slate-900">
      <div className="font-mono text-xs font-bold text-blue-700 mb-1">{incident.id}</div>
      <div className="text-sm font-semibold capitalize">{incident.type} Incident</div>
      {isExternal && (
        <div className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          {incident.sourceKind.replaceAll('_', ' ')}
        </div>
      )}
      <div className="text-xs text-slate-600 mt-1">{incident.location}</div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold capitalize">{incident.severity}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5">{getIncidentStatusLabel(incident.status)}</span>
      </div>
      {incident.description && (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{incident.description}</p>
      )}
      {incident.sourceLabel && (
        <p className="mt-2 text-[11px] text-slate-500">Source: {incident.sourceLabel}</p>
      )}
      {isExternal && incident.locationPrecision && (
        <p className="mt-1 text-[10px] text-slate-500">
          Mapping: {incident.locationPrecision.replaceAll('_', ' ')}
          {incident.coordinateSource ? ` / ${incident.coordinateSource}` : ''}
        </p>
      )}
      {isExternal && ['unmatched_location', 'needs_review'].includes(incident.mappingStatus) && (
        <p className="mt-1 text-[10px] font-semibold text-amber-600">Location needs review</p>
      )}
    </div>
  );
}

function createReactDivIcon(content, className, size = [34, 34], anchor = [17, 34]) {
  const container = document.createElement('div');
  createRoot(container).render(content);

  return L.divIcon({
    html: container,
    className,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, -32],
  });
}

function coordinateKey(incident) {
  const [lat, lng] = getIncidentLatLng(incident);
  return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

function getSpreadLatLng(incident, indexByCoordinate, totalByCoordinate) {
  const base = getIncidentLatLng(incident);
  const key = coordinateKey(incident);
  const total = totalByCoordinate.get(key) || 1;
  if (total <= 1) return base;

  const index = indexByCoordinate.get(incident.id) || 0;
  const angle = (Math.PI * 2 * index) / total;
  const radius = 0.00018 + Math.floor(index / 8) * 0.00008;
  return [
    base[0] + Math.sin(angle) * radius,
    base[1] + Math.cos(angle) * radius,
  ];
}

export function ClusteredIncidentMarkers({
  incidents = [],
  selectedIncidentId,
  onMarkerClick,
  enabled = true,
  spreadOverlapping = false,
}) {
  const map = useMap();

  useEffect(() => {
    const layer = enabled
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          maxClusterRadius: 48,
          iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount();
            return L.divIcon({
              html: `<div class="leaflet-cluster-marker">${count}</div>`,
              className: 'leaflet-cluster-marker-shell',
              iconSize: [38, 38],
            });
          },
        })
      : L.layerGroup();

    const coordinateCounts = new Map();
    const coordinateIndexes = new Map();
    const seenByCoordinate = new Map();
    if (spreadOverlapping && !enabled) {
      incidents.forEach((incident) => {
        const key = coordinateKey(incident);
        coordinateCounts.set(key, (coordinateCounts.get(key) || 0) + 1);
      });
      incidents.forEach((incident) => {
        const key = coordinateKey(incident);
        const nextIndex = seenByCoordinate.get(key) || 0;
        coordinateIndexes.set(incident.id, nextIndex);
        seenByCoordinate.set(key, nextIndex + 1);
      });
    }

    incidents.forEach((incident) => {
      const marker = L.marker(
        spreadOverlapping && !enabled
          ? getSpreadLatLng(incident, coordinateIndexes, coordinateCounts)
          : getIncidentLatLng(incident),
        {
        icon: createReactDivIcon(<MarkerGlyph incident={incident} />, 'leaflet-incident-marker-shell'),
        riseOnHover: true,
        }
      );

      const popup = document.createElement('div');
      createRoot(popup).render(<PopupContent incident={incident} />);
      marker.bindPopup(popup, { closeButton: true, maxWidth: 280 });

      marker.on('click', () => onMarkerClick?.(incident.id));
      layer.addLayer(marker);
    });

    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [enabled, incidents, map, onMarkerClick, spreadOverlapping]);

  useEffect(() => {
    if (!selectedIncidentId) return;
    const incident = incidents.find((item) => item.id === selectedIncidentId);
    if (!incident) return;

    map.flyTo(getIncidentLatLng(incident), Math.max(map.getZoom(), 15), {
      duration: 0.65,
    });
  }, [incidents, map, selectedIncidentId]);

  return null;
}
