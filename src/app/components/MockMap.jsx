import { useState } from "react";
import { AlertTriangle, Flame, Droplets, MapPin, Zap } from "lucide-react";

// Default markers
const defaultMarkers = [
  { id: "1", x: 52, y: 38, type: "vehicular", severity: "critical", label: "INC-0314-001", status: "Active" },
  { id: "2", x: 68, y: 45, type: "fire", severity: "critical", label: "INC-0314-002", status: "Active" },
  { id: "3", x: 35, y: 62, type: "medical", severity: "warning", label: "INC-0314-003", status: "Responding" },
  { id: "4", x: 45, y: 72, type: "flood", severity: "warning", label: "INC-0314-004", status: "Responding" },
  { id: "5", x: 72, y: 30, type: "vehicular", severity: "moderate", label: "INC-0313-005", status: "Resolved" },
  { id: "6", x: 28, y: 80, type: "medical", severity: "moderate", label: "INC-0313-006", status: "Resolved" },
  { id: "7", x: 20, y: 55, type: "landslide", severity: "moderate", label: "INC-0313-007", status: "Resolved" },
];

// Default heat zones
const defaultHeatZones = [
  { x: 52, y: 38, size: 120, color: "#dc2626", opacity: 0.3, label: "High Risk" },
  { x: 68, y: 45, size: 100, color: "#dc2626", opacity: 0.25 },
  { x: 35, y: 55, size: 140, color: "#ea580c", opacity: 0.2 },
  { x: 60, y: 65, size: 160, color: "#d97706", opacity: 0.15 },
  { x: 25, y: 40, size: 90, color: "#ea580c", opacity: 0.2 },
];

const markerColors = {
  critical: "#dc2626",
  warning: "#f97316",
  moderate: "#eab308",
  resolved: "#22c55e",
};

const markerIcons = {
  vehicular: AlertTriangle,
  fire: Flame,
  medical: Zap,
  flood: Droplets,
  landslide: MapPin,
};

// Road network SVG paths (simulated)
const roads = [
  "M 5 30 Q 30 28 55 35 Q 75 38 95 32",
  "M 10 55 Q 35 52 58 60 Q 78 65 92 58",
  "M 20 10 Q 22 35 25 55 Q 27 72 30 90",
  "M 50 8 Q 52 30 55 52 Q 57 68 58 92",
  "M 72 5 Q 70 28 68 48 Q 67 65 70 88",
  "M 5 80 Q 30 78 55 80 Q 75 82 95 78",
  "M 35 40 Q 50 38 65 42",
  "M 30 62 Q 45 60 60 65",
];

