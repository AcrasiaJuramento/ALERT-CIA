import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, BellRing, Droplets, Megaphone, TrafficCone } from 'lucide-react';
import { getAdvisoryLatLng } from '../../utils/mapData';

const severityColors = {
  critical: '#dc2626',
  warning: '#f97316',
  moderate: '#eab308',
  resolved: '#22c55e',
};

const categoryIcons = {
  flood: Droplets,
  road_closure: TrafficCone,
  weather: BellRing,
  general: Megaphone,
};

const categoryLabels = {
  flood: 'Flood',
  road_closure: 'Road Closure',
  weather: 'Weather',
  general: 'General',
};

function AdvisoryGlyph({ advisory }) {
  const Icon = categoryIcons[advisory.category] || Megaphone;
  const color = severityColors[advisory.severity] || '#f97316';

  return (
    <div className="leaflet-advisory-marker" style={{ '--advisory-marker-color': color }}>
      <Icon size={14} strokeWidth={2.5} />
    </div>
  );
}

function PopupContent({ advisory }) {
  return (
    <div className="min-w-52 text-slate-900">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-orange-700">
        <AlertTriangle size={12} />
        Public Advisory
      </div>
      <div className="text-sm font-semibold">{advisory.title}</div>
      <div className="mt-1 text-xs text-slate-600">{advisory.area}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold capitalize">{advisory.severity}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5">{categoryLabels[advisory.category] || 'General'}</span>
      </div>
      {advisory.message && (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{advisory.message}</p>
      )}
    </div>
  );
}

function createReactDivIcon(content) {
  const container = document.createElement('div');
  createRoot(container).render(content);

  return L.divIcon({
    html: container,
    className: 'leaflet-advisory-marker-shell',
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });
}

export function AdvisoryMarkersLayer({
  advisories = [],
  selectedAdvisoryId,
  onAdvisoryClick,
}) {
  const map = useMap();

  useEffect(() => {
    const layer = L.layerGroup();

    advisories.forEach((advisory) => {
      const position = getAdvisoryLatLng(advisory);
      if (!position) return;

      const marker = L.marker(position, {
        icon: createReactDivIcon(<AdvisoryGlyph advisory={advisory} />),
        riseOnHover: true,
      });

      const popup = document.createElement('div');
      createRoot(popup).render(<PopupContent advisory={advisory} />);
      marker.bindPopup(popup, { closeButton: true, maxWidth: 300 });
      marker.on('click', () => onAdvisoryClick?.(advisory.id));
      layer.addLayer(marker);
    });

    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [advisories, map, onAdvisoryClick]);

  useEffect(() => {
    if (!selectedAdvisoryId) return;
    const advisory = advisories.find((item) => item.id === selectedAdvisoryId);
    const position = getAdvisoryLatLng(advisory);
    if (!position) return;

    map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.65 });
  }, [advisories, map, selectedAdvisoryId]);

  return null;
}
