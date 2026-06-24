import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle, MapPin, Flame, Droplets, Car, Heart, Navigation,
  X, ChevronRight, ChevronLeft, Shield, Zap, Clock, Info, Search, RotateCcw,
  Route, Crosshair, Flag, Minus, Plus, Layers, ArrowUp, ArrowRight,
  ArrowLeft, ArrowDown, ChevronDown, ChevronUp, Play, Square,
  Locate, Timer, Milestone
} from 'lucide-react';
import { incidents, heatmapZones, dangerZones } from '../../data/mockData';
import { useTheme } from '../../contexts/ThemeContext';
import { LeafletIncidentMap } from '../../components/map/LeafletIncidentMap';
import { latLngToSvgPoint, svgPointToLatLng } from '../../utils/mapData';
import { ADVISORY_EVENT, loadPublishedAdvisories } from '../../utils/advisoryStorage';
import { isIncidentCompleted, isAmbulanceAssigned } from '../../utils/incidentStatus';

// ─── Echague, Isabela Locations ──────────────────────────────────────────────
const ECHAGUE_LOCATIONS = [
  { id: 'user', name: 'Your Current Location', shortName: 'My Location', x: 445, y: 310, type: 'user' },
  { id: 'muni', name: 'Municipal Hall, Echague', shortName: 'Municipal Hall', x: 450, y: 285, type: 'landmark' },
  { id: 'isu', name: 'Isabela State University (ISU)', shortName: 'ISU Echague', x: 195, y: 415, type: 'landmark' },
  { id: 'market', name: 'Echague Public Market', shortName: 'Public Market', x: 432, y: 355, type: 'landmark' },
  { id: 'hospital', name: 'Echague District Hospital', shortName: 'District Hospital', x: 385, y: 215, type: 'hospital' },
  { id: 'mh_north', name: 'Maharlika Highway, Km. 280 (North)', shortName: 'MH Km.280 North', x: 425, y: 80, type: 'road' },
  { id: 'mh_south', name: 'Maharlika Highway, Brgy. Sto. Tomas', shortName: 'MH Sto. Tomas', x: 418, y: 165, type: 'road' },
  { id: 'brgy_sf', name: 'Brgy. San Fabian, Echague', shortName: 'San Fabian', x: 590, y: 235, type: 'barangay' },
  { id: 'brgy_ping', name: 'Brgy. Pingkian, Echague', shortName: 'Pingkian', x: 300, y: 455, type: 'barangay' },
  { id: 'brgy_aurora', name: 'Brgy. Doña Aurora, Echague', shortName: 'Doña Aurora', x: 510, y: 425, type: 'barangay' },
  { id: 'brgy_mallig', name: 'Brgy. Mallig, Echague', shortName: 'Mallig', x: 145, y: 528, type: 'barangay' },
  { id: 'brgy_sj', name: 'Brgy. San Juan (ISU Area)', shortName: 'San Juan', x: 278, y: 388, type: 'barangay' },
  { id: 'brgy_pob_n', name: 'Brgy. Poblacion Norte, Echague', shortName: 'Poblacion Norte', x: 468, y: 315, type: 'barangay' },
  { id: 'brgy_pob_s', name: 'Brgy. Poblacion Sur, Echague', shortName: 'Poblacion Sur', x: 455, y: 345, type: 'barangay' },
  { id: 'brgy_gum', name: 'Brgy. Gumbauan (Pinacanauan Bridge)', shortName: 'Gumbauan Bridge', x: 688, y: 295, type: 'barangay' },
  { id: 'brgy_ragan', name: 'Brgy. Ragan Norte, Echague', shortName: 'Ragan Norte', x: 718, y: 395, type: 'barangay' },
  { id: 'brgy_calog', name: 'Brgy. Calog Norte, Echague', shortName: 'Calog Norte', x: 488, y: 478, type: 'barangay' },
  { id: 'cvr', name: 'Cagayan Valley Road Junction', shortName: 'CVR Junction', x: 330, y: 195, type: 'road' },
];

// ─── Road Network Nodes (for routing) ────────────────────────────────────────
const ROAD_NODES = [
  // Maharlika Highway (vertical, slightly angled)
  { id: 'mh0', x: 428, y: 50 },
  { id: 'mh1', x: 426, y: 130 },
  { id: 'mh2', x: 422, y: 200 },
  { id: 'mh3', x: 418, y: 270 },
  { id: 'mh4', x: 415, y: 340 },  // Main intersection
  { id: 'mh5', x: 412, y: 420 },
  { id: 'mh6', x: 408, y: 500 },
  { id: 'mh7', x: 405, y: 580 },
  // E-W Road 1 (through town center)
  { id: 'ew1_0', x: 100, y: 270 },
  { id: 'ew1_1', x: 220, y: 272 },
  { id: 'ew1_2', x: 340, y: 274 },
  { id: 'ew1_3', x: 418, y: 270 }, // mh3
  { id: 'ew1_4', x: 520, y: 265 },
  { id: 'ew1_5', x: 640, y: 260 },
  { id: 'ew1_6', x: 760, y: 255 },
  // ISU Road (goes west from MH to ISU)
  { id: 'isu0', x: 415, y: 340 }, // mh4
  { id: 'isu1', x: 360, y: 370 },
  { id: 'isu2', x: 295, y: 390 },
  { id: 'isu3', x: 220, y: 405 },
  { id: 'isu4', x: 195, y: 415 }, // ISU
  // E-W Road 2 (southern route)
  { id: 'ew2_0', x: 80, y: 420 },
  { id: 'ew2_1', x: 200, y: 418 },
  { id: 'ew2_2', x: 320, y: 416 },
  { id: 'ew2_3', x: 412, y: 420 }, // mh5
  { id: 'ew2_4', x: 530, y: 422 },
  { id: 'ew2_5', x: 660, y: 425 },
  { id: 'ew2_6', x: 760, y: 428 },
  // CVR branch
  { id: 'cvr0', x: 422, y: 200 }, // mh2
  { id: 'cvr1', x: 375, y: 198 },
  { id: 'cvr2', x: 330, y: 195 },
  { id: 'cvr3', x: 250, y: 192 },
];

// AI alerts (Echague-specific)
const aiAlerts = [
  {
    id: 1,
    type: 'accident',
    message: '⚠ Accident-prone area ahead — 300 meters',
    sublabel: 'Maharlika Highway, Sto. Tomas Junction — High risk zone',
    severity: 'critical',
    distance: '300m',
  },
  {
    id: 2,
    type: 'flood',
    message: '💧 Flood risk zone detected — Pinacanauan River',
    sublabel: 'Ragan Norte / Calog Norte — Exercise extreme caution',
    severity: 'warning',
    distance: '600m',
  },
  {
    id: 3,
    type: 'hazard',
    message: '🔶 Road closure ahead — ISU Road',
    sublabel: 'Near Echague District Hospital — Seek alternate route',
    severity: 'moderate',
    distance: '500m',
  },
];

const severityColors = {
  critical: '#EF4444',
  warning: '#F97316',
  moderate: '#EAB308',
  resolved: '#22C55E',
};

const advisoryCategoryLabels = {
  flood: 'Flood',
  road_closure: 'Road Closure',
  weather: 'Weather',
  general: 'General',
};

const typeIcons = {
  vehicular: Car, fire: Flame, medical: Heart,
  flood: Droplets, crime: AlertTriangle, other: AlertTriangle,
};

