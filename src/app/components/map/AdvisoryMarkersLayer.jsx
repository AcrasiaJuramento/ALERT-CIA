import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, BellRing, Droplets, Image as ImageIcon, Megaphone, TrafficCone, X } from 'lucide-react';
import { getAdvisoryLatLng } from '../../utils/mapData';

const severityColors = {
  critical: '#dc2626',
  warning: '#f97316',
  moderate: '#eab308',
  resolved: '#22c55e',
};

const categoryIcons = {
  accident_prone_area: AlertTriangle,
  flood: Droplets,
  road_closure: TrafficCone,
  weather: BellRing,
  general: Megaphone,
};

const categoryLabels = {
  accident_prone_area: 'Accident Prone Area',
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const image = advisory.media?.find(item => item.publicUrl);

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
      {image && (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="mt-3 block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left"
        >
          <img src={image.publicUrl} alt={image.fileName || advisory.title} loading="lazy" className="h-28 w-full object-cover" />
          <span className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-slate-700">
            <ImageIcon size={12} />
            Preview image
          </span>
        </button>
      )}
      {previewOpen && createPortal(
        <div
          className="fixed inset-0 z-[5100] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setPreviewOpen(false)}
        >
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 p-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-white">{image.fileName || advisory.title}</h2>
                <p className="text-xs text-slate-500">{advisory.area}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close advisory image preview"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-900 p-3">
              <img src={image.publicUrl} alt={image.fileName || advisory.title} className="max-h-[calc(100vh-8rem)] max-w-full object-contain" />
            </div>
          </div>
        </div>,
        document.body,
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
    const roots = [];

    advisories.forEach((advisory) => {
      const position = getAdvisoryLatLng(advisory);
      if (!position) return;

      const marker = L.marker(position, {
        icon: createReactDivIcon(<AdvisoryGlyph advisory={advisory} />),
        riseOnHover: true,
      });

      const popup = document.createElement('div');
      const root = createRoot(popup);
      roots.push(root);
      root.render(<PopupContent advisory={{ ...advisory, media: [] }} />);
      marker.bindPopup(popup, { closeButton: true, maxWidth: 300 });
      marker.on('click', () => onAdvisoryClick?.(advisory.id));
      marker.on('popupopen', () => root.render(<PopupContent advisory={advisory} />));
      marker.on('popupclose', () => root.render(<PopupContent advisory={{ ...advisory, media: [] }} />));
      layer.addLayer(marker);
    });

    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
      roots.forEach(root => root.unmount());
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
