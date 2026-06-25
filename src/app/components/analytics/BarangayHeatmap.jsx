import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Flame, Layers3, MapPin, RefreshCw } from 'lucide-react';
import {
  ECHAGUE_BARANGAYS,
  ECHAGUE_GIS,
  matchBarangayName,
  normalizeBarangayName,
} from '../../data/gisConfig';
import {
  filterIncidentsByRange,
  getBarangayStats,
  summarizeBy,
} from '../../data/analyticsModule';
import { CACHE_TTL, getCache, setCache } from '../../utils/cache';

const rangeLabels = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
  custom: 'Custom',
};

const priorityColors = {
  Critical: '#dc2626',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

const heatColor = (count, max) => {
  if (!count) return '#86efac';
  const ratio = count / Math.max(max, 1);
  if (ratio >= 0.8) return '#b91c1c';
  if (ratio >= 0.55) return '#ef4444';
  if (ratio >= 0.3) return '#fb923c';
  return '#f7e58f';
};

const riskCategory = (count, max) => {
  if (!count) return 'No recorded incidents';
  const ratio = count / Math.max(max, 1);
  if (ratio >= 0.8) return 'Critical risk';
  if (ratio >= 0.55) return 'High risk';
  if (ratio >= 0.3) return 'Moderate risk';
  return 'Low risk';
};

const legendItems = [
  { label: 'No incidents', color: '#86efac' },
  { label: 'Low', color: '#f7e58f' },
  { label: 'Medium', color: '#fb923c' },
  { label: 'High', color: '#ef4444' },
  { label: 'Critical', color: '#b91c1c' },
];

const getGeoJsonBarangayName = (feature) => {
  const properties = feature?.properties || {};
  return properties.NAME_3 || properties.name || 'Unknown Barangay';
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

function FitGeoJsonBounds({ data, zoomBoost = 0.75 }) {
  const map = useMap();

  useEffect(() => {
    if (!data) return;
    const bounds = L.geoJSON(data).getBounds();
    if (bounds.isValid()) {
      let boosted = false;
      const applyZoomBoost = () => {
        if (boosted) return;
        boosted = true;
        map.setZoom(Math.min(map.getZoom() + zoomBoost, map.getMaxZoom()), { animate: false });
      };

      map.once('moveend', applyZoomBoost);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
      const fallbackTimer = window.setTimeout(applyZoomBoost, 250);

      return () => {
        window.clearTimeout(fallbackTimer);
        map.off('moveend', applyZoomBoost);
      };
    }
    return undefined;
  }, [data, map, zoomBoost]);

  return null;
}

function DashboardMetric({ label, value, icon: Icon, tone = 'text-blue-400' }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />}
        <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1 truncate text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function PriorityBreakdown({ items }) {
  return (
    <div className="border-b border-border p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
        Incident Priority
      </div>
      <div className="space-y-3">
        {items.length ? items.map((item) => (
          <div key={item.name}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{item.name}</span>
              <span className="font-semibold text-foreground">{item.count} / {item.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(item.percent, 4)}%`, backgroundColor: priorityColors[item.name] || '#64748b' }}
              />
            </div>
          </div>
        )) : (
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            No incidents in this range
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedBarangayPanel({ selected, periodBreakdown, range }) {
  return (
    <div className="border-b border-border p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
        <Flame className="h-3.5 w-3.5 text-orange-400" />
        Selected Barangay
      </div>
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <div className="text-sm font-semibold text-foreground">{selected?.name || 'No barangay selected'}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {selected?.count
            ? `${selected.count} incidents in ${rangeLabels[range]?.toLowerCase() || 'current range'}`
            : 'Select a bubble or ranking item to inspect details.'}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <DashboardMetric label="Today" value={periodBreakdown.today?.count ?? 0} />
        <DashboardMetric label="Week" value={periodBreakdown.week?.count ?? 0} />
        <DashboardMetric label="Month" value={periodBreakdown.month?.count ?? 0} />
        <DashboardMetric label="Year" value={periodBreakdown.year?.count ?? 0} />
      </div>
    </div>
  );
}

function RankingPanel({ rows, selectedName, onSelectName, initialVisible = 3 }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, initialVisible);
  const canToggle = rows.length > initialVisible;

  return (
    <div className="flex flex-none flex-col bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Top 3 Highest Accident Levels</h3>
            <p className="text-[11px] text-muted-foreground">Barangays sorted by incident count</p>
          </div>
        </div>
      </div>

      <div>
        {visibleRows.length ? visibleRows.map((row, index) => {
          const active = selectedName === row.name;
          return (
            <button
              key={row.name}
              type="button"
              onClick={() => onSelectName(row.name)}
              className={`w-full border-b border-border/60 px-4 py-3 text-left transition-colors ${
                active ? 'bg-blue-500/10' : 'hover:bg-secondary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold ${
                  active ? 'border-blue-500/40 bg-blue-500/15 text-blue-300' : 'border-border bg-secondary/40 text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{row.name}</div>
                      <div className="text-[11px] text-muted-foreground">{row.percent}% of visible incidents</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-foreground">{row.count}</div>
                      <div className="text-[10px] text-muted-foreground">incidents</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-600" style={{ width: `${Math.max(row.percent, 4)}%` }} />
                  </div>
                </div>
              </div>
            </button>
          );
        }) : (
          <div className="px-4 py-5 text-xs text-muted-foreground">
            No incident barangays in this range
          </div>
        )}
      </div>

      {canToggle && (
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            {expanded ? (
              <>
                Show top {initialVisible}
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                See more
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function BarangayGeoJsonMap({ stats, selectedName, onSelectName, zoomBoost = 0.75, minZoom = 10 }) {
  const [geoJson, setGeoJson] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const layerRefs = useRef(new Map());
  const selectedNameRef = useRef(selectedName);
  const maxCount = Math.max(...stats.map((item) => item.count), 1);
  const statsByNormalizedName = useMemo(() => Object.fromEntries(
    stats.map((item) => [normalizeBarangayName(item.name), item])
  ), [stats]);

  useEffect(() => {
    let active = true;

    async function loadGeoJson() {
      setStatus('loading');
      setError('');

      try {
        const cacheKey = `geojson:${ECHAGUE_GIS.barangayGeoJsonUrl}`;
        const cached = getCache(cacheKey);
        if (cached) {
          setGeoJson(cached);
          setStatus('ready');
          return;
        }

        const response = await fetch(ECHAGUE_GIS.barangayGeoJsonUrl);
        if (!response.ok) {
          throw new Error(`GeoJSON request failed with ${response.status}`);
        }

        const data = await response.json();
        if (!active) return;

        if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
          throw new Error('GeoJSON file is not a valid FeatureCollection.');
        }

        setCache(cacheKey, data, CACHE_TTL.GEOJSON);
        setGeoJson(data);
        setStatus('ready');
      } catch (loadError) {
        if (!active) return;
        setGeoJson(null);
        setError(loadError.message || 'Unable to load barangay boundaries.');
        setStatus('error');
      }
    }

    loadGeoJson();

    return () => {
      active = false;
    };
  }, []);

  const getFeatureStats = useCallback((feature) => {
    const featureName = getGeoJsonBarangayName(feature);
    const matchedName = matchBarangayName(featureName, ECHAGUE_BARANGAYS);
    return statsByNormalizedName[normalizeBarangayName(matchedName)]
      || statsByNormalizedName[normalizeBarangayName(featureName)]
      || {
        name: featureName,
        count: 0,
        percent: 0,
        priorities: [],
        mostCommonIncidentType: 'No incidents',
      };
  }, [statsByNormalizedName]);

  const getFeatureStyle = useCallback((feature) => {
    const item = getFeatureStats(feature);
    const active = normalizeBarangayName(selectedNameRef.current) === normalizeBarangayName(item.name);

    return {
      color: active ? '#1d4ed8' : '#64748b',
      weight: active ? 3 : 1.2,
      opacity: 0.95,
      fillColor: heatColor(item.count, maxCount),
      fillOpacity: item.count ? 0.76 : 0.68,
    };
  }, [getFeatureStats, maxCount]);

  const createPopupHtml = (item) => `
    <div class="gis-popup">
      <div class="gis-popup-title">${escapeHtml(item.name)}</div>
      <div class="gis-popup-source">Municipality: Echague</div>
      <div class="gis-popup-source">Province: Isabela</div>
      <div class="gis-popup-grid">
        <div class="gis-popup-card"><span>Total incidents</span><strong>${item.count}</strong></div>
        <div class="gis-popup-card"><span>Risk category</span><strong>${riskCategory(item.count, maxCount)}</strong></div>
      </div>
      <div class="gis-popup-most-common"><span>Most common incident type</span><strong>${escapeHtml(item.mostCommonIncidentType || 'No incidents')}</strong></div>
    </div>
  `;

  const onEachFeature = (feature, layer) => {
    const item = getFeatureStats(feature);
    const selectFeature = () => {
      onSelectName(item.name);
      layer.openPopup();
    };

    layer.bindTooltip(item.name, {
      className: 'echague-gis-tooltip',
      direction: 'top',
      sticky: true,
    });
    layer.bindPopup(createPopupHtml(item), {
      className: 'echague-gis-popup',
      maxWidth: 320,
    });
    layer.on({
      click: selectFeature,
      mouseover: (event) => {
        event.target.setStyle({
          color: '#0f172a',
          weight: 3,
          fillOpacity: 0.9,
        });
        event.target.bringToFront();
      },
      mouseout: (event) => {
        event.target.setStyle(getFeatureStyle(feature));
      },
    });
    layer.on('add', () => {
      const element = layer.getElement();
      if (!element) return;

      layerRefs.current.set(normalizeBarangayName(item.name), { feature, layer });
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', `${item.name}: ${item.count} incidents`);
      element.style.cursor = 'pointer';
      element.addEventListener('click', selectFeature);
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectFeature();
        }
      });
    });
  };

  useEffect(() => {
    selectedNameRef.current = selectedName;
    layerRefs.current.forEach(({ feature, layer }) => {
      layer.setStyle(getFeatureStyle(feature));
    });
  }, [selectedName, getFeatureStyle]);

  return (
    <div className="relative h-full min-h-[700px] bg-slate-100 p-4">
      {status === 'loading' && (
        <div className="absolute inset-0 z-[620] grid place-items-center bg-slate-50 text-sm font-semibold text-slate-700">
          Loading Echague GIS map...
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 z-[620] grid place-items-center bg-slate-50 p-6">
          <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <div className="text-sm font-semibold text-red-700">Failed to load Echague GeoJSON map</div>
            <div className="mt-2 text-xs text-red-600">
              The barangay boundary file at {ECHAGUE_GIS.barangayGeoJsonUrl} could not be loaded. {error}
            </div>
          </div>
        </div>
      )}

      <div className="flex h-full min-h-[660px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-950">Incidents by Barangay GIS Dashboard</h3>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Incident distribution across Echague barangays using the local GeoJSON boundary layer.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
              {legendItems.map((item) => (
                <div key={item.label} className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                  <span className="h-2.5 w-4 rounded-sm border border-slate-900/15" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative min-h-[610px] flex-1 bg-slate-50">
          <MapContainer
            center={ECHAGUE_GIS.center}
            zoom={ECHAGUE_GIS.zoom}
            minZoom={minZoom}
            zoomSnap={0.25}
            zoomDelta={0.5}
            zoomControl
            scrollWheelZoom
            attributionControl={false}
            className="echague-boundary-map h-full min-h-[610px] w-full"
          >
            {geoJson && (
              <>
                <FitGeoJsonBounds data={geoJson} zoomBoost={zoomBoost} />
                <GeoJSON
                  key={stats.map((item) => `${item.name}:${item.count}`).join('|')}
                  data={geoJson}
                  style={getFeatureStyle}
                  onEachFeature={onEachFeature}
                />
              </>
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

export function BarangayHeatmap({
  incidents = [],
  allIncidents = incidents,
  range = 'today',
  customRange = { start: '', end: '' },
  title = 'Incidents by Barangay GIS Dashboard',
  compact = false,
  mapZoomBoost = 0.75,
  mapMinZoom = 10,
  showDetailsPanel = true,
}) {
  const [selectedName, setSelectedName] = useState('');

  const visibleIncidents = useMemo(() => (
    range === 'custom'
      ? filterIncidentsByRange(allIncidents, 'custom', customRange)
      : filterIncidentsByRange(allIncidents, range)
  ), [customRange, range, allIncidents]);

  const stats = useMemo(() => getBarangayStats(visibleIncidents, ECHAGUE_BARANGAYS), [visibleIncidents]);
  const rankedStats = useMemo(() => stats.filter((item) => item.count > 0), [stats]);
  const statsByName = useMemo(() => Object.fromEntries(stats.map((item) => [item.name, item])), [stats]);
  const prioritySummary = useMemo(() => summarizeBy(visibleIncidents, 'priority'), [visibleIncidents]);
  const selected = statsByName[selectedName] || stats.find((item) => item.count > 0) || stats[0];
  const affectedBarangays = stats.filter((item) => item.count > 0).length;
  const criticalCount = prioritySummary.find((item) => item.name === 'Critical')?.count || 0;

  const selectedPeriodBreakdown = useMemo(() => {
    const periods = {
      today: filterIncidentsByRange(allIncidents, 'today'),
      week: filterIncidentsByRange(allIncidents, 'week'),
      month: filterIncidentsByRange(allIncidents, 'month'),
      year: filterIncidentsByRange(allIncidents, 'year'),
    };

    return Object.fromEntries(
      Object.entries(periods).map(([period, items]) => {
        const periodStats = getBarangayStats(items, ECHAGUE_BARANGAYS);
        return [period, periodStats.find((item) => item.name === selected?.name)];
      })
    );
  }, [allIncidents, selected?.name]);

  return (
    <section className={`overflow-hidden rounded-lg border border-border bg-card shadow-sm ${compact ? '' : 'min-h-[calc(100vh-8rem)]'}`}>
      <div className="border-b border-border bg-card px-4 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-400" />
              <h2 className="truncate text-base font-bold text-foreground">{title}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {ECHAGUE_GIS.name}, {ECHAGUE_GIS.province} / GeoJSON barangay boundary choropleth
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[560px]">
            <DashboardMetric label="Total" value={visibleIncidents.length} icon={Activity} tone="text-blue-400" />
            <DashboardMetric label="Active" value={visibleIncidents.length} icon={RefreshCw} tone="text-green-400" />
            <DashboardMetric label="Critical" value={criticalCount} icon={AlertTriangle} tone="text-red-400" />
            <DashboardMetric label="Barangays" value={affectedBarangays} icon={Layers3} tone="text-orange-400" />
          </div>
        </div>
      </div>

      <div className={`grid min-h-0 ${showDetailsPanel ? (compact ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : 'xl:grid-cols-[minmax(0,1fr)_330px]') : 'grid-cols-1'}`}>
        <div className={`relative bg-slate-100 ${compact ? 'min-h-[720px]' : 'min-h-[740px] xl:h-[calc(100vh-11rem)]'}`}>
          <BarangayGeoJsonMap
            stats={stats}
            selectedName={selected?.name || selectedName}
            onSelectName={setSelectedName}
            zoomBoost={mapZoomBoost}
            minZoom={mapMinZoom}
          />
        </div>

        {showDetailsPanel && (
          <aside className={`flex min-h-0 flex-col overflow-y-auto border-t border-border bg-card xl:border-l xl:border-t-0 ${compact ? 'xl:h-[720px]' : 'xl:h-[calc(100vh-11rem)] xl:min-h-[740px]'}`}>
            <PriorityBreakdown items={prioritySummary} />
            <SelectedBarangayPanel selected={selected} periodBreakdown={selectedPeriodBreakdown} range={range} />
            <RankingPanel
              rows={rankedStats}
              selectedName={selected?.name || selectedName}
              onSelectName={setSelectedName}
            />
          </aside>
        )}
      </div>
    </section>
  );
}

export default BarangayHeatmap;
