import { useState, useEffect } from 'react';
const incidents = [];
const heatmapZones = [];
const dangerZones = [];
import { AlertTriangle, Flame, Droplets, Heart, Shield } from 'lucide-react';
import { isAmbulanceAssigned, isIncidentCompleted } from '../utils/incidentStatus';

const severityColors = {
  critical: { fill: '#EF4444', stroke: '#DC2626', pulse: 'rgba(239,68,68,0.4)' },
  warning: { fill: '#F97316', stroke: '#EA580C', pulse: 'rgba(249,115,22,0.4)' },
  moderate: { fill: '#EAB308', stroke: '#CA8A04', pulse: 'rgba(234,179,8,0.4)' },
  resolved: { fill: '#22C55E', stroke: '#16A34A', pulse: 'rgba(34,197,94,0.4)' },
};

const typeIcons = {
  vehicular: '🚗',
  fire: '🔥',
  medical: '🏥',
  flood: '💧',
  crime: '⚠',
  other: '📍',
};

export function MapSimulation({
  height = '100%',
  showControls = true,
  showHeatmap = true,
  showDangerZones = true,
  showMarkers = true,
  isPublic = false,
  onMarkerClick,
  selectedIncidentId,
}) {
  const [pulse, setPulse] = useState(0);
  const [layers, setLayers] = useState({
    heatmap: showHeatmap,
    dangerZones: showDangerZones,
    incidents: showMarkers,
    satellite: false,
  });
  const [hoveredMarker, setHoveredMarker] = useState(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulse((p) => (p + 1) % 3);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeIncidents = incidents.filter((i) => !isIncidentCompleted(i.status));
  const visibleIncidents = isPublic ? incidents.slice(0, 8) : incidents;

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-slate-700" style={{ height }}>
      {/* Map SVG */}
      <svg
        viewBox="0 0 800 600"
        className="absolute inset-0 w-full h-full"
        style={{ background: layers.satellite ? '#1a2744' : '#1e3050' }}
      >
        <defs>
          {/* Heatmap gradients */}
          {heatmapZones.map((zone, i) => (
            <radialGradient key={i} id={`heat-${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={zone.intensity * 0.7} />
              <stop offset="40%" stopColor="#F97316" stopOpacity={zone.intensity * 0.4} />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
            </radialGradient>
          ))}

          {/* Danger zone patterns */}
          <pattern id="dangerPattern" patternUnits="userSpaceOnUse" width="10" height="10">
            <path d="M0,10 L10,0" stroke="#EF4444" strokeWidth="1" strokeOpacity="0.3" />
          </pattern>
          <pattern id="floodPattern" patternUnits="userSpaceOnUse" width="10" height="10">
            <path d="M0,10 L10,0" stroke="#3B82F6" strokeWidth="1" strokeOpacity="0.3" />
          </pattern>

          {/* Pulse animations */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* City Grid - Roads and Blocks */}
        {/* Water feature - river */}
        <path
          d="M0,480 Q100,460 200,490 Q300,510 400,480 Q500,450 600,470 Q700,490 800,465"
          fill="none" stroke="#1e4080" strokeWidth="28" strokeOpacity="0.8"
        />
        <path
          d="M0,480 Q100,460 200,490 Q300,510 400,480 Q500,450 600,470 Q700,490 800,465"
          fill="none" stroke="#2563EB" strokeWidth="20" strokeOpacity="0.3"
        />

        {/* Park areas */}
        <rect x="100" y="100" width="80" height="60" rx="4" fill="#1a3a28" />
        <rect x="500" y="380" width="70" height="55" rx="4" fill="#1a3a28" />
        <rect x="640" y="150" width="90" height="70" rx="4" fill="#1a3a28" />

        {/* City blocks */}
        {Array.from({ length: 8 }).map((_, row) =>
          Array.from({ length: 10 }).map((_, col) => (
            <rect
              key={`block-${row}-${col}`}
              x={col * 80 + 10}
              y={row * 65 + 10}
              width={60}
              height={45}
              rx="2"
              fill="#1a2a40"
              fillOpacity="0.6"
            />
          ))
        )}

        {/* Main roads - horizontal */}
        <line x1="0" y1="100" x2="800" y2="100" stroke="#2d4070" strokeWidth="6" />
        <line x1="0" y1="200" x2="800" y2="200" stroke="#2d4070" strokeWidth="6" />
        <line x1="0" y1="300" x2="800" y2="300" stroke="#2d4070" strokeWidth="8" />
        <line x1="0" y1="400" x2="800" y2="400" stroke="#2d4070" strokeWidth="6" />
        <line x1="0" y1="500" x2="800" y2="500" stroke="#2d4070" strokeWidth="6" />

        {/* Main roads - vertical */}
        <line x1="80" y1="0" x2="80" y2="600" stroke="#2d4070" strokeWidth="6" />
        <line x1="200" y1="0" x2="200" y2="600" stroke="#2d4070" strokeWidth="6" />
        <line x1="350" y1="0" x2="350" y2="600" stroke="#2d4070" strokeWidth="8" />
        <line x1="500" y1="0" x2="500" y2="600" stroke="#2d4070" strokeWidth="6" />
        <line x1="640" y1="0" x2="640" y2="600" stroke="#2d4070" strokeWidth="6" />
        <line x1="760" y1="0" x2="760" y2="600" stroke="#2d4070" strokeWidth="4" />

        {/* Secondary roads */}
        <line x1="0" y1="150" x2="800" y2="150" stroke="#243456" strokeWidth="2" />
        <line x1="0" y1="250" x2="800" y2="250" stroke="#243456" strokeWidth="2" />
        <line x1="0" y1="350" x2="800" y2="350" stroke="#243456" strokeWidth="2" />
        <line x1="0" y1="450" x2="800" y2="450" stroke="#243456" strokeWidth="2" />
        <line x1="130" y1="0" x2="130" y2="600" stroke="#243456" strokeWidth="2" />
        <line x1="270" y1="0" x2="270" y2="600" stroke="#243456" strokeWidth="2" />
        <line x1="420" y1="0" x2="420" y2="600" stroke="#243456" strokeWidth="2" />
        <line x1="570" y1="0" x2="570" y2="600" stroke="#243456" strokeWidth="2" />
        <line x1="710" y1="0" x2="710" y2="600" stroke="#243456" strokeWidth="2" />

        {/* Diagonal road */}
        <line x1="0" y1="600" x2="350" y2="300" stroke="#2d4070" strokeWidth="5" />
        <line x1="350" y1="300" x2="800" y2="100" stroke="#2d4070" strokeWidth="5" />

        {/* Road labels */}
        <text x="350" y="295" fill="#4a7cdc" fontSize="9" textAnchor="middle" fontFamily="Inter">Maharlika Highway</text>
        <text x="190" y="98" fill="#4a7cdc" fontSize="8" fontFamily="Inter">National Road</text>
        <text x="400" y="298" fill="#4a7cdc" fontSize="8" fontFamily="Inter">Diversion Road</text>

        {/* Heatmap overlay */}
        {layers.heatmap &&
          heatmapZones.map((zone, i) => (
            <ellipse
              key={`heat-zone-${i}`}
              cx={(zone.x / 100) * 800}
              cy={(zone.y / 100) * 600}
              rx={zone.radius}
              ry={zone.radius * 0.75}
              fill={`url(#heat-${i})`}
            />
          ))}

        {/* Danger Zones */}
        {layers.dangerZones &&
          dangerZones.map((zone, i) => (
            <g key={`danger-${i}`}>
              <circle
                cx={(zone.x / 100) * 800}
                cy={(zone.y / 100) * 600}
                r={zone.radius}
                fill={
                  zone.type === 'flood_risk'
                    ? 'url(#floodPattern)'
                    : zone.type === 'fire_hazard'
                    ? 'url(#dangerPattern)'
                    : 'url(#dangerPattern)'
                }
                stroke={
                  zone.type === 'flood_risk'
                    ? '#3B82F6'
                    : zone.type === 'fire_hazard'
                    ? '#F97316'
                    : '#EF4444'
                }
                strokeWidth="1.5"
                strokeDasharray="4 4"
                fillOpacity="0.5"
              />
              <text
                x={(zone.x / 100) * 800}
                y={(zone.y / 100) * 600 - zone.radius - 5}
                fill={
                  zone.type === 'flood_risk'
                    ? '#60A5FA'
                    : zone.type === 'fire_hazard'
                    ? '#FB923C'
                    : '#FCA5A5'
                }
                fontSize="8"
                textAnchor="middle"
                fontFamily="Inter"
              >
                {zone.label}
              </text>
            </g>
          ))}

        {/* Incident Markers */}
        {layers.incidents &&
          visibleIncidents.map((incident, i) => {
            const cx = (incident.coordinates.x / 100) * 800;
            const cy = (incident.coordinates.y / 100) * 600;
            const colors = severityColors[incident.severity];
            const isSelected = selectedIncidentId === incident.id;
            const isHovered = hoveredMarker === incident.id;
            const isActive = isAmbulanceAssigned(incident.status);

            return (
              <g
                key={incident.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onMarkerClick?.(incident.id)}
                onMouseEnter={() => setHoveredMarker(incident.id)}
                onMouseLeave={() => setHoveredMarker(null)}
              >
                {/* Pulse rings for active incidents */}
                {isActive && (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={14 + pulse * 6}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth="1"
                      strokeOpacity={0.6 - pulse * 0.2}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={20 + pulse * 4}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth="0.5"
                      strokeOpacity={0.3 - pulse * 0.1}
                    />
                  </>
                )}

                {/* Marker circle */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected || isHovered ? 12 : 9}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={isSelected ? 3 : 1.5}
                  filter={isActive ? 'url(#glow)' : undefined}
                />

                {/* Marker dot */}
                <circle cx={cx} cy={cy} r="3" fill="white" />

                {/* Tooltip on hover */}
                {(isHovered || isSelected) && (
                  <g>
                    <rect
                      x={cx + 14}
                      y={cy - 20}
                      width="120"
                      height="36"
                      rx="4"
                      fill="#0f172a"
                      stroke={colors.stroke}
                      strokeWidth="1"
                    />
                    <text x={cx + 20} y={cy - 6} fill="white" fontSize="8" fontFamily="Inter" fontWeight="600">
                      {incident.id}
                    </text>
                    <text x={cx + 20} y={cy + 6} fill="#94a3b8" fontSize="7" fontFamily="Inter">
                      {incident.location.substring(0, 20)}...
                    </text>
                    <text x={cx + 20} y={cy + 14} fill={colors.fill} fontSize="7" fontFamily="Inter" fontWeight="600">
                      {incident.status.toUpperCase()}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {/* Compass */}
        <g transform="translate(760, 40)">
          <circle cx="0" cy="0" r="18" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
          <text x="0" y="-6" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="Inter">N</text>
          <path d="M0,-14 L4,-2 L0,-6 L-4,-2 Z" fill="#EF4444" />
          <path d="M0,14 L4,2 L0,6 L-4,2 Z" fill="#94a3b8" />
        </g>

        {/* Scale bar */}
        <g transform="translate(20, 570)">
          <rect x="0" y="0" width="60" height="6" fill="none" stroke="#94a3b8" strokeWidth="1" />
          <rect x="0" y="0" width="30" height="6" fill="#94a3b8" fillOpacity="0.5" />
          <text x="0" y="16" fill="#94a3b8" fontSize="7" fontFamily="Inter">0</text>
          <text x="28" y="16" fill="#94a3b8" fontSize="7" fontFamily="Inter">1km</text>
          <text x="55" y="16" fill="#94a3b8" fontSize="7" fontFamily="Inter">2km</text>
        </g>

        {/* Location label */}
        <text x="400" y="580" fill="#4a7cdc" fontSize="9" textAnchor="middle" fontFamily="Inter" fontWeight="600">
          Echague, Isabela — MDRRMO Monitoring Zone
        </text>
      </svg>

      {/* Map Controls */}
      {showControls && (
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 2))}
            className="w-8 h-8 bg-card/90 border border-border text-foreground rounded flex items-center justify-center hover:bg-secondary text-lg font-bold shadow-sm"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.5))}
            className="w-8 h-8 bg-card/90 border border-border text-foreground rounded flex items-center justify-center hover:bg-secondary text-lg font-bold shadow-sm"
          >
            −
          </button>
        </div>
      )}

      {/* Layer Controls */}
      {showControls && !isPublic && (
        <div className="absolute bottom-3 left-3 bg-card/95 border border-border rounded-lg p-2 text-xs text-foreground space-y-1 shadow-sm">
          <div className="text-muted-foreground mb-1 font-medium">Map Layers</div>
          {Object.entries(layers).map(([key, value]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
                className="accent-blue-500"
              />
              <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
            </label>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-3 left-3 bg-card/95 border border-border rounded-lg p-2 text-xs shadow-sm">
        <div className="text-muted-foreground mb-1 font-medium">Legend</div>
        {Object.entries(severityColors).map(([severity, colors]) => (
          <div key={severity} className="flex items-center gap-2 mb-0.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.fill }} />
            <span className="text-foreground/80 capitalize">{severity}</span>
          </div>
        ))}
        {layers.dangerZones && (
          <>
            <div className="flex items-center gap-2 mb-0.5 mt-1">
              <div className="w-3 h-3 rounded-full border border-dashed border-red-400" />
              <span className="text-foreground/80">Accident Zone</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-dashed border-blue-400" />
              <span className="text-foreground/80">Flood Risk</span>
            </div>
          </>
        )}
      </div>

      {/* Active incidents badge */}
      <div className="absolute top-3 left-1/2 transform -translate-x-1/2 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
        {activeIncidents.length} Active Incidents
      </div>
    </div>
  );
}
