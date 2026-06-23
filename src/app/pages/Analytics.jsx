import { createElement, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart2, Calendar, Car, HeartPulse, MapPinned, ShieldCheck, TrendingDown, TrendingUp,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarangayHeatmap } from '../components/analytics/BarangayHeatmap';
import {
  analyticsIncidents, filterIncidentsByRange, filterOptions, getBarangayStats, months, reportRows, summarizeBy,
} from '../data/analyticsModule';

const colors = ['#2563eb', '#dc2626', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#8b5cf6', '#64748b'];

const priorityColors = {
  Critical: '#dc2626',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

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
            <th className="px-3 py-2 text-right font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-border/60">
              <td className="px-4 py-2 text-foreground">{row.name}</td>
              <td className="px-3 py-2 text-right font-semibold text-foreground">{row.count}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{row.percent}%</td>
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
  const [range, setRange] = useState('today');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [rankingView, setRankingView] = useState('bar');

  const filtered = useMemo(() => filterIncidentsByRange(analyticsIncidents, range, customRange), [range, customRange]);
  const barangays = useMemo(() => getBarangayStats(filtered).filter((item) => item.count > 0), [filtered]);
  const priority = useMemo(() => summarizeBy(filtered, 'priority'), [filtered]);
  const vehicleType = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.vehicleType), [filtered]);
  const personInvolved = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.personInvolved), [filtered]);
  const engineSize = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.engineSize), [filtered]);
  const license = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.licenseStatus), [filtered]);
  const helmet = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.helmetUsage), [filtered]);
  const alcohol = useMemo(() => summarizeBy(filtered.filter((item) => item.mvc), (item) => item.mvc.alcoholInvolvement), [filtered]);
  const traumaCount = filtered.filter((item) => item.classification === 'Trauma').length;
  const medicalCount = filtered.filter((item) => item.classification === 'Medical').length;
  const mvcCount = filtered.filter((item) => item.classification === 'MVC').length;
  const monthlyTotals = useMemo(() => months.map((month, index) => ({
    month: month.slice(0, 3),
    count: reportRows.reduce((sum, row) => sum + row.values[index], 0),
  })), []);
  const categoryComparison = useMemo(() => ['Medical', 'Trauma', 'Motor Vehicle Crash Type', 'Conduction', 'Dialysis'].map((category) => {
    const row = reportRows.find((item) => item.category === category);
    return { name: category === 'Motor Vehicle Crash Type' ? 'MVC' : category, count: row?.total || 0 };
  }), []);
  const reportTraumaStats = useMemo(() => reportRows
    .filter((row) => ['Fall', 'Electrocution', 'Domestic Violence', 'Fire Rescue Incident'].includes(row.category))
    .map((row) => ({ name: row.category, count: row.total })), []);
  const reportMedicalStats = useMemo(() => reportRows
    .filter((row) => ['Pediatric', 'Psychiatric', 'Surgical', 'Obstetrical'].includes(row.category))
    .map((row) => ({ name: row.category, count: row.total })), []);
  const reportMvcStats = useMemo(() => reportRows
    .filter((row) => ['Collision', 'Self-Accident'].includes(row.category))
    .map((row) => ({ name: row.category, count: row.total })), []);

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

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Incidents" value={filtered.length} helper="Filtered emergency records" icon={AlertTriangle} tone="border-red-500/20 bg-red-500/10 text-red-400" />
        <MetricCard label="Barangays Affected" value={barangays.length} helper="With reported activity" icon={MapPinned} tone="border-blue-500/20 bg-blue-500/10 text-blue-400" />
        <MetricCard label="Medical Cases" value={medicalCount} helper={`${traumaCount} trauma cases`} icon={HeartPulse} tone="border-emerald-500/20 bg-emerald-500/10 text-emerald-400" />
        <MetricCard label="MVC Cases" value={mvcCount} helper="Crash-related incidents" icon={Car} tone="border-orange-500/20 bg-orange-500/10 text-orange-400" />
      </div>

      <div className="mb-5">
        <BarangayHeatmap
          incidents={filtered}
          allIncidents={analyticsIncidents}
          range={range}
          customRange={customRange}
          title="Incidents by Barangay GIS Dashboard"
        />
      </div>

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
              <BarChart data={barangays} layout="vertical" margin={{ top: 0, right: 12, left: 28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#94a3b8' }} width={86} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Incidents" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <RankingTable rows={barangays} />}
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