export function MockMap({
  markers = defaultMarkers,
  heatZones = defaultHeatZones,
  dangerZones = [],
  fullscreen = false,
  showLayers = true,
  selectedMarker = null,
  onMarkerClick,
  style = "dark",
}) {
  const [hoveredMarker, setHoveredMarker] = useState(null);
  const [layers, setLayers] = useState({
    heatmap: true,
    incidents: true,
    danger: true,
    roads: true,
  });

  const bgStyle =
    style === "dark"
      ? "bg-[#0d1b2e]"
      : style === "satellite"
      ? "bg-[#1a2744]"
      : "bg-[#e8ecf0]";

  const gridColor = style === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";

  return (
    <div className={`relative w-full h-full ${bgStyle} overflow-hidden rounded-xl`}>
      {/* Grid background */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d={`M 40 0 L 0 0 0 40`} fill="none" stroke={gridColor} strokeWidth="1" />
          </pattern>
          {/* Radial gradients for heatmap */}
          {heatZones.map((zone, i) => (
            <radialGradient key={i} id={`heat-${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={zone.color} stopOpacity={zone.opacity * 1.5} />
              <stop offset="60%" stopColor={zone.color} stopOpacity={zone.opacity} />
              <stop offset="100%" stopColor={zone.color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Roads */}
        {layers.roads && roads.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={style === "dark" ? "rgba(148,163,184,0.25)" : "rgba(100,116,139,0.35)"}
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            transform="scale(1)"
            style={{ vectorEffect: "non-scaling-stroke" }}
          />
        ))}

        {/* Heatmap zones */}
        {layers.heatmap && heatZones.map((zone, i) => (
          <ellipse
            key={i}
            cx={`${zone.x}%`}
            cy={`${zone.y}%`}
            rx={zone.size * 0.6}
            ry={zone.size * 0.4}
            fill={`url(#heat-${i})`}
          />
        ))}

        {/* Danger zones */}
        {layers.danger && dangerZones.map((dz, i) => (
          <ellipse
            key={i}
            cx={`${dz.x}%`}
            cy={`${dz.y}%`}
            rx={dz.size}
            ry={dz.size * 0.65}
            fill="none"
            stroke={dz.color}
            strokeWidth="1.5"
            strokeDasharray="6,4"
            opacity="0.7"
          />
        ))}
      </svg>

      {/* Barangay Labels */}
      {style === "dark" && (
        <div className="absolute inset-0 pointer-events-none">
          {[
            { label: "Poblacion", x: "48%", y: "32%" },
            { label: "Buhangin", x: "64%", y: "40%" },
            { label: "Talomo", x: "30%", y: "57%" },
            { label: "Matina", x: "42%", y: "68%" },
            { label: "Agdao", x: "68%", y: "24%" },
            { label: "Toril", x: "22%", y: "76%" },
            { label: "Calinan", x: "16%", y: "50%" },
          ].map((place) => (
            <span
              key={place.label}
              className="absolute text-[10px] text-slate-400/60 font-medium uppercase tracking-wider"
              style={{ left: place.x, top: place.y, transform: "translate(-50%, -50%)" }}
            >
              {place.label}
            </span>
          ))}
        </div>
      )}

      {/* Incident Markers */}
      {layers.incidents && markers.map((marker) => {
        const Icon = markerIcons[marker.type] || MapPin;
        const color = markerColors[marker.severity];
        const isHovered = hoveredMarker === marker.id;
        const isSelected = selectedMarker === marker.id;

        return (
          <div
            key={marker.id}
            className="absolute transform -translate-x-1/2 -translate-y-full cursor-pointer z-10"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            onMouseEnter={() => setHoveredMarker(marker.id)}
            onMouseLeave={() => setHoveredMarker(null)}
            onClick={() => onMarkerClick?.(marker.id)}
          >
            {/* Pulse ring for active */}
            {(marker.severity === "critical" || marker.severity === "warning") && (
              <div
                className="absolute -inset-2 rounded-full animate-ping opacity-40"
                style={{ backgroundColor: color, transform: "translate(-50%, -50%)", left: "50%", top: "50%" }}
              />
            )}

            {/* Marker pin */}
            <div
              className={`relative flex items-center justify-center rounded-full shadow-lg transition-transform ${isHovered || isSelected ? "scale-125" : "scale-100"}`}
              style={{
                width: 28,
                height: 28,
                backgroundColor: color,
                boxShadow: `0 0 12px ${color}88`,
                border: "2px solid white",
              }}
            >
              <Icon size={12} className="text-white" />
            </div>

            {/* Tooltip */}
            {isHovered && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                <div className="bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-xl border border-white/10">
                  <p className="font-semibold">{marker.label}</p>
                  <p className="text-slate-300 capitalize">{marker.type.replace("_", " ")}</p>
                  {marker.status && (
                    <p style={{ color }} className="font-medium">{marker.status}</p>
                  )}
                </div>
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 mx-auto" />
              </div>
            )}
          </div>
        );
      })}

      {/* Map Controls */}
      {showLayers && (
        <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
          <div className="bg-slate-900/90 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <p className="text-white text-[10px] font-semibold uppercase tracking-wider mb-2">Layers</p>
            {Object.entries(layers).map(([key, val]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer mb-1.5 last:mb-0">
                <input
                  type="checkbox"
                  checked={val}
                  onChange={() => setLayers(l => ({ ...l, [key]: !val }))}
                  className="w-3 h-3 accent-blue-500"
                />
                <span className="text-slate-300 text-[10px] capitalize">{key}</span>
              </label>
            ))}
          </div>

          {/* Zoom controls */}
          <div className="bg-slate-900/90 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
            <button className="flex items-center justify-center w-8 h-8 text-white hover:bg-white/10 transition-colors text-lg font-bold border-b border-white/10">+</button>
            <button className="flex items-center justify-center w-8 h-8 text-white hover:bg-white/10 transition-colors text-lg font-bold">−</button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-sm rounded-xl p-3 border border-white/10 z-20">
        <p className="text-white text-[10px] font-semibold uppercase tracking-wider mb-2">Legend</p>
        {[
          { color: "#dc2626", label: "Critical" },
          { color: "#f97316", label: "Warning" },
          { color: "#eab308", label: "Moderate" },
          { color: "#22c55e", label: "Resolved" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 mb-1 last:mb-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-slate-300 text-[10px]">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Scale bar */}
      <div className="absolute bottom-3 right-14 bg-slate-900/70 backdrop-blur-sm rounded px-2 py-1 border border-white/10 z-20">
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-0">
            <div className="w-16 h-1 bg-white/60 rounded" />
          </div>
          <span className="text-white/50 text-[9px]">500m</span>
        </div>
      </div>
    </div>
  );
}
