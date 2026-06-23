import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Flame, Layers3, MapPin, RefreshCw } from 'lucide-react';
import {
  ECHAGUE_BARANGAYS,
  ECHAGUE_GIS,
} from '../../data/gisConfig';
import {
  filterIncidentsByRange,
  getBarangayStats,
  summarizeBy,
} from '../../data/analyticsModule';

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
  if (!count) return 'rgba(15, 23, 42, 0.22)';
  const ratio = count / Math.max(max, 1);
  if (ratio >= 0.8) return '#b91c1c';
  if (ratio >= 0.55) return '#ea580c';
  if (ratio >= 0.3) return '#eab308';
  return '#22c55e';
};

const rasterBarangayPoints = {
  Aromin: { x: 25.1, y: 19.9 },
  Annafunan: { x: 25.2, y: 25.1 },
  'Soyung (Poblacion)': { x: 27.0, y: 29.6 },
  'Silauan Norte (Poblacion)': { x: 24.8, y: 32.8 },
  'Silauan Sur (Poblacion)': { x: 24.8, y: 37.6 },
  'Taggappan (Poblacion)': { x: 28.9, y: 34.6 },
  'Villa Victoria': { x: 37.2, y: 29.0 },
  'Villa Rey': { x: 32.0, y: 27.5 },
  'Villa Campo': { x: 35.4, y: 33.8 },
  'Villa Fermin': { x: 37.4, y: 35.8 },
  'Pag-asa': { x: 41.0, y: 41.4 },
  Libertad: { x: 43.0, y: 36.0 },
  'Pangal Norte': { x: 48.6, y: 37.7 },
  Mabbayad: { x: 45.5, y: 42.6 },
  Salvacion: { x: 49.9, y: 47.2 },
  Babaran: { x: 55.4, y: 37.7 },
  Diasan: { x: 58.7, y: 41.8 },
  'Dammang West': { x: 66.5, y: 41.1 },
  Gumbauan: { x: 73.5, y: 42.7 },
  Dicaraoyan: { x: 78.8, y: 48.3 },
  Gucab: { x: 73.2, y: 51.7 },
  Malitao: { x: 57.5, y: 50.7 },
  'San Antonio Ugad': { x: 66.7, y: 58.8 },
  'San Antonio Minit': { x: 27.5, y: 66.2 },
  'San Miguel': { x: 41.7, y: 58.1 },
  'San Juan': { x: 34.2, y: 61.4 },
  'San Fabian': { x: 41.7, y: 61.9 },
  'San Carlos': { x: 48.0, y: 57.0 },
  'Santa Ana': { x: 81.1, y: 54.9 },
  'Santa Maria': { x: 80.2, y: 79.7 },
  'San Manuel': { x: 14.9, y: 66.0 },
  Buneg: { x: 15.6, y: 42.6 },
  Bacradal: { x: 12.7, y: 46.4 },
  Dammang: { x: 25.0, y: 49.0 },
  'Dammang East': { x: 29.3, y: 51.8 },
  Tuguegarao: { x: 25.8, y: 41.5 },
  Carulay: { x: 25.5, y: 58.7 },
  Fugu: { x: 30.5, y: 57.2 },
};

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

function RasterMap({ stats, selectedName, onSelectName }) {
  const maxCount = Math.max(...stats.map((item) => item.count), 1);
  const plottedStats = stats.filter((item) => rasterBarangayPoints[item.name]);

  return (
    <div className="relative h-full min-h-[520px] overflow-hidden bg-[#f7f2df]">
      <img
        src="/gis/echague/echague-map.jpeg"
        alt="Municipality of Echague barangay map"
        className="h-full min-h-[520px] w-full object-contain"
      />

      <div className="absolute inset-0 bg-slate-950/5" />

      {plottedStats.map((item) => {
        const point = rasterBarangayPoints[item.name];
        const intensity = item.count / maxCount;
        const size = 18 + (intensity * 30);
        const active = selectedName === item.name;

        return (
          <button
            key={item.name}
            type="button"
            onClick={() => onSelectName(item.name)}
            className={`absolute z-[510] -translate-x-1/2 -translate-y-1/2 rounded-full border text-[10px] font-bold text-white shadow-lg transition-transform hover:scale-110 ${
              active ? 'border-white ring-2 ring-blue-500' : 'border-white/80'
            }`}
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
              width: `${size}px`,
              height: `${size}px`,
              background: heatColor(item.count, maxCount),
            }}
            title={`${item.name}: ${item.count} incidents`}
          >
            {item.count || ''}
          </button>
        );
      })}

      <div className="absolute bottom-3 left-3 z-[520] flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-[10px] text-muted-foreground shadow-lg backdrop-blur">
        <span>Low</span>
        <span className="h-2 w-8 rounded-full bg-green-500/70" />
        <span className="h-2 w-8 rounded-full bg-yellow-500/70" />
        <span className="h-2 w-8 rounded-full bg-orange-500/70" />
        <span className="h-2 w-8 rounded-full bg-red-600/80" />
        <span>High</span>
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
              {ECHAGUE_GIS.name}, {ECHAGUE_GIS.province} / raster barangay map with incident overlays
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

      <div className={`grid min-h-0 ${compact ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'xl:grid-cols-[minmax(0,1fr)_360px]'}`}>
        <div className={`relative bg-slate-950 ${compact ? 'min-h-[640px]' : 'h-[calc(100vh-15rem)] min-h-[620px]'}`}>
          <RasterMap stats={stats} selectedName={selected?.name || selectedName} onSelectName={setSelectedName} />
        </div>

        <aside className={`flex min-h-0 flex-col overflow-y-auto border-t border-border bg-card xl:border-l xl:border-t-0 ${compact ? 'xl:h-[640px]' : 'xl:h-[calc(100vh-15rem)] xl:min-h-[620px]'}`}>
          <PriorityBreakdown items={prioritySummary} />
          <SelectedBarangayPanel selected={selected} periodBreakdown={selectedPeriodBreakdown} range={range} />
          <RankingPanel
            rows={rankedStats}
            selectedName={selected?.name || selectedName}
            onSelectName={setSelectedName}
          />
        </aside>
      </div>
    </section>
  );
}

export default BarangayHeatmap;