// ─── Route Generation ─────────────────────────────────────────────────────────
function generateRoute(from, to) {
  // Find the nearest highway nodes and generate a path through the road network
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const distKm = (dist * 0.08).toFixed(1); // scale factor for Echague
  const durationMin = Math.max(3, Math.round(dist * 0.05));

  // Build waypoints that follow roads
  const waypoints = [];
  waypoints.push({ x: from.x, y: from.y });

  // Snap to nearest Maharlika Highway x (~420) and navigate through intersections
  const mhX = 418;

  // Generate a realistic L-shaped/Z-shaped route that follows roads
  if (Math.abs(from.x - mhX) > 50 || Math.abs(to.x - mhX) > 50) {
    // Route that goes to MH, up/down MH, then to destination
    // Step 1: Go towards MH
    const nearestMhY = Math.round(from.y / 80) * 80 + 10;
    waypoints.push({ x: mhX + (from.x > mhX ? 30 : -30), y: from.y });
    waypoints.push({ x: mhX + (from.x > mhX ? 30 : -30), y: nearestMhY });
    waypoints.push({ x: mhX, y: nearestMhY });

    // Step 2: Travel along MH
    const targetMhY = Math.round(to.y / 80) * 80 + 10;
    if (Math.abs(targetMhY - nearestMhY) > 20) {
      waypoints.push({ x: mhX, y: Math.round((nearestMhY + targetMhY) / 2) });
    }
    waypoints.push({ x: mhX, y: targetMhY });

    // Step 3: Branch to destination
    waypoints.push({ x: mhX + (to.x > mhX ? 30 : -30), y: targetMhY });
    waypoints.push({ x: to.x, y: to.y });
  } else {
    // Simple route along MH
    const midPointY = (from.y + to.y) / 2;
    waypoints.push({ x: mhX, y: from.y });
    waypoints.push({ x: mhX, y: midPointY });
    waypoints.push({ x: mhX, y: to.y });
    waypoints.push({ x: to.x, y: to.y });
  }

  // Build smooth SVG path using cubic bezier curves
  const pathParts = [`M ${waypoints[0].x} ${waypoints[0].y}`];
  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const cpX = (prev.x + curr.x) / 2;
    const cpY = (prev.y + curr.y) / 2;
    if (i === 1) {
      pathParts.push(`Q ${cpX} ${cpY} ${curr.x} ${curr.y}`);
    } else {
      const prevPrev = waypoints[i - 2];
      const cp1X = (prevPrev.x + prev.x) / 2;
      const cp1Y = (prevPrev.y + prev.y) / 2;
      const cp2X = cpX;
      const cp2Y = cpY;
      pathParts.push(`C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${curr.x} ${curr.y}`);
    }
  }
  const svgPath = pathParts.join(' ');

  // Check for nearby incidents along route
  const routeIncidents = incidents.filter(inc => {
    if (isIncidentCompleted(inc.status)) return false;
    const ix = (inc.coordinates.x / 100) * 900;
    const iy = (inc.coordinates.y / 100) * 650;
    // Check if incident is near any waypoint
    return waypoints.some(wp => {
      const dist = Math.sqrt((wp.x - ix) ** 2 + (wp.y - iy) ** 2);
      return dist < 80;
    });
  });

  // Generate turn-by-turn steps
  const steps = [];
  const isuBound = to.x < 300;
  const northBound = to.y < from.y;

  steps.push({
    instruction: `Head ${northBound ? 'north' : 'south'} on ${Math.abs(from.x - mhX) > 60 ? 'local road towards' : ''} Maharlika Highway`,
    distance: '0.3 km',
    icon: northBound ? ArrowUp : ArrowDown,
  });

  if (Math.abs(from.x - mhX) > 50) {
    steps.push({
      instruction: `Turn ${from.x > mhX ? 'left' : 'right'} onto Maharlika Highway`,
      distance: '0.2 km',
      icon: from.x > mhX ? ArrowLeft : ArrowRight,
    });
  }

  if (isuBound) {
    steps.push({
      instruction: 'Turn left onto ISU Road / Brgy. San Juan',
      distance: '1.2 km',
      icon: ArrowLeft,
    });
    steps.push({
      instruction: 'Continue straight to ISU Campus',
      distance: '0.5 km',
      icon: ArrowUp,
    });
  } else if (Math.abs(to.x - mhX) > 50) {
    steps.push({
      instruction: `Continue ${northBound ? 'north' : 'south'} along Maharlika Highway`,
      distance: `${(dist * 0.05).toFixed(1)} km`,
      icon: northBound ? ArrowUp : ArrowDown,
    });
    steps.push({
      instruction: `Turn ${to.x > mhX ? 'right' : 'left'} towards ${to.shortName}`,
      distance: '0.4 km',
      icon: to.x > mhX ? ArrowRight : ArrowLeft,
    });
  } else {
    steps.push({
      instruction: `Continue ${northBound ? 'north' : 'south'} on Maharlika Highway`,
      distance: `${(dist * 0.06).toFixed(1)} km`,
      icon: northBound ? ArrowUp : ArrowDown,
    });
  }

  steps.push({
    instruction: `Arrive at ${to.shortName}`,
    distance: 'Destination',
    icon: Flag,
  });

  return {
    distance: `${distKm} km`,
    duration: `${durationMin} min`,
    steps,
    path: svgPath,
    waypoints,
    hasIncidentWarning: routeIncidents.length > 0,
    incidentWarnings: routeIncidents.map(i => i.location),
  };
}

// ─── Arrow Helper ─────────────────────────────────────────────────────────────
function getArrowAtPosition(from, to, t) {
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
  return { x, y, angle };
}

