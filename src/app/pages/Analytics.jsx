import { createElement, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, BarChart2, Calendar, Car, Clock, FilePlus2, FileText, HeartPulse, Layers3, MapPinned, Radio, ShieldCheck, TrendingDown, TrendingUp,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarangayHeatmap } from '../components/analytics/BarangayHeatmap';
import {
  filterIncidentsByRange, filterOptions, getBarangayStats, summarizeBy,
} from '../data/analyticsModule';
import { listDispatchRecords, listIncidents } from '../services/supabase';
import { ROLES } from '../access/rbac';
import { useAuth } from '../contexts/AuthContext';
import { calculateAccidentProneAreas } from '../utils/accidentProneAreas';

const colors = ['#2563eb', '#dc2626', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#8b5cf6', '#64748b'];

const priorityColors = {
  Critical: '#dc2626',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const settledValue = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback);

const timeOfDayOptions = [
  { value: 'all', label: 'All' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'midnight', label: 'Midnight' },
];

const timePeriods = [
  { key: 'morning', label: 'Morning', range: '5:00 AM - 11:59 AM' },
  { key: 'afternoon', label: 'Afternoon', range: '12:00 PM - 5:59 PM' },
  { key: 'evening', label: 'Evening', range: '6:00 PM - 11:59 PM' },
  { key: 'midnight', label: 'Midnight', range: '12:00 AM - 4:59 AM' },
];

const riskTone = {
  Critical: 'text-red-400 bg-red-500/10 border-red-500/25',
  High: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
  Moderate: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/25',
  Low: 'text-green-500 bg-green-500/10 border-green-500/25',
  Minimal: 'text-slate-400 bg-secondary/50 border-border',
};

function getTimeOfDay(time = '') {
  const [hourValue] = String(time || '').split(':');
  const hour = Number(hourValue);
  if (!Number.isFinite(hour)) return 'unspecified';
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 24) return 'evening';
  return 'midnight';
}