// ─── Echague SVG Map Component ────────────────────────────────────────────────
function EchagueMapSVG({
  isDarkMode,
  selectedIncident,
  onIncidentClick,
  fromPin,
  toPin,
  route,
  showRoute,
  onMapClick,
  draggingPin,
  onPinDragStart,
}) {
  const svgRef = useRef(null);
  const pulse = 0;

  // Colors based on theme
  const bg = isDarkMode ? '#0f172a' : '#e8f0f7';
  const blockFill = isDarkMode ? '#1e293b' : '#f0f6ff';
  const blockStroke = isDarkMode ? '#334155' : '#c8d8ea';
  const roadMain = isDarkMode ? '#334155' : '#b0c4d8';
  const roadHighway = isDarkMode ? '#64748b' : '#78909c';
  const roadSecondary = isDarkMode ? '#1e293b' : '#d0dcec';
  const roadLabel = isDarkMode ? '#94a3b8' : '#546e7a';
  const riverFill = isDarkMode ? '#1e3a5f' : '#bfdbfe';
  const riverFillInner = isDarkMode ? '#1d4ed8' : '#93c5fd';
  const parkFill = isDarkMode ? '#14532d' : '#d1fae5';
  const parkStroke = isDarkMode ? '#166534' : '#6ee7b7';
  const riceFieldFill = isDarkMode ? '#1a3a1a' : '#dcfce7';
  const riceFieldStroke = isDarkMode ? '#166534' : '#86efac';
  const labelColor = isDarkMode ? '#94a3b8' : '#4b6584';
  const youAreHere = isDarkMode ? '#3b82f6' : '#2563eb';

  const handleSvgClick = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 900 / rect.width;
    const scaleY = 650 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    onMapClick(x, y);
  };

  // Route direction arrows (placed along waypoints)
  const routeArrows = route && showRoute && route.waypoints.length > 1
    ? route.waypoints.slice(0, -1).map((wp, i) => {
        const next = route.waypoints[i + 1];
        return getArrowAtPosition(wp, next, 0.5);
      })
    : [];

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 900 650"
      className="absolute inset-0 w-full h-full"
      style={{ background: bg, cursor: draggingPin ? 'grabbing' : 'crosshair' }}
      onClick={handleSvgClick}
    >
      <defs>
        {/* Animated route gradient */}
        <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#6366F1" stopOpacity="1" />
          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.8" />
        </linearGradient>
        {/* Heatmap gradients */}
        {heatmapZones.map((zone, i) => (
          <radialGradient key={i} id={`heat-${i}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#EF4444" stopOpacity={zone.intensity * 0.45} />
            <stop offset="60%" stopColor="#F97316" stopOpacity={zone.intensity * 0.2} />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0" />
          </radialGradient>
        ))}
        <filter id="shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.25" />
        </filter>
        <filter id="pinShadow">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodOpacity="0.4" />
        </filter>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L0,8 L8,4 z" fill="#3B82F6" fillOpacity="0.9" />
        </marker>
      </defs>

      {/* ── Base Terrain (Rice fields / flat valley) ── */}
      <rect width="900" height="650" fill={bg} />
      {/* Rice field patches */}
      {[
        [0, 0, 160, 650], [760, 0, 140, 450], [0, 500, 160, 150],
        [760, 450, 140, 200], [200, 530, 200, 120], [500, 540, 160, 110],
      ].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={riceFieldFill} opacity="0.5" />
      ))}
      {/* Rice field grid lines */}
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={`rf-h-${i}`} x1="0" y1={540 + i * 20} x2="160" y2={540 + i * 20} stroke={riceFieldStroke} strokeWidth="0.4" opacity="0.4" />
      ))}

      {/* ── City Blocks (Town Proper) ── */}
      {[
        [250, 200, 80, 55], [340, 200, 70, 55], [420, 200, 65, 55],
        [250, 265, 80, 55], [340, 265, 70, 55], [420, 265, 65, 55],
        [250, 330, 80, 55], [340, 330, 70, 55], [420, 330, 65, 55],
        [250, 395, 80, 55], [340, 395, 70, 55], [420, 395, 65, 55],
        [160, 265, 75, 55], [160, 330, 75, 55], [160, 395, 75, 55],
        [495, 200, 75, 55], [495, 265, 75, 55], [495, 330, 75, 55], [495, 395, 75, 55],
        [580, 200, 65, 55], [580, 265, 65, 55], [580, 330, 65, 55],
        [655, 200, 60, 55], [655, 265, 60, 55],
      ].map(([x, y, w, h], i) => (
        <rect key={`blk-${i}`} x={x} y={y} width={w} height={h} rx="4" fill={blockFill} stroke={blockStroke} strokeWidth="0.6" />
      ))}

      {/* ── Parks & Green Spaces ── */}
      <rect x="452" y="278" width="35" height="25" rx="3" fill={parkFill} stroke={parkStroke} strokeWidth="0.8" />
      <text x="469" y="293" fill={parkFill === '#d1fae5' ? '#16a34a' : '#86efac'} fontSize="6" textAnchor="middle" fontFamily="Inter" fontWeight="600">PARK</text>
      <rect x="180" y="380" width="65" height="50" rx="6" fill={parkFill} stroke={parkStroke} strokeWidth="0.8" />
      <text x="212" y="408" fill={parkFill === '#d1fae5' ? '#16a34a' : '#86efac'} fontSize="6.5" textAnchor="middle" fontFamily="Inter" fontWeight="600">ISU</text>
      <text x="212" y="417" fill={parkFill === '#d1fae5' ? '#16a34a' : '#86efac'} fontSize="6" textAnchor="middle" fontFamily="Inter">CAMPUS</text>
      {/* Smaller parks */}
      <ellipse cx="320" cy="460" rx="35" ry="22" fill={parkFill} stroke={parkStroke} strokeWidth="0.6" opacity="0.7" />
      <ellipse cx="600" cy="490" rx="28" ry="18" fill={parkFill} stroke={parkStroke} strokeWidth="0.6" opacity="0.7" />

      {/* ── Pinacanauan River (right side, flowing N-S) ── */}
      <path
        d="M760,0 Q768,80 755,160 Q742,240 760,300 Q778,360 755,430 Q732,500 750,580 Q762,620 755,650"
        fill="none" stroke={riverFill} strokeWidth="32" strokeOpacity="0.85"
      />
      <path
        d="M760,0 Q768,80 755,160 Q742,240 760,300 Q778,360 755,430 Q732,500 750,580 Q762,620 755,650"
        fill="none" stroke={riverFillInner} strokeWidth="16" strokeOpacity="0.6"
      />
      <text x="770" y="310" fill={isDarkMode ? '#60a5fa' : '#3b82f6'} fontSize="9" fontFamily="Inter" fontWeight="600" transform="rotate(90 770 310)">Pinacanauan River</text>

      {/* ── Main Highways ── */}
      {/* Maharlika Highway (slight diagonal N-S) */}
      <path d="M430,0 L428,100 L424,200 L419,300 L416,400 L413,500 L410,600 L408,650"
        fill="none" stroke={roadHighway} strokeWidth="14" strokeLinecap="round" />
      <path d="M430,0 L428,100 L424,200 L419,300 L416,400 L413,500 L410,600 L408,650"
        fill="none" stroke={isDarkMode ? '#64748b' : '#a0b4c8'} strokeWidth="10" strokeLinecap="round" />
      {/* Center line dashes */}
      <path d="M430,0 L428,100 L424,200 L419,300 L416,400 L413,500 L410,600 L408,650"
        fill="none" stroke={isDarkMode ? '#94a3b8' : '#fff'} strokeWidth="1.5"
        strokeDasharray="20 15" strokeLinecap="round" opacity="0.6" />

      {/* ── Primary Roads ── */}
      {/* E-W Road through town (at y~270) */}
      <path d="M80,272 L200,271 L340,270 L419,270 L520,268 L660,265 L760,262"
        fill="none" stroke={roadMain} strokeWidth="9" strokeLinecap="round" />
      <path d="M80,272 L200,271 L340,270 L419,270 L520,268 L660,265 L760,262"
        fill="none" stroke={isDarkMode ? '#475569' : '#c0d0e0'} strokeWidth="6" strokeLinecap="round" />

      {/* ISU Road (E-W at y~390) */}
      <path d="M80,392 L180,390 L295,390 L365,388 L415,386 L510,384 L660,382 L760,380"
        fill="none" stroke={roadMain} strokeWidth="8" strokeLinecap="round" />
      <path d="M80,392 L180,390 L295,390 L365,388 L415,386 L510,384 L660,382 L760,380"
        fill="none" stroke={isDarkMode ? '#475569' : '#c0d0e0'} strokeWidth="5" strokeLinecap="round" />

      {/* CVR Branch (diagonal from MH at y=200 going NW) */}
      <path d="M424,200 L375,198 L330,195 L250,192 L160,190 L80,188"
        fill="none" stroke={roadMain} strokeWidth="8" strokeLinecap="round" />

      {/* ── Secondary Roads ── */}
      {[
        "M250,200 L250,460", "M340,200 L340,460", "M500,200 L500,460",
        "M580,200 L580,400", "M655,200 L655,340",
        "M160,265 L160,460", "M80,265 L250,265", "M80,330 L750,330",
        "M80,460 L750,460", "M250,500 L500,500",
        "M690,0 L688,300 L685,420 L680,540",  // bridge road
      ].map((d, i) => (
        <path key={`sec-${i}`} d={d} fill="none" stroke={roadSecondary} strokeWidth="4" strokeLinecap="round" />
      ))}

      {/* ── Road Labels ── */}
      <text x="420" y="140" fill={roadLabel} fontSize="8.5" textAnchor="middle" fontFamily="Inter" fontWeight="700" transform="rotate(1.5 420 140)">MAHARLIKA HIGHWAY</text>
      <text x="230" y="264" fill={roadLabel} fontSize="7.5" fontFamily="Inter" fontWeight="600">Town Proper Road</text>
      <text x="230" y="385" fill={roadLabel} fontSize="7" fontFamily="Inter" fontWeight="600">ISU Road / Brgy. San Juan</text>
      <text x="155" y="185" fill={roadLabel} fontSize="7" fontFamily="Inter">Cagayan Valley Road</text>

      {/* ── Landmark Icons ── */}
      {/* Municipal Hall */}
      <g>
        <rect x="436" y="272" width="28" height="22" rx="2" fill={isDarkMode ? '#1e40af' : '#3b82f6'} opacity="0.2" />
        <text x="450" y="287" fill={isDarkMode ? '#93c5fd' : '#1d4ed8'} fontSize="7.5" textAnchor="middle" fontFamily="Inter" fontWeight="700">🏛️</text>
        <text x="450" y="260" fill={labelColor} fontSize="7" textAnchor="middle" fontFamily="Inter" fontWeight="600">Municipal Hall</text>
      </g>
      {/* Hospital */}
      <g>
        <rect x="372" y="204" width="26" height="20" rx="2" fill={isDarkMode ? '#7f1d1d' : '#fee2e2'} opacity="0.8" />
        <text x="385" y="218" fill={isDarkMode ? '#fca5a5' : '#dc2626'} fontSize="8" textAnchor="middle" fontFamily="Inter" fontWeight="800">+</text>
        <text x="385" y="198" fill={labelColor} fontSize="7" textAnchor="middle" fontFamily="Inter" fontWeight="600">District Hospital</text>
      </g>
      {/* ISU Campus Label */}
      <text x="195" y="448" fill={labelColor} fontSize="7.5" textAnchor="middle" fontFamily="Inter" fontWeight="700">ISABELA STATE</text>
      <text x="195" y="458" fill={labelColor} fontSize="7.5" textAnchor="middle" fontFamily="Inter" fontWeight="700">UNIVERSITY</text>

      {/* Pinacanauan Bridge */}
      <rect x="676" y="286" width="22" height="12" rx="2" fill={isDarkMode ? '#374151' : '#9ca3af'} />
      <text x="687" y="281" fill={labelColor} fontSize="6.5" textAnchor="middle" fontFamily="Inter">Bridge</text>

      {/* ── Heatmap overlays ── */}
      {heatmapZones.map((zone, i) => (
        <ellipse
          key={`heat-${i}`}
          cx={(zone.x / 100) * 900}
          cy={(zone.y / 100) * 650}
          rx={zone.radius * 0.9}
          ry={zone.radius * 0.7}
          fill={`url(#heat-${i})`}
        />
      ))}

      {/* ── Danger Zones ── */}
      {dangerZones.map((zone, i) => (
        <g key={`dz-${i}`}>
          <circle
            cx={(zone.x / 100) * 900}
            cy={(zone.y / 100) * 650}
            r={zone.radius}
            fill={zone.type === 'flood_risk' ? 'rgba(59,130,246,0.07)' : 'rgba(239,68,68,0.07)'}
            stroke={zone.type === 'flood_risk' ? (isDarkMode ? '#60a5fa' : '#93c5fd') : (isDarkMode ? '#f87171' : '#fca5a5')}
            strokeWidth="1.5"
            strokeDasharray="6 3"
          />
          <text
            x={(zone.x / 100) * 900}
            y={(zone.y / 100) * 650 - zone.radius - 4}
            fill={zone.type === 'flood_risk' ? (isDarkMode ? '#60a5fa' : '#2563eb') : (isDarkMode ? '#f87171' : '#dc2626')}
            fontSize="7"
            textAnchor="middle"
            fontFamily="Inter"
            fontWeight="600"
          >
            {zone.label}
          </text>
        </g>
      ))}

      {/* ── AI Warning Zones ── */}
      <g opacity="0.75">
        <circle cx={378} cy={228} r="28" fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5 2" />
        <text x="378" y="216" fill="#ef4444" fontSize="7.5" textAnchor="middle" fontFamily="Inter" fontWeight="700">⚠ HIGH RISK</text>
      </g>

      {/* ── Navigation Route ── */}
      {showRoute && route && (
        <g>
          {/* Route shadow/glow */}
          <path
            d={route.path}
            fill="none"
            stroke={isDarkMode ? '#3b82f6' : '#2563eb'}
            strokeWidth="10"
            strokeOpacity="0.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Main route line */}
          <path
            d={route.path}
            fill="none"
            stroke={isDarkMode ? '#60a5fa' : '#3b82f6'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Animated dash overlay */}
          <path
            d={route.path}
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="12 18"
            strokeOpacity="0.7"
            style={{ strokeDashoffset: 0 }}
          >
            <animate attributeName="stroke-dashoffset" from="30" to="0" dur="1.5s" repeatCount="indefinite" />
          </path>

          {/* Direction arrows along route */}
          {routeArrows.map((arrow, i) => (
            <g key={`arrow-${i}`} transform={`translate(${arrow.x},${arrow.y}) rotate(${arrow.angle})`}>
              <polygon
                points="-6,-4 6,0 -6,4"
                fill={isDarkMode ? '#93c5fd' : '#2563eb'}
                opacity="0.85"
              />
            </g>
          ))}
        </g>
      )}

      {/* ── Your Location Marker ── */}
      {!fromPin && (
        <g>
          <circle cx={445} cy={310} r={12 + pulse * 4} fill={youAreHere} fillOpacity={0.15 - pulse * 0.04} />
          <circle cx={445} cy={310} r={10} fill={youAreHere} filter="url(#shadow)" />
          <circle cx={445} cy={310} r={4} fill="white" />
          <text x="461" y="306" fill={isDarkMode ? '#93c5fd' : '#1d4ed8'} fontSize="8" fontFamily="Inter" fontWeight="600">You</text>
        </g>
      )}

      {/* ── Navigation Pins ── */}
      {fromPin && (
        <g
          style={{ cursor: 'grab' }}
          onMouseDown={(e) => { e.stopPropagation(); onPinDragStart('from'); }}
        >
          {/* Pulse ring */}
          <circle cx={fromPin.x} cy={fromPin.y} r={16 + pulse * 4} fill="#22c55e" fillOpacity={0.15 - pulse * 0.04} />
          {/* Pin body */}
          <ellipse cx={fromPin.x} cy={fromPin.y - 2} rx="16" ry="18" fill="#22c55e" filter="url(#pinShadow)" />
          <ellipse cx={fromPin.x} cy={fromPin.y - 2} rx="12" ry="13" fill="#16a34a" />
          {/* Letter */}
          <text x={fromPin.x} y={fromPin.y + 3} fill="white" fontSize="12" textAnchor="middle" fontFamily="Inter" fontWeight="800">A</text>
          {/* Pointer tip */}
          <polygon points={`${fromPin.x - 5},${fromPin.y + 14} ${fromPin.x + 5},${fromPin.y + 14} ${fromPin.x},${fromPin.y + 24}`} fill="#22c55e" />
          {/* Label */}
          <rect x={fromPin.x - 50} y={fromPin.y - 42} width="100" height="18" rx="4" fill={isDarkMode ? '#166534' : '#dcfce7'} stroke="#22c55e" strokeWidth="1" />
          <text x={fromPin.x} y={fromPin.y - 29} fill={isDarkMode ? '#86efac' : '#166534'} fontSize="8" textAnchor="middle" fontFamily="Inter" fontWeight="600">
            {fromPin.shortName.length > 14 ? fromPin.shortName.slice(0, 13) + '…' : fromPin.shortName}
          </text>
        </g>
      )}

      {toPin && (
        <g
          style={{ cursor: 'grab' }}
          onMouseDown={(e) => { e.stopPropagation(); onPinDragStart('to'); }}
        >
          {/* Pin body */}
          <ellipse cx={toPin.x} cy={toPin.y - 2} rx="16" ry="18" fill="#ef4444" filter="url(#pinShadow)" />
          <ellipse cx={toPin.x} cy={toPin.y - 2} rx="12" ry="13" fill="#dc2626" />
          {/* Letter */}
          <text x={toPin.x} y={toPin.y + 3} fill="white" fontSize="12" textAnchor="middle" fontFamily="Inter" fontWeight="800">B</text>
          {/* Pointer tip */}
          <polygon points={`${toPin.x - 5},${toPin.y + 14} ${toPin.x + 5},${toPin.y + 14} ${toPin.x},${toPin.y + 24}`} fill="#ef4444" />
          {/* Label */}
          <rect x={toPin.x - 50} y={toPin.y - 42} width="100" height="18" rx="4" fill={isDarkMode ? '#7f1d1d' : '#fee2e2'} stroke="#ef4444" strokeWidth="1" />
          <text x={toPin.x} y={toPin.y - 29} fill={isDarkMode ? '#fca5a5' : '#991b1b'} fontSize="8" textAnchor="middle" fontFamily="Inter" fontWeight="600">
            {toPin.shortName.length > 14 ? toPin.shortName.slice(0, 13) + '…' : toPin.shortName}
          </text>
        </g>
      )}

      {/* ── Incident Markers ── */}
      {incidents.filter(i => !isIncidentCompleted(i.status)).map((incident) => {
        const cx = (incident.coordinates.x / 100) * 900;
        const cy = (incident.coordinates.y / 100) * 650;
        const color = severityColors[incident.severity];
        const isSelected = selectedIncident === incident.id;
        const isActive = isAmbulanceAssigned(incident.status);

        return (
          <g key={incident.id} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onIncidentClick(incident.id); }}>
            {isActive && (
              <circle cx={cx} cy={cy} r={14 + pulse * 5} fill={color} fillOpacity={0.12 - pulse * 0.03} />
            )}
            <circle cx={cx} cy={cy} r={isSelected ? 13 : 9} fill={color} stroke="white" strokeWidth="2.5" filter="url(#shadow)" />
            <circle cx={cx} cy={cy} r="3" fill="white" />
            {isSelected && (
              <circle cx={cx} cy={cy} r="17" fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
            )}
          </g>
        );
      })}

      {/* ── Location label ── */}
      <text x="450" y="640" fill={isDarkMode ? '#475569' : '#94a3b8'} fontSize="9" textAnchor="middle" fontFamily="Inter" fontWeight="500">
        Echague, Isabela — Live Safety Navigation Map
      </text>
    </svg>
  );
}

// ─── Location Search Input ────────────────────────────────────────────────────
function LocationSearchInput({
  label,
  value,
  onChange,
  placeholder,
  pinColor,
  isDarkMode,
}) {
  const [inputText, setInputText] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = ECHAGUE_LOCATIONS.filter(
    loc => loc.name.toLowerCase().includes(inputText.toLowerCase()) ||
           loc.shortName.toLowerCase().includes(inputText.toLowerCase())
  ).slice(0, 6);

  useEffect(() => { setInputText(value); }, [value]);

  return (
    <div className="relative">
      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</label>
      <div className="relative">
        <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center shrink-0`} style={{ background: pinColor }}>
          <span className="text-white text-[9px] font-bold">{label === 'From' ? 'A' : 'B'}</span>
        </div>
        <input
          type="text"
          value={inputText}
          onChange={e => {
            setInputText(e.target.value);
            setShowDropdown(true);
            if (!e.target.value) onChange(null, '');
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder={placeholder}
          className="w-full pl-10 pr-9 py-2.5 bg-input-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
        />
        {inputText && (
          <button
            onClick={() => { setInputText(''); onChange(null, ''); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown suggestions */}
      {showDropdown && inputText.length > 0 && filtered.length > 0 && (
        <div className={`absolute top-full left-0 right-0 mt-1 z-50 rounded-xl border border-border overflow-hidden shadow-xl ${isDarkMode ? 'bg-card' : 'bg-white'}`}>
          {filtered.map(loc => (
            <button
              key={loc.id}
              onMouseDown={() => {
                setInputText(loc.name);
                setShowDropdown(false);
                onChange(loc, loc.name);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center bg-secondary">
                <span className="text-xs">
                  {loc.type === 'hospital' ? '🏥' :
                   loc.type === 'user' ? '📍' :
                   loc.type === 'road' ? '🛣️' :
                   loc.type === 'barangay' ? '🏘️' : '🏛️'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{loc.name}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{loc.type}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main PublicMap Component ─────────────────────────────────────────────────
export default function PublicMap() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  // Navigation state
  const [fromLocation, setFromLocation] = useState(null);
  const [toLocation, setToLocation] = useState(null);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [route, setRoute] = useState(null);
  const [showRoute, setShowRoute] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [navMode, setNavMode] = useState('idle');
  const [pendingPin, setPendingPin] = useState(null);
  const [showDirections, setShowDirections] = useState(false);
  const [navPanelOpen, setNavPanelOpen] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [guidanceIndex, setGuidanceIndex] = useState(0);

  // Incident state
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [activeAlert, setActiveAlert] = useState(0);
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [showSafetyInfo, setShowSafetyInfo] = useState(false);
  const [showIncidentPanel, setShowIncidentPanel] = useState(true);
  const [publicAdvisories, setPublicAdvisories] = useState(() => loadPublishedAdvisories());
  const [selectedAdvisory, setSelectedAdvisory] = useState(null);

  useEffect(() => {
    const refreshAdvisories = () => setPublicAdvisories(loadPublishedAdvisories());
    window.addEventListener('storage', refreshAdvisories);
    window.addEventListener(ADVISORY_EVENT, refreshAdvisories);
    return () => {
      window.removeEventListener('storage', refreshAdvisories);
      window.removeEventListener(ADVISORY_EVENT, refreshAdvisories);
    };
  }, []);

  // AI alert cycling
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveAlert(a => {
        const next = a === null ? 0 : (a + 1) % aiAlerts.length;
        return dismissedAlerts.includes(next) ? null : next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [dismissedAlerts]);

  // Click on map to place pin
  const handleMapClick = (svgX, svgY) => {
    if (pendingPin) {
      // Find nearest named location
      const nearest = ECHAGUE_LOCATIONS.reduce((closest, loc) => {
        const d = Math.sqrt((loc.x - svgX) ** 2 + (loc.y - svgY) ** 2);
        const closestD = Math.sqrt((closest.x - svgX) ** 2 + (closest.y - svgY) ** 2);
        return d < closestD ? loc : closest;
      }, ECHAGUE_LOCATIONS[0]);

      // Use nearest if close enough, otherwise create custom point
      const useNearest = Math.sqrt((nearest.x - svgX) ** 2 + (nearest.y - svgY) ** 2) < 60;
      const pinLoc = useNearest ? nearest : {
        id: `custom_${pendingPin}`,
        name: `Custom Point (${Math.round(svgX)},${Math.round(svgY)})`,
        shortName: 'Custom Point',
        x: svgX, y: svgY,
        type: 'landmark',
      };

      if (pendingPin === 'from') {
        setFromLocation(pinLoc);
        setFromText(pinLoc.name);
      } else {
        setToLocation(pinLoc);
        setToText(pinLoc.name);
      }
      setPendingPin(null);
    }
  };

  const handleLeafletMapClick = (latlng) => {
    if (!pendingPin) return;
    const point = latLngToSvgPoint(latlng);
    handleMapClick(point.x, point.y);
  };

  const handleIncidentClick = (id) => {
    setSelectedIncident(current => current === id ? null : id);
    setSelectedAdvisory(null);
    setShowIncidentPanel(true);
  };

  const handleAdvisoryClick = (id) => {
    setSelectedAdvisory(current => current === id ? null : id);
    setSelectedIncident(null);
  };

  // Calculate route
  const handleGetRoute = async () => {
    if (!fromLocation || !toLocation) return;
    setIsCalculating(true);
    setShowRoute(false);
    await new Promise(r => setTimeout(r, 900)); // Simulate calc delay
    const r = generateRoute(fromLocation, toLocation);
    setRoute(r);
    setShowRoute(true);
    setGuidanceIndex(0);
    setIsCalculating(false);
    setNavMode('routing');
    setShowDirections(true);
  };

  // Reset navigation
  const handleReset = () => {
    setFromLocation(null);
    setToLocation(null);
    setFromText('');
    setToText('');
    setRoute(null);
    setShowRoute(false);
    setGuidanceIndex(0);
    setNavMode('idle');
    setPendingPin(null);
    setShowDirections(false);
  };

  // Swap from/to
  const handleSwap = () => {
    const tmpLoc = fromLocation;
    const tmpText = fromText;
    setFromLocation(toLocation);
    setFromText(toText);
    setToLocation(tmpLoc);
    setToText(tmpText);
    if (route) setRoute(generateRoute(toLocation, fromLocation));
  };

  const selectedInc = incidents.find(i => i.id === selectedIncident);
  const selectedAdvisoryRecord = publicAdvisories.find(advisory => advisory.id === selectedAdvisory);
  const currentAlert = activeAlert !== null ? aiAlerts[activeAlert] : null;
  const activeIncidents = incidents.filter(i => !isIncidentCompleted(i.status));
  const currentGuidance = route?.steps?.[guidanceIndex] || route?.steps?.[0] || null;
  const nextGuidance = route?.steps?.[guidanceIndex + 1] || null;
  useEffect(() => {
    if (!voiceEnabled || navMode !== 'navigating' || !currentGuidance?.instruction) return;

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentGuidance.instruction);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.95;
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled, navMode, currentGuidance]);

  const leafletRoutes = useMemo(() => {
    if (!route || !showRoute) return [];

    return [{
      id: 'public-navigation-route',
      label: `${route.distance} • ${route.duration}`,
      positions: route.waypoints.map((point) => svgPointToLatLng(point)),
      color: route.hasIncidentWarning ? '#f97316' : '#2563eb',
      weight: 6,
      opacity: 0.9,
    }];
  }, [route, showRoute]);

  return (
    <div className="bg-background min-h-screen transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ── AI Alert Banner ── */}
      {currentAlert && !dismissedAlerts.includes(currentAlert.id) && (
        <div className={`sticky top-16 z-30 py-2.5 px-4 ${
          currentAlert.severity === 'critical' ? 'bg-red-600' :
          currentAlert.severity === 'warning' ? 'bg-orange-500' : 'bg-yellow-500'
        }`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-white animate-pulse" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{currentAlert.message}</p>
                <p className="text-white/80 text-xs">{currentAlert.sublabel}</p>
              </div>
              <span className="hidden sm:flex items-center gap-1 bg-white/20 text-white text-xs px-2 py-1 rounded-full font-medium">
                <Navigation className="w-3 h-3" />
                {currentAlert.distance} ahead
              </span>
            </div>
            <button
              onClick={() => { setDismissedAlerts(d => [...d, currentAlert.id]); setActiveAlert(null); }}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="max-w-full px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Live Safety Navigation
            </h1>
            <p className="text-muted-foreground text-xs">Echague, Isabela — Real-time incident map & route planner</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSafetyInfo(!showSafetyInfo)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-all"
            >
              <Info className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Safety Info</span>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400 rounded-lg text-xs font-medium">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
          </div>
        </div>

        {showSafetyInfo && (
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-4 mb-3">
            <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">Map & Navigation Guide — Echague, Isabela</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 shrink-0" /><span className="text-muted-foreground">Critical incident</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500 shrink-0" /><span className="text-muted-foreground">Warning level</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500 shrink-0" /><span className="text-muted-foreground">Pin A (Start)</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 shrink-0" /><span className="text-muted-foreground">Pin B (Destination)</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-blue-500 shrink-0" /><span className="text-muted-foreground">Navigation route</span></div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-dashed border-red-400 shrink-0" /><span className="text-muted-foreground">Hazard zone</span></div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">💧</span><span className="text-muted-foreground">Flood risk zone</span></div>
              <div className="flex items-center gap-2"><span className="text-muted-foreground">🖱️</span><span className="text-muted-foreground">Click map to place pin</span></div>
            </div>
          </div>
        )}

        {/* ── Main Map Layout ── */}
        <div className="flex gap-3 h-[calc(100vh-224px)] min-h-130 overflow-hidden">

          {/* ── Navigation Panel (Left) ── */}
          <div className={`relative z-[1200] shrink-0 flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1 transition-all duration-300 ${navPanelOpen ? 'w-72' : 'w-10 overflow-hidden pr-0'}`}>
            <button
              onClick={() => setNavPanelOpen(!navPanelOpen)}
              className="flex items-center justify-center w-full h-9 bg-card border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              title={navPanelOpen ? 'Collapse panel' : 'Expand navigation panel'}
            >
              {navPanelOpen ? (
                <><ChevronLeft className="w-4 h-4" /><span className="ml-1 text-xs">Hide</span></>
              ) : (
                <Route className="w-4 h-4" />
              )}
            </button>

            {navPanelOpen && (
              <>
                {/* ── Route Planner Card ── */}
                <div className="bg-card border border-border rounded-2xl p-4 transition-colors duration-300">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-600/20 border border-blue-500/30 rounded-lg flex items-center justify-center">
                        <Route className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Route Planner</p>
                        <p className="text-[10px] text-muted-foreground">Echague, Isabela</p>
                      </div>
                    </div>
                    {navMode !== 'idle' && (
                      <button onClick={handleReset} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="Reset route">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* From / To Inputs */}
                  <div className="space-y-3 relative">
                    {/* Connector line */}
                    <div className="absolute left-2.25 top-10 bottom-16 w-px bg-border" />

                    <LocationSearchInput
                      label="From"
                      value={fromText}
                      onChange={(loc, text) => { setFromLocation(loc); setFromText(text); }}
                      placeholder="Search start location..."
                      pinColor="#22c55e"
                      isDarkMode={isDarkMode}
                    />

                    {/* Swap button */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-border" />
                      <button
                        onClick={handleSwap}
                        className="w-7 h-7 rounded-full border border-border bg-secondary hover:bg-card text-muted-foreground hover:text-foreground flex items-center justify-center transition-all"
                        title="Swap start and destination"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                          <path d="M4 2v10M4 12l-2-2M4 12l2-2M12 14V4M12 4l-2 2M12 4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <LocationSearchInput
                      label="To"
                      value={toText}
                      onChange={(loc, text) => { setToLocation(loc); setToText(text); }}
                      placeholder="Search destination..."
                      pinColor="#ef4444"
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  {/* Click to place tip */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setPendingPin(pendingPin === 'from' ? null : 'from')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                        pendingPin === 'from'
                          ? 'bg-green-500/20 border border-green-500/50 text-green-400 animate-pulse'
                          : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Crosshair className="w-3 h-3" />
                      {pendingPin === 'from' ? 'Click map for A' : 'Pin A on map'}
                    </button>
                    <button
                      onClick={() => setPendingPin(pendingPin === 'to' ? null : 'to')}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                        pendingPin === 'to'
                          ? 'bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse'
                          : 'bg-secondary border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Crosshair className="w-3 h-3" />
                      {pendingPin === 'to' ? 'Click map for B' : 'Pin B on map'}
                    </button>
                  </div>

                  {/* Get Route Button */}
                  <button
                    onClick={handleGetRoute}
                    disabled={!fromLocation || !toLocation || isCalculating}
                    className={`w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      fromLocation && toLocation && !isCalculating
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20'
                        : 'bg-secondary text-muted-foreground cursor-not-allowed'
                    }`}
                  >
                    {isCalculating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Calculating Route...
                      </>
                    ) : (
                      <>
                        <Navigation className="w-4 h-4" />
                        Get Route
                      </>
                    )}
                  </button>
                </div>

                {/* ── Route Info Card ── */}
                {route && showRoute && (
                  <div className="bg-card border border-border rounded-2xl overflow-hidden transition-colors duration-300">
                    <div className="p-4 border-b border-border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-xs font-semibold text-foreground">Route Found</span>
                        </div>
                        <button
                          onClick={() => setShowDirections(!showDirections)}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          Directions {showDirections ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>

                      {/* Distance / Time */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <Milestone className="w-4 h-4 text-blue-400" />
                          <span className="text-lg font-bold text-foreground">{route.distance}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Timer className="w-4 h-4 text-green-400" />
                          <span className="text-lg font-bold text-foreground">{route.duration}</span>
                        </div>
                      </div>

                      {/* Incident Warning */}
                      {route.hasIncidentWarning && (
                        <div className="mt-2 p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-semibold text-orange-400">⚠ Active incidents along this route</p>
                              {route.incidentWarnings.slice(0, 2).map((w, i) => (
                                <p key={i} className="text-[10px] text-muted-foreground truncate">{w}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Turn-by-Turn Directions */}
                    {showDirections && (
                      <div className="divide-y divide-border max-h-52 overflow-y-auto">
                        {route.steps.map((step, i) => {
                          const StepIcon = step.icon;
                          const isLast = i === route.steps.length - 1;
                          return (
                            <div key={i} className={`flex items-start gap-3 px-4 py-3 ${isLast ? 'bg-green-500/5' : ''}`}>
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                isLast ? 'bg-green-500/20 text-green-400' : 'bg-secondary text-muted-foreground'
                              }`}>
                                <StepIcon className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-foreground leading-snug">{step.instruction}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{step.distance}</p>
                              </div>
                              <span className="text-[10px] font-semibold text-muted-foreground shrink-0">{i + 1}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Live guidance summary */}
                    <div className="border-t border-border p-3 bg-blue-500/5">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-blue-400 mb-1">Live guidance</p>
                      <p className="text-sm font-semibold text-foreground">{currentGuidance?.instruction || 'Route ready'}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{nextGuidance ? `Next: ${nextGuidance.instruction}` : 'You have reached your destination.'}</p>
                      <button
                        onClick={() => setVoiceEnabled((value) => !value)}
                        className="mt-3 inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-400 hover:bg-blue-500/20"
                      >
                        {voiceEnabled ? '🔊 Voice guidance on' : '🔇 Voice guidance off'}
                      </button>
                    </div>

                    {/* Start Navigation Button */}
                    <div className="p-3 border-t border-border">
                      <button
                        onClick={() => {
                          setNavMode(navMode === 'navigating' ? 'routing' : 'navigating');
                          if (navMode !== 'navigating') {
                            setGuidanceIndex(0);
                            setVoiceEnabled(true);
                          }
                        }}
                        className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
                          navMode === 'navigating'
                            ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        {navMode === 'navigating' ? (
                          <><Square className="w-3.5 h-3.5" /> Stop Navigation</>
                        ) : (
                          <><Play className="w-3.5 h-3.5" /> Start Navigation</>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Quick Locations ── */}
                {navMode === 'idle' && (
                  <div className="bg-card border border-border rounded-2xl p-4 transition-colors duration-300">
                    <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-red-400" />
                      Quick Destinations
                    </p>
                    <div className="space-y-1.5">
                      {ECHAGUE_LOCATIONS.filter(l => l.type !== 'user' && l.type !== 'road').slice(0, 5).map(loc => (
                        <button
                          key={loc.id}
                          onClick={() => {
                            setToLocation(loc);
                            setToText(loc.name);
                            if (!fromLocation) {
                              const user = ECHAGUE_LOCATIONS[0];
                              setFromLocation(user);
                              setFromText(user.name);
                            }
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-secondary transition-all text-left"
                        >
                          <span className="text-base leading-none">
                            {loc.type === 'hospital' ? '🏥' : loc.type === 'barangay' ? '🏘️' : '🏛️'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{loc.shortName}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{loc.type}</p>
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Interactive Map ── */}
          <div className="relative min-w-0 flex-1 rounded-2xl overflow-hidden border border-border shadow-xl">
            {/* Click-to-place indicator */}
            {pendingPin && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-card/95 border border-border rounded-full px-4 py-2 shadow-lg backdrop-blur-sm animate-pulse">
                <Crosshair className={`w-4 h-4 ${pendingPin === 'from' ? 'text-green-400' : 'text-red-400'}`} />
                <span className="text-xs font-semibold text-foreground">
                  Click anywhere on map to place Pin {pendingPin === 'from' ? 'A (Start)' : 'B (Destination)'}
                </span>
                <button onClick={() => setPendingPin(null)} className="text-muted-foreground hover:text-foreground ml-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Navigation Mode Banner */}
            {navMode === 'navigating' && (
              <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center gap-3 bg-blue-600 rounded-xl px-4 py-2.5 shadow-xl">
                <Navigation className="w-5 h-5 text-white animate-bounce" />
                <div className="flex-1 min-w-[220px]">
                  <p className="text-white text-xs font-semibold">Navigation Active</p>
                  <p className="text-blue-100 text-[10px]">{currentGuidance?.instruction || 'Preparing guidance…'} — {currentGuidance?.distance || 'Live route'}</p>
                </div>
                <button
                  onClick={() => setVoiceEnabled((value) => !value)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/20"
                >
                  {voiceEnabled ? '🔊 Voice on' : '🔇 Voice off'}
                </button>
                <div className="flex items-center gap-1.5 bg-blue-500/50 rounded-lg px-2 py-1">
                  <Timer className="w-3 h-3 text-blue-100" />
                  <span className="text-blue-100 text-xs font-bold">{route?.duration}</span>
                </div>
              </div>
            )}

            {/* Map container with zoom/pan */}
            <div className="w-full h-full overflow-hidden">
              <LeafletIncidentMap
                height="100%"
                incidents={incidents}
                selectedIncidentId={selectedIncident || undefined}
                onMarkerClick={handleIncidentClick}
                showControls={true}
                showHeatmap={true}
                showDangerZones={true}
                advisoryMarkers={publicAdvisories}
                selectedAdvisoryId={selectedAdvisory || undefined}
                onAdvisoryClick={handleAdvisoryClick}
                routes={leafletRoutes}
                compact={true}
                onMapClick={handleLeafletMapClick}
              />
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <div className="flex items-center gap-2 bg-card/90 border border-border rounded-full px-3 py-1.5 shadow backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs text-foreground font-medium">Echague, Isabela</span>
              </div>
            </div>

            {/* ── Selected Incident Popup ── */}
            {selectedInc && (
              <div className="absolute bottom-4 left-1/2 z-[1000] w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 pointer-events-auto">
                <div className={`relative z-[1001] bg-card/98 border rounded-2xl p-4 shadow-2xl transition-colors duration-300 ${
                  selectedInc.severity === 'critical' ? 'border-red-500/40' :
                  selectedInc.severity === 'warning' ? 'border-orange-500/40' : 'border-border'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
                        selectedInc.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        selectedInc.severity === 'warning' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        {selectedInc.severity.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{selectedInc.id}</span>
                    </div>
                    <button onClick={() => setSelectedIncident(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1 capitalize">{selectedInc.type} Incident</p>
                  <div className="flex items-start gap-1 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">{selectedInc.location}</p>
                  </div>
                  <p className="text-xs text-muted-foreground/80 mb-3 leading-relaxed">{selectedInc.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{selectedInc.time} — {selectedInc.assignedTeam}</span>
                    </div>
                    <button
                      onClick={() => {
                        const incLoc = {
                          id: `inc_${selectedInc.id}`,
                          name: selectedInc.location,
                          shortName: selectedInc.id,
                          x: (selectedInc.coordinates.x / 100) * 900,
                          y: (selectedInc.coordinates.y / 100) * 650,
                          type: 'landmark',
                        };
                        setToLocation(incLoc);
                        setToText(selectedInc.location);
                        if (!fromLocation) {
                          const user = ECHAGUE_LOCATIONS[0];
                          setFromLocation(user);
                          setFromText(user.name);
                        }
                        setSelectedIncident(null);
                        setNavPanelOpen(true);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-semibold transition-all"
                    >
                      <Navigation className="w-3 h-3" />
                      Navigate here
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Advisory Popup */}
            {selectedAdvisoryRecord && (
              <div className="absolute bottom-4 left-1/2 z-[1000] w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 pointer-events-auto">
                <div className={`relative z-[1001] bg-card/98 border rounded-2xl p-4 shadow-2xl transition-colors duration-300 ${
                  selectedAdvisoryRecord.severity === 'critical' ? 'border-red-500/40' :
                  selectedAdvisoryRecord.severity === 'warning' ? 'border-orange-500/40' :
                  selectedAdvisoryRecord.severity === 'moderate' ? 'border-yellow-500/40' : 'border-green-500/40'
                }`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
                        selectedAdvisoryRecord.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        selectedAdvisoryRecord.severity === 'warning' ? 'bg-orange-500/20 text-orange-400' :
                        selectedAdvisoryRecord.severity === 'moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-green-500/20 text-green-400'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        {selectedAdvisoryRecord.severity.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {advisoryCategoryLabels[selectedAdvisoryRecord.category] || 'General'} Advisory
                      </span>
                    </div>
                    <button onClick={() => setSelectedAdvisory(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">{selectedAdvisoryRecord.title}</p>
                  <div className="flex items-start gap-1 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">{selectedAdvisoryRecord.area}</p>
                  </div>
                  <p className="text-xs text-muted-foreground/90 leading-relaxed">{selectedAdvisoryRecord.message || 'No description provided for this advisory.'}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Right Sidebar (Incidents + Hazards) ── */}
          <div className={`shrink-0 flex h-full min-h-0 flex-col gap-3 overflow-y-auto pl-1 transition-all duration-300 ${showIncidentPanel ? 'w-64' : 'w-10 overflow-hidden pl-0'}`}>
            <button
              onClick={() => setShowIncidentPanel(!showIncidentPanel)}
              className="flex items-center justify-center w-full h-9 bg-card border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            >
              {showIncidentPanel ? (
                <><span className="text-xs">Hide</span><ChevronRight className="w-4 h-4" /></>
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400" />
              )}
            </button>

            {showIncidentPanel && (
              <>
                {/* AI Safety Alerts */}
                <div className="bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-200 dark:border-blue-500/20 p-3 shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">AI Alerts</span>
                  </div>
                  <div className="space-y-2">
                    {aiAlerts.map(alert => (
                      <div
                        key={alert.id}
                        className={`p-2.5 rounded-xl border text-xs ${
                          alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30' :
                          alert.severity === 'warning' ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/30' :
                          'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/30'
                        }`}
                      >
                        <p className={`font-semibold mb-0.5 text-[11px] ${
                          alert.severity === 'critical' ? 'text-red-700 dark:text-red-400' :
                          alert.severity === 'warning' ? 'text-orange-700 dark:text-orange-400' :
                          'text-yellow-700 dark:text-yellow-400'
                        }`}>{alert.message}</p>
                        <p className="text-muted-foreground text-[10px] leading-tight">{alert.sublabel}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nearby Incidents */}
                <div className="bg-card rounded-2xl border border-border p-3 flex-1 overflow-hidden flex flex-col transition-colors duration-300">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                        Active ({activeIncidents.length})
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5 overflow-y-auto flex-1">
                    {activeIncidents.map(incident => {
                      const TypeIcon = typeIcons[incident.type];
                      return (
                        <button
                          key={incident.id}
                          onClick={() => setSelectedIncident(incident.id === selectedIncident ? null : incident.id)}
                          className={`w-full flex items-center gap-2 p-2 rounded-xl text-left transition-all ${
                            selectedIncident === incident.id
                              ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30'
                              : 'hover:bg-secondary border border-transparent'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            incident.severity === 'critical' ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' :
                            incident.severity === 'warning' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400' :
                            'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                          }`}>
                            <TypeIcon className="w-3 h-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-foreground capitalize truncate">{incident.type}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{incident.location.split(',')[0]}</p>
                          </div>
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            incident.severity === 'critical' ? 'bg-red-500 animate-pulse' :
                            incident.severity === 'warning' ? 'bg-orange-500' : 'bg-yellow-500'
                          }`} />
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => navigate('/public/incidents')}
                    className="w-full mt-2 flex items-center justify-center gap-1 py-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors shrink-0 border-t border-border pt-2"
                  >
                    View all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {/* Hazard Legend */}
                <div className="bg-card rounded-2xl border border-border p-3 shrink-0 transition-colors duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">Hazard Zones</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { color: 'border-red-400', bg: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20', label: 'Accident Hotspot', desc: '3 active' },
                      { color: 'border-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20', label: 'Flood Risk', desc: '2 active' },
                      { color: 'border-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/20', label: 'Fire Hazard', desc: '1 active' },
                    ].map(({ color, bg, label, desc }) => (
                      <div key={label} className={`flex items-center gap-2 p-2 rounded-lg border border-dashed ${bg}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 border-2 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-foreground">{label}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