function toTitleCase(value = '') {
  return String(value || 'Unspecified')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRiskLevel({ count = 0, critical = 0, high = 0 }, maxCount = 1) {
  const ratio = count / Math.max(maxCount, 1);
  if (critical > 0 || ratio >= 0.8) return 'Critical';
  if (high > 0 || ratio >= 0.55) return 'High';
  if (ratio >= 0.3) return 'Moderate';
  if (count > 0) return 'Low';
  return 'Minimal';
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-xs shadow-xl">
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function DateFilters({ range, setRange, customRange, setCustomRange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-1.5 shadow-sm">
      <div className="flex overflow-hidden rounded-md border border-border bg-secondary/40 text-xs">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setRange(option.value)}
            className={`px-3 py-2 font-medium transition-all ${range === option.value ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {range === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customRange.start}
            onChange={(event) => setCustomRange((current) => ({ ...current, start: event.target.value }))}
            className="h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-blue-500"
          />
          <input
            type="date"
            value={customRange.end}
            onChange={(event) => setCustomRange((current) => ({ ...current, end: event.target.value }))}
            className="h-9 rounded-md border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-blue-500"
          />
        </div>
      )}
    </div>
  );
}

function RankingTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Barangay</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Share</th>
            <th className="px-3 py-2 text-left font-medium">Peak Time</th>
            <th className="px-3 py-2 text-left font-medium">Most Common Incident</th>
            <th className="px-3 py-2 text-left font-medium">Risk Level</th>
            <th className="px-3 py-2 text-right font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-border/60">
              <td className="px-4 py-2 text-foreground">{row.name}</td>
              <td className="px-3 py-2 text-right font-semibold text-foreground">{row.count}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{row.percent}%</td>
              <td className="px-3 py-2 text-muted-foreground">{row.peakTime || 'Unspecified'}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.mostCommonIncident || row.mostCommonIncidentType || 'No incidents'}</td>
              <td className="px-3 py-2">
                <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${riskTone[row.riskLevel] || riskTone.Minimal}`}>
                  {row.riskLevel || 'Minimal'}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end">
                  {row.trend === 'up' ? <TrendingUp className="h-3.5 w-3.5 text-red-400" /> : row.trend === 'down' ? <TrendingDown className="h-3.5 w-3.5 text-green-400" /> : <span className="text-muted-foreground">-</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ label, value, helper, icon: Icon, tone }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{helper}</div>
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${tone}`}>
          {createElement(Icon, { className: 'h-4 w-4' })}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors focus:border-blue-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function MapLayerToggles({ value, onChange }) {
  const items = [
    ['boundary', 'Barangay Boundary'],
    ['incidentMarkers', 'Incident Markers'],
    ['heatmap', 'Heatmap'],
    ['criticalZones', 'Critical Zones'],
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <Layers3 className="h-3.5 w-3.5 text-blue-400" />
        Map Layers
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([key, label]) => (
          <label key={key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <input
              type="checkbox"
              checked={Boolean(value[key])}
              onChange={(event) => onChange((current) => ({ ...current, [key]: event.target.checked }))}
              className="h-4 w-4 accent-blue-600"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RiskAreasTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Barangay</th>
            <th className="px-3 py-2 text-right font-medium">Morning</th>
            <th className="px-3 py-2 text-right font-medium">Afternoon</th>
            <th className="px-3 py-2 text-right font-medium">Evening</th>
            <th className="px-3 py-2 text-right font-medium">Midnight</th>
            <th className="px-3 py-2 text-left font-medium">Peak Time</th>
            <th className="px-3 py-2 text-left font-medium">Risk Level</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-border/60">
              <td className="px-4 py-2 font-medium text-foreground">{row.name}</td>
              {timePeriods.map((period) => (
                <td key={`${row.name}-${period.key}`} className="px-3 py-2 text-right text-muted-foreground">{row.periodCounts[period.key] || 0}</td>
              ))}
              <td className="px-3 py-2 text-muted-foreground">{row.peakTime}</td>
              <td className="px-3 py-2">
                <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${riskTone[row.riskLevel] || riskTone.Minimal}`}>
                  {row.riskLevel}
                </span>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No risk areas match the selected filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SpatioTemporalSection({
  filteredIncidents,
  enrichedBarangays,
  timeOfDayData,
  riskRows,
  summary,
  filterOptionsData,
  filters,
  setFilters,
  layerVisibility,
  setLayerVisibility,
  range,
  customRange,
}) {
  return (
    <div className="mb-5 space-y-5">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
              <MapPinned className="h-3 w-3" />
              Spatio-Temporal Analysis
            </div>
            <h2 className="text-base font-bold text-foreground">Spatio-Temporal Incident Map</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Cross-analyze incident concentration by barangay, time window, incident class, and severity using official records stored in Supabase.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:w-[680px] xl:grid-cols-4">
            <FilterSelect label="Incident Type" value={filters.type} onChange={(value) => setFilters((current) => ({ ...current, type: value }))} options={filterOptionsData.types} />
            <FilterSelect label="Barangay" value={filters.barangay} onChange={(value) => setFilters((current) => ({ ...current, barangay: value }))} options={filterOptionsData.barangays} />
            <FilterSelect label="Severity" value={filters.severity} onChange={(value) => setFilters((current) => ({ ...current, severity: value }))} options={filterOptionsData.severities} />
            <FilterSelect label="Time of Day" value={filters.timeOfDay} onChange={(value) => setFilters((current) => ({ ...current, timeOfDay: value }))} options={timeOfDayOptions} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard label="Most Accident-Prone Barangay" value={summary.topBarangay} helper={`${summary.topBarangayCount} matching incidents`} icon={MapPinned} tone="border-red-500/20 bg-red-500/10 text-red-400" />
          <MetricCard label="Peak Incident Time" value={summary.peakTime} helper={summary.peakTimeRange} icon={Clock} tone="border-blue-500/20 bg-blue-500/10 text-blue-400" />
          <MetricCard label="Most Common Incident" value={summary.commonIncident} helper={`${summary.commonIncidentCount} recorded cases`} icon={AlertTriangle} tone="border-orange-500/20 bg-orange-500/10 text-orange-400" />
          <MetricCard label="Highest Risk Level" value={summary.highestRisk} helper={`${filteredIncidents.length} incidents analyzed`} icon={ShieldCheck} tone="border-purple-500/20 bg-purple-500/10 text-purple-400" />
        </div>
      </div>

      <MapLayerToggles value={layerVisibility} onChange={setLayerVisibility} />

      <BarangayHeatmap
        incidents={filteredIncidents}
        allIncidents={filteredIncidents}
        range={range}
        customRange={customRange}
        title="Spatio-Temporal Incident Map"
        layerVisibility={layerVisibility}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Incidents by Time of Day</h3>
            <p className="text-xs text-muted-foreground">Distribution of matching records by operational time period</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={timeOfDayData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]}>
                {timeOfDayData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Top Risk Areas by Time Period</h3>
            <p className="text-xs text-muted-foreground">Barangay-level temporal risk ranking based on filtered records</p>
          </div>
          <RiskAreasTable rows={riskRows} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Incidents by Barangay</h3>
          <p className="text-xs text-muted-foreground">Enhanced barangay ranking with temporal profile and risk level</p>
        </div>
        <RankingTable rows={enrichedBarangays} />
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function DispatcherWorkflowCard({ dispatches, onRecords, onCreate }) {
  const draft = dispatches.filter((record) => record.status === 'Draft').length;
  const sent = dispatches.filter((record) => record.status?.includes('Sent') || record.status?.includes('Progress')).length;
  const linked = dispatches.filter((record) => record.status?.includes('PCR')).length;

  return (
    <div className="mb-5 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-400">
            <Radio className="h-3 w-3" />
            Dispatcher Workflow
          </div>
          <h2 className="text-base font-bold text-foreground">Dispatch Intake and PCR Handoff</h2>
          <p className="mt-1 text-xs text-muted-foreground">Track dispatch forms, field officer handoff, and linked Patient Care Records before reviewing analytics.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onRecords} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold hover:bg-secondary/80"><FileText className="h-4 w-4" />Dispatch Records</button>
          <button onClick={onCreate} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"><FilePlus2 className="h-4 w-4" />Create Dispatch</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          ['Total Dispatches', dispatches.length, 'text-foreground', 'bg-secondary/50 border-border'],
          ['Draft', draft, 'text-slate-300', 'bg-slate-500/10 border-slate-500/20'],
          ['Sent / In Progress', sent, 'text-blue-400', 'bg-blue-500/10 border-blue-500/20'],
          ['Linked PCR', linked, 'text-green-400', 'bg-green-500/10 border-green-500/20'],
        ].map(([label, value, textClass, cardClass]) => (
          <div key={label} className={`rounded-lg border p-3 ${cardClass}`}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={`mt-1 text-xl font-bold ${textClass}`}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionCard({ title, subtitle, data, type = 'bar' }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
        <ResponsiveContainer width="100%" height={220}>
          {type === 'pie' ? (
            <PieChart>
              <Pie data={data} dataKey="count" nameKey="name" innerRadius={55} outerRadius={86} paddingAngle={2}>
                {data.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
        <div className="space-y-2">
          {data.map((item, index) => (
            <div key={item.name}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">{item.name}</span>
                <span className="font-semibold text-foreground">{item.count} / {item.percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: colors[index % colors.length] }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HorizontalMiniBars({ title, data, accent = '#2563eb' }) {
  const max = Math.max(...data.map((item) => item.count), 1);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          {data.reduce((sum, item) => sum + item.count, 0)} cases
        </span>
      </div>
      <div className="space-y-3">
        {data.length ? data.map((item, index) => (
          <div key={item.name}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-muted-foreground">{item.name}</span>
              <span className="font-semibold text-foreground">{item.count}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((item.count / max) * 100, 8)}%`,
                  backgroundColor: index === 0 ? accent : '#64748b',
                }}
              />
            </div>
          </div>
        )) : (
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            No MVC records in this range
          </div>
        )}
      </div>
    </div>
  );
}

function ComplianceBarsCard({ license, helmet, alcohol }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">License | Helmet | Alcohol</h3>
          <p className="text-xs text-muted-foreground">Motor vehicle crash compliance indicators by count</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
          Risk Factors
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <HorizontalMiniBars title="License" data={license} accent="#2563eb" />
        <HorizontalMiniBars title="Helmet" data={helmet} accent="#22c55e" />
        <HorizontalMiniBars title="Alcohol" data={alcohol} accent="#dc2626" />
      </div>
    </div>
  );
}

function ReportChartCard({ title, subtitle, data, kind = 'bar' }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        {kind === 'line' ? (
          <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="count" name="Count" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: '#2563eb' }} />
          </LineChart>
        ) : kind === 'pie' ? (
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={2}>
              {data.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        ) : (
          <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [range, setRange] = useState('today');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [rankingView, setRankingView] = useState('bar');
  const [incidents, setIncidents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [spatioFilters, setSpatioFilters] = useState({
    type: 'all',
    barangay: 'all',
    severity: 'all',
    timeOfDay: 'all',
  });
  const [spatioLayers, setSpatioLayers] = useState({
    boundary: true,
    incidentMarkers: true,
    heatmap: true,
    criticalZones: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadAnalytics() {
      setLoading(true);
      setError('');
      try {
        const [incidentResult, dispatchResult] = await Promise.allSettled([
          listIncidents({ limit: 1000 }),
          listDispatchRecords({ limit: 1000 }),
        ]);
        if (mounted) {
          const incidentRows = settledValue(incidentResult, []);
          const dispatchRows = settledValue(dispatchResult, []);
          setIncidents(incidentRows);
          setDispatches(dispatchRows);
          const failed = [incidentResult, dispatchResult].find(result => result.status === 'rejected');
          if (failed) setError(failed.reason?.message || 'Some analytics data could not be loaded for your role.');
        }
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load analytics data.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadAnalytics();
    return () => {
      mounted = false;
    };
  }, []);

  const analyticsIncidents = useMemo(() => incidents.map(incident => ({
    ...incident,
    classification: String(incident.classification || incident.type || 'Other').toUpperCase(),
    priority: incident.priority ? `${incident.priority[0].toUpperCase()}${incident.priority.slice(1)}` : 'Medium',
    barangay: incident.barangay,
    date: incident.date,
    time: incident.time,
    timeOfDay: getTimeOfDay(incident.time),
    month: incident.date ? new Date(incident.date).getMonth() : 0,
    mvc: incident.classification === 'mvc' || incident.type === 'vehicular' ? {
      vehicleType: incident.subtype || 'Unspecified',
      personInvolved: 'Unspecified',
      engineSize: 'Unspecified',
      licenseStatus: 'Unspecified',
      helmetUsage: 'Unspecified',
      alcoholInvolvement: 'Unspecified',
    } : null,
  })), [incidents]);

  const filtered = useMemo(() => filterIncidentsByRange(analyticsIncidents, range, customRange), [analyticsIncidents, range, customRange]);
  const spatioFilterOptions = useMemo(() => {
    const typeOptions = [...new Set(filtered.map((item) => item.classification).filter(Boolean))]
      .sort()
      .map((value) => ({ value, label: toTitleCase(value) }));
    const barangayOptions = [...new Set(filtered.map((item) => item.barangay).filter(Boolean))]
      .sort()
      .map((value) => ({ value, label: value }));
    const severityOptions = [...new Set(filtered.map((item) => item.priority).filter(Boolean))]
      .sort((first, second) => (priorityColors[second] ? 1 : 0) - (priorityColors[first] ? 1 : 0))
      .map((value) => ({ value, label: value }));

    return {
      types: [{ value: 'all', label: 'All' }, ...typeOptions],
      barangays: [{ value: 'all', label: 'All' }, ...barangayOptions],
      severities: [{ value: 'all', label: 'All' }, ...severityOptions],
    };
  }, [filtered]);
  const spatioFiltered = useMemo(() => filtered.filter((item) => {
    const typeMatch = spatioFilters.type === 'all' || item.classification === spatioFilters.type;
    const barangayMatch = spatioFilters.barangay === 'all' || item.barangay === spatioFilters.barangay;
    const severityMatch = spatioFilters.severity === 'all' || item.priority === spatioFilters.severity;
    const timeMatch = spatioFilters.timeOfDay === 'all' || item.timeOfDay === spatioFilters.timeOfDay;
    return typeMatch && barangayMatch && severityMatch && timeMatch;
  }), [filtered, spatioFilters]);
  const barangays = useMemo(() => getBarangayStats(spatioFiltered).filter((item) => item.count > 0), [spatioFiltered]);
  const maxBarangayCount = useMemo(() => Math.max(...barangays.map((item) => item.count), 1), [barangays]);
  const weightedRiskAreas = useMemo(() => calculateAccidentProneAreas(spatioFiltered, { publicOnly: false }), [spatioFiltered]);
  const weightedRiskByBarangay = useMemo(
    () => new Map(weightedRiskAreas.map(area => [area.barangay, area])),
    [weightedRiskAreas]
  );
  const enrichedBarangays = useMemo(() => barangays.map((barangay) => {
    const records = spatioFiltered.filter((item) => item.barangay === barangay.name);
    const timeSummary = summarizeBy(records, (item) => timePeriods.find((period) => period.key === item.timeOfDay)?.label || 'Unspecified');
    const incidentSummary = summarizeBy(records, 'classification');
    const critical = records.filter((item) => item.priority === 'Critical').length;
    const high = records.filter((item) => item.priority === 'High').length;
    const weightedArea = weightedRiskByBarangay.get(barangay.name);

    return {
      ...barangay,
      peakTime: timeSummary[0]?.name || 'Unspecified',
      mostCommonIncident: weightedArea?.most_common_incident_type || toTitleCase(incidentSummary[0]?.name || barangay.mostCommonIncidentType),
      riskLevel: weightedArea?.risk_level || getRiskLevel({ count: barangay.count, critical, high }, maxBarangayCount),
      riskScore: weightedArea?.total_risk_score || 0,
    };
  }), [barangays, maxBarangayCount, spatioFiltered, weightedRiskByBarangay]);
  const timeOfDayData = useMemo(() => timePeriods.map((period) => ({
    name: period.label,
    count: spatioFiltered.filter((item) => item.timeOfDay === period.key).length,
    range: period.range,
  })), [spatioFiltered]);
  const riskRows = useMemo(() => enrichedBarangays.map((barangay) => {
    const records = spatioFiltered.filter((item) => item.barangay === barangay.name);
    const periodCounts = Object.fromEntries(timePeriods.map((period) => [
      period.key,
      records.filter((item) => item.timeOfDay === period.key).length,
    ]));

    return {
      ...barangay,
      periodCounts,
    };
  }).sort((first, second) => {
    const riskOrder = { Critical: 4, High: 3, Moderate: 2, Low: 1, Minimal: 0 };
    return (riskOrder[second.riskLevel] - riskOrder[first.riskLevel]) || second.riskScore - first.riskScore || second.count - first.count;
  }).slice(0, 8), [enrichedBarangays, spatioFiltered]);
  const spatioSummary = useMemo(() => {
    const topBarangay = enrichedBarangays[0];
    const peakTime = [...timeOfDayData].sort((first, second) => second.count - first.count)[0];
    const commonIncident = summarizeBy(spatioFiltered, 'classification')[0];
    const riskOrder = { Critical: 4, High: 3, Moderate: 2, Low: 1, Minimal: 0 };
    const highestRisk = [...enrichedBarangays].sort((first, second) => riskOrder[second.riskLevel] - riskOrder[first.riskLevel])[0];

    return {
      topBarangay: topBarangay?.name || 'No data',
      topBarangayCount: topBarangay?.count || 0,
      peakTime: peakTime?.count ? peakTime.name : 'No data',
      peakTimeRange: peakTime?.count ? peakTime.range : 'No matching records',
      commonIncident: commonIncident?.count ? toTitleCase(commonIncident.name) : 'No data',
      commonIncidentCount: commonIncident?.count || 0,
      highestRisk: highestRisk?.riskLevel || 'Minimal',
    };
  }, [enrichedBarangays, spatioFiltered, timeOfDayData]);
  const priority = useMemo(() => summarizeBy(filtered, 'priority'), [filtered]);
  const vehicleType = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.vehicleType), [filtered]);
  const personInvolved = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.personInvolved), [filtered]);
  const engineSize = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.engineSize), [filtered]);
  const license = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.licenseStatus), [filtered]);
  const helmet = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.helmetUsage), [filtered]);
  const alcohol = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.alcoholInvolvement), [filtered]);
  const traumaCount = filtered.filter((item) => item.classification === 'TRAUMA').length;
  const medicalCount = filtered.filter((item) => item.classification === 'MEDICAL').length;
  const mvcCount = filtered.filter((item) => item.classification === 'MVC').length;
  const monthlyTotals = useMemo(() => months.map((month, index) => ({
    month: month.slice(0, 3),
    count: analyticsIncidents.filter(item => item.month === index).length,
  })), [analyticsIncidents]);
  const categoryComparison = useMemo(() => summarizeBy(analyticsIncidents, 'classification').map(item => ({ name: item.name, count: item.count })), [analyticsIncidents]);
  const reportTraumaStats = useMemo(() => summarizeBy(analyticsIncidents.filter(item => item.classification === 'TRAUMA'), 'subtype').map(item => ({ name: item.name || 'Unspecified', count: item.count })), [analyticsIncidents]);
  const reportMedicalStats = useMemo(() => summarizeBy(analyticsIncidents.filter(item => item.classification === 'MEDICAL'), 'subtype').map(item => ({ name: item.name || 'Unspecified', count: item.count })), [analyticsIncidents]);
  const reportMvcStats = useMemo(() => summarizeBy(analyticsIncidents.filter(item => item.mvc), 'subtype').map(item => ({ name: item.name || 'Unspecified', count: item.count })), [analyticsIncidents]);

  return (
    <div className="min-h-full bg-background p-5" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="mb-5 rounded-lg border border-border bg-card px-5 py-4 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
              <Activity className="h-3 w-3" />
              Emergency Intelligence
            </div>
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Analytics Command Center
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Incident trends, barangay hotspots, medical classifications, and MVC risk indicators for Echague operations.
            </p>
          </div>
          <DateFilters range={range} setRange={setRange} customRange={customRange} setCustomRange={setCustomRange} />
        </div>
      </div>
      {loading && <div className="mb-5 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Loading analytics data...</div>}
      {error && <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>}

      {user?.role === ROLES.DISPATCHER && (
        <DispatcherWorkflowCard
          dispatches={dispatches}
          onRecords={() => navigate('/admin/dispatch')}
          onCreate={() => navigate('/admin/dispatch/new')}
        />
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Incidents" value={filtered.length} helper="Filtered emergency records" icon={AlertTriangle} tone="border-red-500/20 bg-red-500/10 text-red-400" />
        <MetricCard label="Barangays Affected" value={barangays.length} helper="With reported activity" icon={MapPinned} tone="border-blue-500/20 bg-blue-500/10 text-blue-400" />
        <MetricCard label="Medical Cases" value={medicalCount} helper={`${traumaCount} trauma cases`} icon={HeartPulse} tone="border-emerald-500/20 bg-emerald-500/10 text-emerald-400" />
        <MetricCard label="MVC Cases" value={mvcCount} helper="Crash-related incidents" icon={Car} tone="border-orange-500/20 bg-orange-500/10 text-orange-400" />
      </div>

      <SpatioTemporalSection
        filteredIncidents={spatioFiltered}
        enrichedBarangays={enrichedBarangays}
        timeOfDayData={timeOfDayData}
        riskRows={riskRows}
        summary={spatioSummary}
        filterOptionsData={spatioFilterOptions}
        filters={spatioFilters}
        setFilters={setSpatioFilters}
        layerVisibility={spatioLayers}
        setLayerVisibility={setSpatioLayers}
        range={range}
        customRange={customRange}
      />

      <SectionHeader title="Barangay and Priority Intelligence" subtitle="Operational ranking and severity mix for the selected date range" />
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Incidents by Barangay</h3>
              <p className="text-xs text-muted-foreground">Highest to lowest ranking with share and trend indicator</p>
            </div>
            <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5">
              <button onClick={() => setRankingView('bar')} className={`grid h-7 w-7 place-items-center rounded-md ${rankingView === 'bar' ? 'bg-blue-600 text-white' : 'text-muted-foreground'}`} title="Bar chart">
                <BarChart2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setRankingView('table')} className={`grid h-7 w-7 place-items-center rounded-md ${rankingView === 'table' ? 'bg-blue-600 text-white' : 'text-muted-foreground'}`} title="Table">
                <Calendar className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {rankingView === 'bar' ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={enrichedBarangays} layout="vertical" margin={{ top: 0, right: 12, left: 28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#94a3b8' }} width={86} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Incidents" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <RankingTable rows={enrichedBarangays} />}
        </div>

        <DistributionCard title="Incidents by Priority" subtitle="Pie, bar, and percentage distribution" data={priority.map((item) => ({ ...item, color: priorityColors[item.name] }))} type="pie" />
      </div>

      <SectionHeader title="Overall Analytics Visualizations" subtitle="Report-grade charts moved from spreadsheet analytics for faster operational review" />
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <ReportChartCard title="Monthly Incident Trend" subtitle="Monthly totals across all report categories" data={monthlyTotals} kind="line" />
        <ReportChartCard title="Incident Category Comparison" subtitle="Major category totals from spreadsheet reports" data={categoryComparison} />
        <ReportChartCard title="Trauma Statistics" subtitle="Fall, electrocution, domestic violence, and fire rescue" data={reportTraumaStats} />
        <ReportChartCard title="Medical Statistics" subtitle="Pediatric, psychiatric, surgical, and obstetrical cases" data={reportMedicalStats} kind="pie" />
      </div>

      <div>
        <SectionHeader title="Motor Vehicle Crash Analytics" subtitle="Crash profile, vehicle involvement, and road safety compliance indicators" />
        <div className="grid gap-5 xl:grid-cols-2">
          <ReportChartCard title="MVC Statistics" subtitle="Collision and self-accident totals from spreadsheet reports" data={reportMvcStats} />
          <DistributionCard title="Vehicle Type" subtitle="Bicycle, tricycle, motorcycle, private vehicle, public utility vehicle, and others" data={vehicleType} />
          <DistributionCard title="Person Involved" subtitle="Driver, passenger, and pedestrian" data={personInvolved} />
          <DistributionCard title="Engine Size" subtitle="Below 4500cc and above 4500cc" data={engineSize} />
          <div className="xl:col-span-2">
            <ComplianceBarsCard license={license} helmet={helmet} alcohol={alcohol} />
          </div>
        </div>
      </div>
    </div>
  );
}
