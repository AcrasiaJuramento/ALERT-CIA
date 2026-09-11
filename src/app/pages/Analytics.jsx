import { createElement, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, Building2, CheckCircle2, Clock, FilePlus2, FileText, HeartPulse, Layers3, MapPinned, ShieldCheck, TrendingDown, TrendingUp,
  Radio, X,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarangayHeatmap } from '../components/analytics/BarangayHeatmap';
import {
  filterIncidentsByRange, filterOptions, formatBarangayAnalyticsLabel, getBarangayStats, summarizeBy,
} from '../data/analyticsModule';
import { ECHAGUE_BARANGAYS, matchBarangayName } from '../data/gisConfig';
import { getStaffAllRecordsAnalytics, listDispatchRecords, listIncidents, listPCRAnalyticsReports, listPCRReports, listReceivedDispatchRecords, supabase } from '../services/supabase';
import { ROLES } from '../access/rbac';
import { useAuth } from '../contexts/AuthContext';
import { calculateAccidentProneAreas } from '../utils/accidentProneAreas';
import { createInformationalRefresh } from '../utils/informationalRefresh';

const colors = ['#2563eb', '#dc2626', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#8b5cf6', '#64748b'];

const priorityColors = {
  Critical: '#dc2626',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const settledValue = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback);
const submittedStatuses = new Set(['Submitted', 'Verified', 'Completed']);
const analyticsPageSize = 1000;
const analyticsRpcMissingCodes = new Set(['PGRST202', '42883']);
const verifiedRecordStatuses = new Set(['verified', 'completed', 'admin_verified', 'approved']);
const verifiedDisplayStatuses = new Set(['Verified', 'Completed', 'Admin Verified', 'Approved']);

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

const analyticsTabs = [
  ['overview', 'Overview'],
  ['spatial', 'Map'],
  ['operations', 'Operations'],
  ['mvc', 'MVC Safety'],
  ['pcr', 'PCR'],
  ['comparative', 'Comparative Analysis'],
  ['response-segments', 'Response Time Segmentation'],
];

const locationScopeOptions = [
  { value: 'all', label: 'All Locations' },
  { value: 'echague', label: 'Echague Only' },
  { value: 'outside', label: 'Outside Echague' },
  { value: 'missing', label: 'No Location Data' },
];

const teamFamilies = ['Alpha', 'Bravo', 'Charlie'];
const standardTeamNames = [
  ...Array.from({ length: 8 }, (_, index) => `Alpha Run ${index + 1}`),
  ...Array.from({ length: 8 }, (_, index) => `Bravo Run ${index + 1}`),
  ...Array.from({ length: 3 }, (_, index) => `Charlie Run ${index + 1}`),
];

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

function dateTimeFrom(date, time = '') {
  if (!date) return null;
  const cleanTime = String(time || '00:00').slice(0, 5);
  const parsed = new Date(`${date}T${cleanTime || '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const minutes = (end.getTime() - start.getTime()) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

function average(values = []) {
  const clean = values.filter(value => Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function primaryLocationName(item = {}) {
  const candidates = [
    item.barangay,
    item.verifiedBarangay,
    item.extractedBarangay,
    item.location,
    item.placeOfIncident,
    item.locationText,
    item.municipality,
  ].map(value => String(value || '').trim()).filter(Boolean);
  const barangayMatch = candidates
    .map(value => matchBarangayName(value, ECHAGUE_BARANGAYS))
    .find(value => ECHAGUE_BARANGAYS.includes(value));
  return barangayMatch || candidates.find(value => !['Unspecified', 'No location data'].includes(value)) || '';
}

function locationScopeForItem(item = {}) {
  const name = primaryLocationName(item);
  if (!name || name === 'Unspecified' || name === 'No location data') return 'missing';
  const matched = matchBarangayName(name, ECHAGUE_BARANGAYS);
  return ECHAGUE_BARANGAYS.includes(matched) ? 'echague' : 'outside';
}

function filterByLocationScope(items = [], scope = 'all') {
  if (scope === 'all') return items;
  return items.filter(item => locationScopeForItem(item) === scope);
}

function teamName(record = {}) {
  return String(record.team || record.respondingTeam || '').trim() || 'Unassigned';
}

function parseTeamRun(name = '') {
  const match = String(name).trim().match(/^(Alpha|Bravo|Charlie)\s+Run\s+(\d+)$/i);
  if (!match) return { family: 'Other', run: null };
  return { family: toTitleCase(match[1]), run: Number(match[2]) };
}

function buildRecordSummary(record = {}) {
  return {
    id: record.id || record.responseId || record.responseNumber || `${record.date}-${record.time}-${primaryLocationName(record)}`,
    date: record.date || record.dateOfIncident || record.submittedAt || '',
    time: record.time || record.timeOfIncident || record.dispatchedTime || '',
    title: record.classification || record.type || record.incidentType || record.status || 'Record',
    location: primaryLocationName(record) || 'No location data',
    priority: record.priority || record.triage || record.status || '',
  };
}

function completionPercent(total, complete) {
  return total ? Math.round((complete / total) * 100) : 0;
}

function formatMinutes(value) {
  if (!Number.isFinite(value)) return 'No data';
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${minutes}m`;
}

function pcrAnalyticsDate(record = {}) {
  return String(record.dateOfIncident || record.date || record.submittedAt || record.completedAt || record.createdAt || '').slice(0, 10);
}

function pcrIncidentTime(record = {}) {
  return record.timeOfIncident || record.time || '';
}

function normalizeAnalyticsLabel(value, fallback = 'Unspecified') {
  const clean = String(value || '').trim();
  return clean ? toTitleCase(clean) : fallback;
}

function normalizeCrashRole(value = '') {
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) return 'No Role Recorded';
  if (clean.includes('driver')) return 'Driver';
  if (clean.includes('passenger')) return 'Passenger';
  if (clean.includes('pedestrian')) return 'Pedestrian';
  return toTitleCase(clean);
}

function normalizeYesNo(value = '', fallback = 'No Data') {
  const clean = String(value || '').trim().toLowerCase();
  if (!clean) return fallback;
  if (['positive', 'yes', 'with', 'licensed', 'wearing'].includes(clean)) return 'Yes';
  if (['negative', 'no', 'none', 'without', 'unlicensed'].includes(clean)) return 'No';
  if (clean === 'n/a' || clean.includes('not applicable')) return 'Not Applicable';
  return toTitleCase(clean);
}

function hasCrashData(report = {}) {
  const crash = report.crash || {};
  return Boolean(
    crash.selfAccident
    || crash.collision
    || crash.vehicle
    || crash.role
    || crash.alcohol
    || crash.helmet
    || crash.license
    || report.traumaTypes?.some(type => String(type).toLowerCase().includes('vehicle'))
    || String(report.incidentNature || '').toLowerCase().includes('vehicle')
  );
}

function isMvcIncident(record = {}) {
  const classification = String(record.classification || '').toUpperCase();
  const type = String(record.type || '').toLowerCase();
  return classification === 'MVC' || type === 'vehicular';
}

function isAnalyticsRpcMissing(error) {
  return analyticsRpcMissingCodes.has(error?.code) || String(error?.message || '').includes('staff_all_records_analytics');
}

function analyticsTabsForRole(role) {
  if (role === ROLES.DISPATCHER) {
    return [
      ['overview', 'Overview'],
      ['operations', 'Dispatch Operations'],
      ['pcr', 'PCR Workflow'],
    ];
  }
  if (role === ROLES.FIELD_OFFICER) {
    return [
      ['overview', 'My Field Work'],
      ['operations', 'Team Dispatches'],
      ['pcr', 'My PCRs'],
    ];
  }
  return analyticsTabs;
}

function analyticsHeaderForRole(role) {
  if (role === ROLES.DISPATCHER) {
    return {
      eyebrow: 'Dispatch Intelligence',
      title: 'Dispatch Operations Analytics',
      description: 'Dispatch workflow, handoff, and PCR review signals scoped to dispatcher operations.',
      source: 'Dispatcher analytics loads a capped operational dataset and avoids full municipal all-record analytics.',
    };
  }
  if (role === ROLES.FIELD_OFFICER) {
    return {
      eyebrow: 'Field Intelligence',
      title: 'My Field Analytics',
      description: 'Assigned dispatches, submitted PCRs, and team workload signals for the current field officer.',
      source: 'Field analytics loads only assigned dispatches and relevant PCR workflow records for a lighter mobile-friendly view.',
    };
  }
  return {
    eyebrow: 'Emergency Intelligence',
    title: 'Analytics Command Center',
    description: 'Incident trends, barangay hotspots, medical classifications, and MVC risk indicators based only on official admin-verified MDRRMO records.',
    source: 'Analytics source: Official MDRRMO records only. Scraped or external records are excluded; incident, dispatch, and PCR analytics use admin-verified official data.',
  };
}

function isAdminVerifiedIncident(record = {}) {
  return verifiedRecordStatuses.has(String(record.status || '').trim().toLowerCase());
}

function isVerifiedWorkflowRecord(record = {}) {
  return verifiedDisplayStatuses.has(String(record.status || '').trim());
}

function priorityFromPcrTriage(report = {}) {
  const triage = String(report.triage || report.priority || '').trim().toLowerCase();
  if (['critical', 'red', 'emergent', 'immediate'].some(value => triage.includes(value))) return 'Critical';
  if (['urgent', 'high', 'yellow'].some(value => triage.includes(value))) return 'High';
  if (['minor', 'low', 'green', 'non-urgent'].some(value => triage.includes(value))) return 'Low';
  return 'Medium';
}

function pcrClassification(report = {}) {
  const incidentNature = String(report.incidentNature || report.typeOfIncident || '').trim().toLowerCase();
  const traumaTypes = report.traumaTypes || [];
  const emergencyTypes = report.emergencyTypes || [];
  const traumaText = traumaTypes.map(type => String(type).toLowerCase()).join(' ');

  if (hasCrashData(report) || ['mvc', 'motor', 'vehicle', 'vehicular', 'collision', 'crash'].some(value => `${incidentNature} ${traumaText}`.includes(value))) {
    return 'MVC';
  }
  if (incidentNature.includes('medical') || emergencyTypes.length) return 'MEDICAL';
  if (incidentNature.includes('trauma') || traumaTypes.length) return 'TRAUMA';
  return normalizeAnalyticsLabel(report.incidentNature || report.typeOfIncident || 'Other').toUpperCase();
}

function pcrBarangay(report = {}) {
  const value = report.barangay?.name || report.barangay || report.response?.barangay?.name || report.response?.barangay;
  return String(value || '').trim() || 'Unspecified';
}

function pcrMunicipality(report = {}) {
  const value = report.municipality || report.barangay?.municipality || report.response?.barangay?.municipality || report.response?.municipality;
  return String(value || '').trim();
}

function pcrLocationText(report = {}) {
  return report.locationText || report.placeOfIncident || report.address || pcrBarangay(report);
}

function pcrCoordinates(report = {}) {
  const lat = Number(report.lat ?? report.latitude);
  const lng = Number(report.lng ?? report.lon ?? report.longitude);
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function pcrReportToAnalyticsIncident(report = {}) {
  const date = pcrAnalyticsDate(report);
  const time = pcrIncidentTime(report);
  const { lat, lng } = pcrCoordinates(report);
  const classification = pcrClassification(report);
  return {
    ...report,
    id: `PCR-${report.id || report.pcrId || report.responseId || report.pcrClientId}`,
    recordSource: 'verified_pcr',
    sourceKind: 'mdrrmo',
    classification,
    type: classification === 'MVC' ? 'vehicular' : classification.toLowerCase(),
    priority: priorityFromPcrTriage(report),
    severity: priorityFromPcrTriage(report),
    barangay: pcrBarangay(report),
    municipality: pcrMunicipality(report),
    date,
    time,
    timeOfDay: getTimeOfDay(time),
    month: date ? new Date(date).getMonth() : 0,
    location: pcrLocationText(report),
    locationText: pcrLocationText(report),
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    status: 'verified',
    pcrStatus: report.status,
    title: report.responseNumber || report.chiefComplaint || `${classification} verified PCR`,
  };
}

async function loadAllRows(loader, params = {}) {
  const allRows = [];
  let from = 0;
  while (true) {
    const rows = await loader({ ...params, limit: analyticsPageSize, from });
    allRows.push(...rows);
    if (rows.length < analyticsPageSize || (rows.totalCount && allRows.length >= rows.totalCount)) break;
    from += analyticsPageSize;
  }
  return allRows;
}

async function loadRoleScopedAnalytics(role, user) {
  if (role === ROLES.FIELD_OFFICER) {
    const dispatchRows = await listReceivedDispatchRecords({ limit: 100 }).catch(() => []);
    const responseIds = new Set(dispatchRows.map(record => record.responseId).filter(Boolean));
    const pcrRows = await listPCRAnalyticsReports({ fieldOfficerId: user?.id, responseIds: [...responseIds], limit: 100 }).catch(() => []);
    const scopedPcrRows = pcrRows.filter(report =>
      report.fieldOfficerId === user?.id
      || responseIds.has(report.responseId)
    );
    return {
      incidents: [],
      dispatches: dispatchRows,
      pcrReports: scopedPcrRows,
    };
  }

  if (role === ROLES.DISPATCHER) {
    const [dispatchRows, pcrRows] = await Promise.all([
      listDispatchRecords({ limit: 150 }).catch(() => []),
      listPCRAnalyticsReports({ limit: 120 }).catch(() => []),
    ]);
    return {
      incidents: [],
      dispatches: dispatchRows,
      pcrReports: pcrRows,
    };
  }

  return null;
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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-sm">
      <div className="flex max-w-full overflow-x-auto rounded-md border border-border bg-secondary/40 text-xs">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setRange(option.value)}
            className={`whitespace-nowrap px-3 py-2 font-medium transition-all ${range === option.value ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
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

function RankingTable({ rows, selectedName = '', onSelectRow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Barangay</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Share</th>
            <th className="px-3 py-2 text-right font-medium">Morning</th>
            <th className="px-3 py-2 text-right font-medium">Afternoon</th>
            <th className="px-3 py-2 text-right font-medium">Evening</th>
            <th className="px-3 py-2 text-right font-medium">Midnight</th>
            <th className="px-3 py-2 text-left font-medium">Peak Time</th>
            <th className="px-3 py-2 text-left font-medium">Most Common Incident</th>
            <th className="px-3 py-2 text-left font-medium">Risk Level</th>
            <th className="px-3 py-2 text-right font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.name}
              className={`border-b border-border/60 transition-colors ${selectedName === row.name ? 'bg-blue-500/10' : onSelectRow ? 'hover:bg-secondary/45' : ''}`}
            >
              <td className="px-4 py-2 text-foreground">
                {onSelectRow ? (
                  <button type="button" onClick={() => onSelectRow(row)} className="text-left font-semibold text-blue-300 hover:text-blue-200">
                    {row.name}
                  </button>
                ) : row.name}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-foreground">{row.count}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{row.percent}%</td>
              {timePeriods.map((period) => (
                <td key={`${row.name}-${period.key}`} className="px-3 py-2 text-right text-muted-foreground">{row.periodCounts?.[period.key] || 0}</td>
              ))}
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
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-blue-500/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold leading-none text-foreground">{value}</div>
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

function SectionNav({ activeTab, onChange, tabs = analyticsTabs }) {
  return (
    <div className="mb-5 flex max-w-full gap-2 overflow-x-auto rounded-lg border border-border bg-card p-2 text-xs shadow-sm">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`whitespace-nowrap rounded-md border px-3 py-2 font-semibold transition-colors ${
            activeTab === id
              ? 'border-blue-500/40 bg-blue-600 text-white shadow-sm'
              : 'border-border bg-secondary/40 text-muted-foreground hover:border-blue-500/40 hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DataCoverageBar({ incidents, dispatches, pcrReports, mvcRecords, mvcWithCrashDetails }) {
  const items = [
    ['Incidents', incidents.length],
    ['Dispatches', dispatches.length],
    ['PCR Reports', pcrReports.length],
    ['MVC Records', mvcRecords.length],
    ['MVC With Crash Details', mvcWithCrashDetails],
  ];

  return (
    <details className="mb-5 rounded-lg border border-border bg-card shadow-sm">
      <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
        Data coverage
      </summary>
      <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 xl:grid-cols-5">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md bg-secondary/35 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-bold leading-none text-foreground">{value}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

function ActionableInsights({ insights }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">Actionable Insights</h2>
          <p className="text-xs text-muted-foreground">Priority signals with direct drill-downs.</p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {insights.length} item{insights.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {insights.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={item.onClick}
            className="group flex min-h-32 w-full flex-col justify-between rounded-lg border border-border bg-secondary/25 p-3 text-left transition-colors hover:border-blue-500/40 hover:bg-blue-500/10"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.title}</div>
                <div className="mt-1 truncate text-base font-bold text-foreground">{item.value}</div>
              </div>
              <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${item.tone || 'border-blue-500/25 bg-blue-500/10 text-blue-300'}`}>
                {item.badge}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.helper}</p>
            <div className="mt-3 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-blue-300 transition-colors group-hover:text-blue-200">
              Open drill-down
            </div>
          </button>
        ))}
        {!insights.length && (
          <div className="rounded-lg border border-border bg-secondary/30 px-3 py-6 text-center text-xs text-muted-foreground md:col-span-2 xl:col-span-4">
            No action items for the current filters.
          </div>
        )}
      </div>
    </section>
  );
}

function DrilldownDrawer({ drilldown, onClose }) {
  if (!drilldown) return null;
  const records = drilldown.records || [];
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-start justify-end p-3 pt-24 lg:p-5 lg:pt-24" role="dialog" aria-modal="false">
      <div className="pointer-events-auto flex max-h-[calc(100vh-7rem)] w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-card/95 shadow-2xl backdrop-blur sm:max-w-md">
        <div className="flex items-start justify-between gap-3 border-b border-border bg-secondary/20 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-300">Drill-down</div>
            <h2 className="mt-1 text-sm font-bold leading-5 text-foreground">{drilldown.title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{drilldown.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close drilldown">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-border px-4 py-2 text-xs font-semibold text-muted-foreground">
          {records.length} matching record{records.length === 1 ? '' : 's'}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {records.map((record) => {
              const item = buildRecordSummary(record);
              return (
                <div key={item.id} className="rounded-lg border border-border bg-secondary/25 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{toTitleCase(item.title)}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.location}</div>
                    </div>
                    <div className="shrink-0 text-right text-[10px] font-semibold text-muted-foreground">
                      <div>{item.date || 'No date'}</div>
                      <div>{item.time || 'No time'}</div>
                    </div>
                  </div>
                  {item.priority && <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-blue-300">{item.priority}</div>}
                </div>
              );
            })}
            {!records.length && (
              <div className="rounded-lg border border-border bg-secondary/30 px-3 py-8 text-center text-xs text-muted-foreground">
                No matching records to show.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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

function OverviewSection({
  filtered,
  filteredDispatches,
  filteredPcrReports,
  spatioFiltered,
  summary,
  range,
  customRange,
  avgResponseMinutes,
  avgSceneMinutes,
  submittedPcrCount,
  medicalCount,
  traumaCount,
  mvcAccidentRecords,
  mvcWithCrashDetails,
  actionableInsights,
  onOpenTab,
}) {
  const crashDetailPercent = mvcAccidentRecords.length
    ? Math.round((mvcWithCrashDetails / mvcAccidentRecords.length) * 100)
    : 0;
  const submittedPcrPercent = filteredPcrReports.length
    ? Math.round((submittedPcrCount / filteredPcrReports.length) * 100)
    : 0;
  const insightRows = [
    {
      title: 'Highest road-risk barangay',
      value: summary.topBarangay,
      helper: `${summary.topBarangayCount} matching incident${summary.topBarangayCount === 1 ? '' : 's'} in the selected range`,
    },
    {
      title: 'Peak incident window',
      value: summary.peakTime,
      helper: summary.peakTimeRange,
    },
    {
      title: 'PCR completion signal',
      value: `${submittedPcrPercent}% submitted`,
      helper: `${submittedPcrCount} of ${filteredPcrReports.length} verified PCR record${filteredPcrReports.length === 1 ? '' : 's'}`,
    },
    {
      title: 'MVC crash detail completeness',
      value: `${crashDetailPercent}% complete`,
      helper: `${mvcWithCrashDetails} of ${mvcAccidentRecords.length} MVC record${mvcAccidentRecords.length === 1 ? '' : 's'} have linked crash details`,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Incidents" value={filtered.length} helper="Official admin-verified records" icon={AlertTriangle} tone="border-red-500/20 bg-red-500/10 text-red-400" />
        <MetricCard label="Avg Response Time" value={formatMinutes(avgResponseMinutes)} helper={`${filteredDispatches.length} dispatch records`} icon={Clock} tone="border-blue-500/20 bg-blue-500/10 text-blue-400" />
        <MetricCard label="Submitted PCRs" value={submittedPcrCount} helper={`${filteredPcrReports.length} PCR records in range`} icon={CheckCircle2} tone="border-emerald-500/20 bg-emerald-500/10 text-emerald-400" />
        <MetricCard label="Medical / Trauma" value={`${medicalCount}/${traumaCount}`} helper={`Avg scene ${formatMinutes(avgSceneMinutes)}`} icon={HeartPulse} tone="border-orange-500/20 bg-orange-500/10 text-orange-400" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <BarangayHeatmap
          incidents={spatioFiltered}
          allIncidents={spatioFiltered}
          range={range}
          customRange={customRange}
          title="Road Risk Overview"
          compact
          showDetailsPanel={false}
          compactMapClassName="min-h-[420px]"
          layerVisibility={{ boundary: true, incidentMarkers: true, heatmap: true, criticalZones: true }}
        />

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold text-foreground">Key Insights</h2>
            <p className="text-xs text-muted-foreground">The most important signals from the current filter.</p>
          </div>
          <div className="space-y-3">
            {insightRows.map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.title}</div>
                    <div className="mt-1 line-clamp-2 text-base font-bold leading-5 text-foreground">{item.value}</div>
                  </div>
                  {item.badge && (
                    <span className="shrink-0 rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.helper}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onOpenTab('spatial')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500">
              Open Map
            </button>
            <button type="button" onClick={() => onOpenTab('operations')} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
              Operations
            </button>
          </div>
        </section>
      </div>

      <ActionableInsights insights={actionableInsights} />
    </div>
  );
}

function ScopedOverviewSection({
  role,
  filteredDispatches,
  filteredPcrReports,
  avgResponseMinutes,
  avgSceneMinutes,
  submittedPcrCount,
  dispatchStatusStats,
  pcrStatusStats,
  onOpenTab,
}) {
  const dispatcher = role === ROLES.DISPATCHER;
  const pendingPcr = Math.max(filteredDispatches.length - submittedPcrCount, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={dispatcher ? 'Dispatch Records' : 'Assigned Dispatches'} value={filteredDispatches.length} helper="Scoped workflow records" icon={Radio} tone="border-blue-500/20 bg-blue-500/10 text-blue-400" />
        <MetricCard label="Submitted PCRs" value={submittedPcrCount} helper={`${filteredPcrReports.length} PCR records loaded`} icon={CheckCircle2} tone="border-emerald-500/20 bg-emerald-500/10 text-emerald-400" />
        <MetricCard label="Pending PCR Work" value={pendingPcr} helper="Dispatches without submitted PCR signal" icon={FileText} tone="border-amber-500/20 bg-amber-500/10 text-amber-400" />
        <MetricCard label="Avg Response Time" value={formatMinutes(avgResponseMinutes)} helper={`Avg scene ${formatMinutes(avgSceneMinutes)}`} icon={Clock} tone="border-cyan-500/20 bg-cyan-500/10 text-cyan-400" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <DistributionCard title={dispatcher ? 'Dispatch Status Mix' : 'Assigned Dispatch Status'} subtitle="Workflow status from scoped dispatch records" data={dispatchStatusStats} type="pie" />
        <DistributionCard title="PCR Status Mix" subtitle="PCR workflow records visible to this role" data={pcrStatusStats} type="pie" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onOpenTab('operations')} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500">
          Operations
        </button>
        <button type="button" onClick={() => onOpenTab('pcr')} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
          PCR Workflow
        </button>
      </div>
    </div>
  );
}

function SpatioTemporalSection({
  filteredIncidents,
  enrichedBarangays,
  timeOfDayData,
  priorityData,
  summary,
  filterOptionsData,
  filters,
  setFilters,
  layerVisibility,
  setLayerVisibility,
  range,
  customRange,
  locationScope,
  setLocationScope,
  selectedBarangayName,
  setSelectedBarangayName,
  onDrilldown,
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
          <div className="grid gap-3 sm:grid-cols-2 xl:w-[820px] xl:grid-cols-5">
            <FilterSelect label="Incident Type" value={filters.type} onChange={(value) => setFilters((current) => ({ ...current, type: value }))} options={filterOptionsData.types} />
            <FilterSelect label="Barangay" value={filters.barangay} onChange={(value) => setFilters((current) => ({ ...current, barangay: value }))} options={filterOptionsData.barangays} />
            <FilterSelect label="Severity" value={filters.severity} onChange={(value) => setFilters((current) => ({ ...current, severity: value }))} options={filterOptionsData.severities} />
            <FilterSelect label="Time of Day" value={filters.timeOfDay} onChange={(value) => setFilters((current) => ({ ...current, timeOfDay: value }))} options={timeOfDayOptions} />
            <FilterSelect label="Location Scope" value={locationScope} onChange={setLocationScope} options={locationScopeOptions} />
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
        selectedName={selectedBarangayName}
        onSelectName={setSelectedBarangayName}
      />

      <div className="grid gap-5 xl:grid-cols-2">
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

        <DistributionCard
          title="Incidents by Priority"
          subtitle="Severity mix for the selected range and spatial filters"
          data={priorityData}
          type="pie"
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Incidents by Barangay</h3>
          <p className="text-xs text-muted-foreground">Barangay ranking with morning, afternoon, evening, midnight, peak time, and risk level</p>
        </div>
        <RankingTable
          rows={enrichedBarangays}
          selectedName={selectedBarangayName}
          onSelectRow={(row) => {
            setSelectedBarangayName(row.name);
            onDrilldown({
              title: row.name,
              subtitle: 'Filtered incident records for this location.',
              records: row.records || [],
            });
          }}
        />
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3 flex flex-col gap-1 border-l-2 border-blue-500/70 pl-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-base font-bold text-foreground">{title}</h2>
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
  const hasData = data.some(item => item.count > 0);
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const visibleData = data.slice(0, 8);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitle}</p>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-secondary/50 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          {total} total
        </span>
      </div>
      {!hasData && (
        <div className="rounded-lg border border-border bg-secondary/30 px-3 py-8 text-center text-xs text-muted-foreground">
          No matching database records for this date range
        </div>
      )}
      {hasData && (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <ResponsiveContainer width="100%" height={220}>
          {type === 'pie' ? (
            <PieChart>
              <Pie data={visibleData} dataKey="count" nameKey="name" innerRadius={55} outerRadius={86} paddingAngle={2}>
                {visibleData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          ) : (
            <BarChart data={visibleData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                {visibleData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
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
      )}
    </div>
  );
}

function HorizontalMiniBars({ title, data, accent = '#2563eb', emptyText = 'No records in this range' }) {
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
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function OperationalBreakdownCard({ title, subtitle, groups }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
          Database Records
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {groups.map(group => (
          <HorizontalMiniBars key={group.title} title={group.title} data={group.data} accent={group.accent} emptyText={group.emptyText} />
        ))}
      </div>
    </div>
  );
}

function HospitalRefusalCard({ records, stats, onSelectHospital }) {
  const pageSize = 8;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const visibleRecords = records.slice(pageStart, pageStart + pageSize);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm xl:col-span-2">
      <div className="flex flex-col gap-4 border-b border-border bg-secondary/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-500"><Building2 className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Treatment / Transport Refusal by Facility</h3>
            <p className="mt-1 text-xs text-muted-foreground">The same PCR waiver records counted as “Refusal documented” in Clinical Analytics.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
          <div className="text-2xl font-bold tabular-nums text-foreground">{records.length}</div>
          <div className="border-l border-border pl-3 text-[10px] font-semibold uppercase leading-4 tracking-wide text-muted-foreground">Recorded<br/>cases</div>
        </div>
      </div>
      {stats.length ? (
        <>
          <div className="flex flex-wrap gap-2 border-b border-border px-5 py-4">
            {stats.map(item => (
              <button key={item.name} type="button" onClick={() => onSelectHospital?.(item.name)} className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-blue-500/30 hover:bg-blue-500/10">
                <span className="max-w-56 truncate">{item.name}</span><span className="grid min-w-5 place-items-center rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.count}</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-xs">
              <thead><tr className="border-b border-border bg-secondary/20 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><th className="px-5 py-3">Hospital / Facility</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Reference</th><th className="px-5 py-3 text-right">Incident date</th></tr></thead>
              <tbody>{visibleRecords.map(record => (
                <tr key={record.id || `${record.responseNumber}-${record.transferReason}`} className="border-b border-border/60 last:border-0 hover:bg-secondary/20">
                  <td className="px-5 py-3 font-semibold text-foreground">{record.hospitalName}</td>
                  <td className="max-w-md px-4 py-3 text-muted-foreground">{record.transferReason}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{record.responseNumber || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-muted-foreground">{record.date ? new Date(`${record.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-border bg-secondary/10 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-muted-foreground">Showing <span className="font-semibold text-foreground">{pageStart + 1}–{Math.min(pageStart + pageSize, records.length)}</span> of <span className="font-semibold text-foreground">{records.length}</span> records</div>
            {pageCount > 1 && <div className="flex items-center gap-1.5">
              <button type="button" disabled={safePage === 1} onClick={() => setPage(current => Math.max(1, current - 1))} className="rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).map(pageNumber => <button key={pageNumber} type="button" aria-label={`Page ${pageNumber}`} aria-current={pageNumber === safePage ? 'page' : undefined} onClick={() => setPage(pageNumber)} className={`grid h-7 min-w-7 place-items-center rounded-md border px-2 text-[11px] font-semibold ${pageNumber === safePage ? 'border-blue-600 bg-blue-600 text-white' : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>{pageNumber}</button>)}
              <button type="button" disabled={safePage === pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))} className="rounded-md border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40">Next</button>
            </div>}
          </div>
        </>
      ) : <div className="flex flex-col items-center px-5 py-12 text-center"><Building2 className="mb-3 h-8 w-8 text-muted-foreground/50"/><div className="text-sm font-medium text-foreground">No refusal records for this period</div><div className="mt-1 text-xs text-muted-foreground">No treatment or transport refusal waiver was documented.</div></div>}
    </div>
  );
}

function PerformanceTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Barangay</th>
            <th className="px-3 py-2 text-right font-medium">Dispatches</th>
            <th className="px-3 py-2 text-right font-medium">PCR Submitted</th>
            <th className="px-3 py-2 text-right font-medium">Avg Dispatch Response</th>
            <th className="px-3 py-2 text-right font-medium">Avg Scene Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.name} className="border-b border-border/60">
              <td className="px-4 py-2 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{row.dispatches}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{row.submittedPcr}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{formatMinutes(row.avgResponseMinutes)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{formatMinutes(row.avgSceneMinutes)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No dispatch performance records match the selected date range.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TeamRunAnalyticsCard({ rows, familyRows }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Responding Team Run Analytics</h3>
          <p className="text-xs text-muted-foreground">Alpha, Bravo, and Charlie workload by run number.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-muted-foreground">
          {familyRows.map((row) => (
            <div key={row.family} className="rounded-md border border-border bg-secondary/30 px-2 py-1">
              <span className="block text-foreground">{row.dispatches}</span>
              {row.family}
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Team</th>
              <th className="px-3 py-2 text-left font-medium">Group</th>
              <th className="px-3 py-2 text-right font-medium">Dispatches</th>
              <th className="px-3 py-2 text-right font-medium">PCR Submitted</th>
              <th className="px-3 py-2 text-right font-medium">Avg Response</th>
              <th className="px-3 py-2 text-right font-medium">Avg Scene</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.name} className="border-b border-border/60">
                <td className="px-3 py-2 font-semibold text-foreground">{row.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.family}{row.run ? ` ${row.run}` : ''}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{row.dispatches}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{row.submittedPcr}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{formatMinutes(row.avgResponseMinutes)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{formatMinutes(row.avgSceneMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MvcCompletionCard({ rows }) {
  return (
    <div className="mb-5 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">MVC Crash Field Completion</h3>
        <p className="text-xs text-muted-foreground">Missing fields stay visible without crowding the charts.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rows.map(row => (
          <div key={row.label} className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-foreground">{row.label}</span>
              <span className="font-bold text-blue-300">{row.percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${row.percent}%` }} />
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground">{row.complete} complete / {row.missing} missing</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function comparisonPercent(first, second) {
  return second > 0 ? ((first - second) / second) * 100 : first > 0 ? 100 : 0;
}

function ComparisonSelectPair({ type, firstValue, secondValue, setFirst, setSecond, options }) {
  return <div className="flex flex-wrap items-end gap-2">
    <label className="text-[10px] font-semibold uppercase text-muted-foreground">First {type}<select aria-label={`First comparison ${type}`} value={firstValue} onChange={event => setFirst(event.target.value)} className="mt-1 block min-w-32 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium normal-case text-foreground">{options.map(option => <option key={`first-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
    <span className="pb-2 text-xs font-bold text-muted-foreground">vs</span>
    <label className="text-[10px] font-semibold uppercase text-muted-foreground">Second {type}<select aria-label={`Second comparison ${type}`} value={secondValue} onChange={event => setSecond(event.target.value)} className="mt-1 block min-w-32 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium normal-case text-foreground">{options.map(option => <option key={`second-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
  </div>;
}

function ComparisonPeriodCard({ title, data, comparison }) {
  const change = comparison ? comparisonPercent(data.total, comparison.total) : null;
  return <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div><div className="mt-2 text-2xl font-bold text-foreground">{data.total}</div><div className="mt-1 text-xs text-muted-foreground">{data.label}</div></div>{change !== null && <div className={`rounded-md px-2 py-1 text-xs font-bold ${change >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</div>}</div>
    <div className="mt-4 grid grid-cols-3 gap-2">{[['Incidents', data.incidents], ['Dispatches', data.dispatches], ['PCR', data.pcr]].map(([label, value]) => <div key={label} className="min-w-0 rounded-md border border-border bg-secondary/30 px-1 py-2 text-center"><div className="font-bold text-foreground">{value}</div><div className="mt-0.5 whitespace-nowrap text-[8px] uppercase tracking-tighter text-muted-foreground">{label}</div></div>)}</div>
  </div>;
}

function ComparisonChange({ first, second }) {
  const change = comparisonPercent(first, second);
  return <span className={change >= 0 ? 'text-emerald-400' : 'text-red-400'}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</span>;
}

function ComparativeAnalysisSection({ incidents, dispatches, pcrReports }) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const previousYear = currentYear - 1;
  const previousMonthDate = new Date(currentYear, today.getMonth() - 1, 1);
  const yearOptions = [...new Set([
    currentYear,
    previousYear,
    ...[...incidents, ...dispatches, ...pcrReports].map(record => {
      const date = record.date ? new Date(`${String(record.date).slice(0, 10)}T00:00:00`) : null;
      return date && !Number.isNaN(date.getTime()) ? date.getFullYear() : null;
    }).filter(Boolean),
  ])].sort((first, second) => second - first);
  const monthOptions = yearOptions.flatMap(year => months.map((month, index) => ({
    value: `${year}-${String(index + 1).padStart(2, '0')}`,
    label: `${month.slice(0, 3)} ${year}`,
    year,
    month: index,
  })));
  const currentMonthValue = `${currentYear}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const previousMonthValue = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const [firstMonth, setFirstMonth] = useState(currentMonthValue);
  const [secondMonth, setSecondMonth] = useState(previousMonthValue);
  const [firstYear, setFirstYear] = useState(String(currentYear));
  const [secondYear, setSecondYear] = useState(String(previousYear));
  const countPeriod = (records, year, month) => records.filter(record => {
    if (!record.date) return false;
    const date = new Date(`${String(record.date).slice(0, 10)}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(year) && (month === undefined || date.getMonth() === Number(month));
  }).length;
  const period = (year, month) => {
    const values = {
      incidents: countPeriod(incidents, year, month),
      dispatches: countPeriod(dispatches, year, month),
      pcr: countPeriod(pcrReports, year, month),
    };
    return { ...values, total: values.incidents + values.dispatches + values.pcr };
  };
  const monthPeriod = value => {
    const option = monthOptions.find(item => item.value === value) || monthOptions[0];
    return { ...period(option?.year, option?.month), label: option?.label || 'No month' };
  };
  const firstMonthData = monthPeriod(firstMonth);
  const secondMonthData = monthPeriod(secondMonth);
  const firstYearData = { ...period(firstYear), label: firstYear };
  const secondYearData = { ...period(secondYear), label: secondYear };
  const comparisonRows = [
    ['Total Activity', 'total'],
    ['Incidents', 'incidents'],
    ['Dispatches', 'dispatches'],
    ['PCR Reports', 'pcr'],
  ];
  return <section className="space-y-5">
    <SectionHeader title="Comparative Analysis" subtitle="Compare official incidents, dispatches, and PCR reports across selected months and years" />
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-sm font-semibold text-foreground">Month vs Month</h3><p className="text-xs text-muted-foreground">Choose any two available months.</p></div><ComparisonSelectPair type="month" firstValue={firstMonth} secondValue={secondMonth} setFirst={setFirstMonth} setSecond={setSecondMonth} options={monthOptions}/></div>
      <div className="grid gap-3 p-4 md:grid-cols-2"><ComparisonPeriodCard title="First Month" data={firstMonthData} comparison={secondMonthData}/><ComparisonPeriodCard title="Second Month" data={secondMonthData}/></div>
      <div className="overflow-x-auto border-t border-border"><table className="w-full min-w-[620px] text-xs"><thead><tr className="border-b border-border bg-secondary/20 text-left text-[10px] font-semibold uppercase text-muted-foreground"><th className="px-4 py-3">Activity</th><th className="px-4 py-3 text-right">{firstMonthData.label}</th><th className="px-4 py-3 text-right">{secondMonthData.label}</th><th className="px-4 py-3 text-right">Change</th></tr></thead><tbody>{comparisonRows.map(([label, key]) => <tr key={key} className="border-b border-border/60 last:border-0"><td className="px-4 py-3 font-semibold text-foreground">{label}</td><td className="px-4 py-3 text-right text-foreground">{firstMonthData[key]}</td><td className="px-4 py-3 text-right text-muted-foreground">{secondMonthData[key]}</td><td className="px-4 py-3 text-right font-semibold"><ComparisonChange first={firstMonthData[key]} second={secondMonthData[key]}/></td></tr>)}</tbody></table></div>
    </div>
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-sm font-semibold text-foreground">Year vs Year</h3><p className="text-xs text-muted-foreground">Compare annual totals and their monthly breakdown.</p></div><ComparisonSelectPair type="year" firstValue={firstYear} secondValue={secondYear} setFirst={setFirstYear} setSecond={setSecondYear} options={yearOptions.map(year => ({ value: String(year), label: String(year) }))}/></div>
      <div className="grid gap-3 p-4 md:grid-cols-2"><ComparisonPeriodCard title="First Year" data={firstYearData} comparison={secondYearData}/><ComparisonPeriodCard title="Second Year" data={secondYearData}/></div>
      <div className="overflow-x-auto border-t border-border"><table className="w-full min-w-[620px] text-xs"><thead><tr className="border-b border-border bg-secondary/20 text-left text-[10px] font-semibold uppercase text-muted-foreground"><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">{firstYear}</th><th className="px-4 py-3 text-right">{secondYear}</th><th className="px-4 py-3 text-right">Change</th></tr></thead><tbody>{months.map((month, index) => { const first = period(firstYear, index); const second = period(secondYear, index); return <tr key={month} className="border-b border-border/60 last:border-0"><td className="px-4 py-3 font-semibold text-foreground">{month.slice(0, 3)}</td><td className="px-4 py-3 text-right text-foreground">{first.total}</td><td className="px-4 py-3 text-right text-muted-foreground">{second.total}</td><td className="px-4 py-3 text-right font-semibold"><ComparisonChange first={first.total} second={second.total}/></td></tr>; })}</tbody></table></div>
    </div>
  </section>;
}

function validStoredDateTime(date, value) {
  if (!date || !value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{1,2}:\d{2}/.test(text)) return dateTimeFrom(String(date).slice(0, 10), text);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function orderedDurationMinutes(points) {
  if (points.some(point => !(point instanceof Date) || Number.isNaN(point.getTime()))) return null;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].getTime() < points[index - 1].getTime()) return null;
  }
  return minutesBetween(points[0], points[points.length - 1]);
}

function wholeResponseAverage(dispatches, pcrReports) {
  const pcrByResponse = new Map(pcrReports.filter(report => report.responseId).map(report => [report.responseId, report]));
  const pcrByDispatch = new Map(pcrReports.filter(report => report.dispatchId).map(report => [report.dispatchId, report]));
  const durations = dispatches.map(dispatch => {
    const date = dispatch.date || dispatch.dateOfIncident || String(dispatch.createdAt || '').slice(0, 10);
    const linkedPcr = pcrByDispatch.get(dispatch.dispatchId || dispatch.id) || pcrByResponse.get(dispatch.responseId);
    const incident = validStoredDateTime(date, dispatch.timeOfIncident);
    const dispatched = validStoredDateTime(date, dispatch.dispatchedTime || dispatch.dispatchTime);
    const accepted = validStoredDateTime(date, dispatch.acceptedAt);
    const sceneArrival = validStoredDateTime(date, dispatch.arrivalScene || dispatch.arrivalAtScene);
    const sceneDeparture = validStoredDateTime(date, dispatch.departureScene || dispatch.departureAtScene);
    const hospitalArrival = validStoredDateTime(date, dispatch.arrivalHospital || dispatch.arrivalAtHospital);
    const hospitalDeparture = validStoredDateTime(date, dispatch.departureHospital || dispatch.departureAtHospital);
    const backToBase = validStoredDateTime(date, dispatch.backToBase || dispatch.arrivalOffice || dispatch.arrivalAtOffice);
    const isRefusal = Boolean(linkedPcr?.waiverAccepted);
    const hasAnyHospitalTime = Boolean(hospitalArrival || hospitalDeparture);
    const hospitalTransport = !isRefusal && Boolean(hospitalArrival && hospitalDeparture);
    if (hospitalTransport) {
      return orderedDurationMinutes([incident, dispatched, accepted, sceneArrival, sceneDeparture, hospitalArrival, hospitalDeparture, backToBase]);
    }
    if (isRefusal || !hasAnyHospitalTime) {
      return orderedDurationMinutes([incident, dispatched, accepted, sceneArrival, sceneDeparture, backToBase]);
    }
    return null;
  });
  return average(durations);
}

function ResponseTimeSegmentationSection({ dispatches, pcrReports }) {
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const segmentation = useMemo(() => {
    const pcrByResponse = new Map();
    const pcrByDispatch = new Map();
    pcrReports.forEach(report => {
      if (report.responseId) pcrByResponse.set(report.responseId, report);
      if (report.dispatchId) pcrByDispatch.set(report.dispatchId, report);
    });
    const values = {
      callerDispatcher: [],
      dispatcherAcceptance: [],
      acceptanceScene: [],
      sceneHospital: [],
      hospitalBase: [],
      sceneBase: [],
      wholeResponse: [],
    };
    const records = [];

    dispatches.forEach(dispatch => {
      const date = dispatch.date || dispatch.dateOfIncident || String(dispatch.createdAt || '').slice(0, 10);
      const linkedPcr = pcrByDispatch.get(dispatch.dispatchId || dispatch.id) || pcrByResponse.get(dispatch.responseId);
      const isReverseWorkflow = Boolean(dispatch.sourcePcrId) || linkedPcr?.workflowOrigin === 'reverse';
      const isRefusal = Boolean(linkedPcr?.waiverAccepted);
      const incident = validStoredDateTime(date, dispatch.timeOfIncident);
      const dispatched = validStoredDateTime(date, dispatch.dispatchedTime || dispatch.dispatchTime);
      const accepted = validStoredDateTime(date, dispatch.acceptedAt);
      const sceneArrival = validStoredDateTime(date, dispatch.arrivalScene || dispatch.arrivalAtScene);
      const sceneDeparture = validStoredDateTime(date, dispatch.departureScene || dispatch.departureAtScene);
      const hospitalArrival = validStoredDateTime(date, dispatch.arrivalHospital || dispatch.arrivalAtHospital);
      const hospitalDeparture = validStoredDateTime(date, dispatch.departureHospital || dispatch.departureAtHospital);
      const backToBase = validStoredDateTime(date, dispatch.backToBase || dispatch.arrivalOffice || dispatch.arrivalAtOffice);
      const hasAnyHospitalTime = Boolean(hospitalArrival || hospitalDeparture);
      const hospitalTransport = !isRefusal && Boolean(hospitalArrival && hospitalDeparture);
      const noHospitalTransport = isRefusal || !hasAnyHospitalTime;
      const segmentDurations = {};
      const add = (key, points) => {
        const duration = orderedDurationMinutes(points);
        segmentDurations[key] = duration;
        if (duration !== null) values[key].push(duration);
      };

      if (!isReverseWorkflow) add('callerDispatcher', [incident, dispatched]);
      add('dispatcherAcceptance', [dispatched, accepted]);
      add('acceptanceScene', [accepted, sceneArrival]);
      if (hospitalTransport) {
        add('sceneHospital', [sceneDeparture, hospitalArrival]);
        add('hospitalBase', [hospitalDeparture, backToBase]);
        add('wholeResponse', [incident, dispatched, accepted, sceneArrival, sceneDeparture, hospitalArrival, hospitalDeparture, backToBase]);
      } else if (noHospitalTransport) {
        add('sceneBase', [sceneDeparture, backToBase]);
        add('wholeResponse', [incident, dispatched, accepted, sceneArrival, sceneDeparture, backToBase]);
      }
      records.push({
        id: String(dispatch.dispatchId || dispatch.id),
        label: dispatch.responseNumber || `Dispatch ${String(dispatch.dispatchId || dispatch.id).slice(0, 8)}`,
        patientNames: [dispatch.patientName, ...(dispatch.patients || []).map(patient => patient.name)]
          .map(name => String(name || '').trim()).filter(Boolean).filter((name, index, names) => names.indexOf(name) === index),
        date,
        team: dispatch.team || dispatch.respondingTeam || '',
        segmentDurations,
      });
    });

    const metrics = [
      { key: 'callerDispatcher', label: 'Caller → Dispatcher', description: 'Incident/caller time until dispatch; reverse and manual PCR workflows excluded.', values: values.callerDispatcher, icon: Radio },
      { key: 'dispatcherAcceptance', label: 'Dispatcher → Field Officer Acceptance', description: 'Dispatch time until the assigned Field Officer accepts.', values: values.dispatcherAcceptance, icon: CheckCircle2 },
      { key: 'acceptanceScene', label: 'Field Officer Acceptance → Scene Arrival', description: 'Accepted dispatch until arrival at the incident scene.', values: values.acceptanceScene, icon: MapPinned },
      { key: 'sceneHospital', label: 'Scene → Hospital', description: 'Departure from scene until hospital arrival for transported patients.', values: values.sceneHospital, icon: Building2 },
      { key: 'hospitalBase', label: 'Hospital → Back to Base', description: 'Departure from hospital until return to base for transported patients.', values: values.hospitalBase, icon: Building2 },
      { key: 'sceneBase', label: 'Scene → Back to Base', description: 'Departure from scene until return to base when there is no hospital transport.', values: values.sceneBase, icon: MapPinned },
      { key: 'wholeResponse', label: 'Whole Response Time', description: 'Complete valid response workflow from incident/caller time through return to base.', values: values.wholeResponse, icon: Clock, featured: true },
    ].map(metric => ({ ...metric, average: average(metric.values), count: metric.values.length }));
    return { metrics, records };
  }, [dispatches, pcrReports]);
  const selectedRecord = segmentation.records.find(record => record.id === selectedRecordId) || null;
  const normalizedRecordSearch = recordSearch.trim().toLowerCase();
  const visibleRecords = normalizedRecordSearch
    ? segmentation.records.filter(record => record.patientNames.some(name => name.toLowerCase().includes(normalizedRecordSearch)))
    : segmentation.records;

  return <section className="space-y-5">
    <SectionHeader title="Segmentation of Average Response Time" subtitle="Average duration of each completed response stage using existing workflow timestamps" />
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <label htmlFor="response-segmentation-record" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">View a specific response record</label>
      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        <input type="search" value={recordSearch} onChange={event => { setRecordSearch(event.target.value); setSelectedRecordId(''); }} placeholder="Search by patient name" aria-label="Search response records by patient name" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
        <select id="response-segmentation-record" value={selectedRecordId} onChange={event => setSelectedRecordId(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
          <option value="">Or browse all response records</option>
          {segmentation.records.map(record => <option key={record.id} value={record.id}>{record.label}{record.patientNames.length ? ` | ${record.patientNames.join(', ')}` : ''}{record.date ? ` | ${record.date}` : ''}{record.team ? ` | ${record.team}` : ''}</option>)}
        </select>
      </div>
      {normalizedRecordSearch && !selectedRecord && visibleRecords.length > 0 && <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-border bg-background p-1" role="listbox" aria-label="Matching patient response records">
        {visibleRecords.map(record => <button key={`search-${record.id}`} type="button" onClick={() => { setSelectedRecordId(record.id); setRecordSearch(record.patientNames.join(', ')); }} className="flex w-full flex-col rounded px-3 py-2 text-left hover:bg-secondary/70 focus:bg-secondary/70 focus:outline-none">
          <span className="text-sm font-semibold text-foreground">{record.patientNames.join(', ')}</span>
          <span className="mt-0.5 text-xs text-muted-foreground">{record.label}{record.date ? ` | ${record.date}` : ''}{record.team ? ` | ${record.team}` : ''}</span>
        </button>)}
      </div>}
      {normalizedRecordSearch && !selectedRecord && visibleRecords.length === 0 && <p className="mt-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">No response record found for that patient name.</p>}
      {selectedRecord && <div className="mt-2 text-xs text-muted-foreground">Showing individual durations for <span className="font-semibold text-foreground">{selectedRecord.label}</span>{selectedRecord.patientNames.length ? ` — ${selectedRecord.patientNames.join(', ')}` : ''}.</div>}
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {segmentation.metrics.map(metric => {
        const Icon = metric.icon;
        const selectedDuration = selectedRecord?.segmentDurations?.[metric.key];
        return <article key={metric.label} className={`flex h-full flex-col rounded-lg border border-border bg-card p-4 shadow-sm ${metric.featured ? 'md:col-span-2 xl:col-span-3' : ''}`}>
          <div className="flex min-h-[76px] items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{metric.label}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{metric.description}</p>
            </div>
            <div className="shrink-0 rounded-md border border-blue-500/20 bg-blue-500/10 p-2 text-blue-400"><Icon className="h-4 w-4" /></div>
          </div>
          <div className="mt-auto flex min-h-[92px] items-end justify-between gap-3 border-t border-border/70 pt-4">
            <div><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Average duration</div><div className="mt-1 text-2xl font-bold text-foreground">{formatMinutes(metric.average)}</div></div>
            <div className="text-right text-[10px] text-muted-foreground">{metric.count} valid {metric.count === 1 ? 'record' : 'records'}</div>
          </div>
          {selectedRecord && <div className="mt-3 min-h-[78px] rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-300">Selected record</div>
            <div className="mt-1 text-lg font-bold text-foreground">{selectedDuration === null || selectedDuration === undefined ? 'Not available' : formatMinutes(selectedDuration)}</div>
          </div>}
        </article>;
      })}
    </div>
    <p className="text-xs text-muted-foreground">Only records with every required timestamp in a valid chronological order are included. Missing or invalid timestamps are omitted from the affected segment.</p>
  </section>;
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
            <Line type="monotone" dataKey="incidents" name="Incidents" stroke="#2563eb" strokeWidth={2} dot={{ r: 3, fill: '#2563eb' }} />
            <Line type="monotone" dataKey="dispatches" name="Dispatches" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3, fill: '#14b8a6' }} />
            <Line type="monotone" dataKey="pcr" name="PCR Reports" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316' }} />
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
  const [range, setRange] = useState('all');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [incidents, setIncidents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [pcrReports, setPcrReports] = useState([]);
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
  const [activeTab, setActiveTab] = useState('overview');
  const [locationScope, setLocationScope] = useState('all');
  const [selectedBarangayName, setSelectedBarangayName] = useState('');
  const [drilldown, setDrilldown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyticsRevision, setAnalyticsRevision] = useState(0);
  const roleTabs = useMemo(() => analyticsTabsForRole(user?.role), [user?.role]);
  const headerCopy = useMemo(() => analyticsHeaderForRole(user?.role), [user?.role]);
  const isFullAnalytics = user?.role === ROLES.ADMINISTRATOR;

  useEffect(() => {
    if (!roleTabs.some(([id]) => id === activeTab)) setActiveTab('overview');
  }, [activeTab, roleTabs]);

  useEffect(() => {
    let mounted = true;
    async function loadAnalytics() {
      setLoading(true);
      setError('');
      try {
        if (!isFullAnalytics) {
          const scopedRecords = await loadRoleScopedAnalytics(user?.role, user);
          if (mounted) {
            setIncidents(scopedRecords?.incidents || []);
            setDispatches(scopedRecords?.dispatches || []);
            setPcrReports(scopedRecords?.pcrReports || []);
          }
          return;
        }
        let sourceError = null;
        const allRecords = await getStaffAllRecordsAnalytics().catch(error => {
          sourceError = error;
          return null;
        });
        const [detailedDispatches, detailedPcrReports] = allRecords
          ? await Promise.all([
            loadAllRows(listDispatchRecords).catch(() => allRecords.dispatches),
            loadAllRows(listPCRReports, { archive: 'all' }).catch(() => allRecords.pcrReports),
          ])
          : [null, null];
        if (mounted) {
          if (allRecords) {
            setIncidents(allRecords.incidents);
            setDispatches(detailedDispatches);
            setPcrReports(detailedPcrReports);
          } else {
            const [incidentResult, dispatchResult, pcrResult] = await Promise.allSettled([
              loadAllRows(listIncidents),
              loadAllRows(listDispatchRecords),
              loadAllRows(listPCRReports, { archive: 'all' }),
            ]);
            const incidentRows = settledValue(incidentResult, []);
            const dispatchRows = settledValue(dispatchResult, []);
            const pcrRows = settledValue(pcrResult, []);
            setIncidents(incidentRows);
            setDispatches(dispatchRows);
            setPcrReports(pcrRows);
            const failed = [incidentResult, dispatchResult, pcrResult].find(result => result.status === 'rejected');
            if (isAnalyticsRpcMissing(sourceError)) {
              setError('All-record analytics is not deployed in Supabase yet. Run migration 63_staff_all_records_analytics_rpc.sql, then refresh this page.');
            } else {
              setError(failed?.reason?.message || sourceError?.message || 'Analytics is using role-limited fallback data. Deploy the latest Supabase migration to enable all-record analytics.');
            }
          }
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
  }, [analyticsRevision, isFullAnalytics, user]);

  useEffect(() => {
    if (!isFullAnalytics || !supabase?.channel) return undefined;
    const scheduler = createInformationalRefresh(
      () => setAnalyticsRevision(revision => revision + 1),
      { delay: 1000 },
    );
    const refresh = scheduler.markStale;
    const channel = supabase
      .channel('analytics-response-segmentation-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_forms' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pcr_reports' }, refresh)
      .subscribe();
    return () => {
      scheduler.dispose();
      supabase.removeChannel(channel);
    };
  }, [isFullAnalytics]);

  const officialVerifiedPcrReports = useMemo(() => pcrReports.filter(isVerifiedWorkflowRecord), [pcrReports]);
  const verifiedPcrResponseIds = useMemo(() => new Set(
    officialVerifiedPcrReports.map(report => report.responseId).filter(Boolean),
  ), [officialVerifiedPcrReports]);
  const officialVerifiedIncidents = useMemo(() => incidents.filter(isAdminVerifiedIncident), [incidents]);
  const officialVerifiedDispatches = useMemo(
    () => dispatches.filter(dispatch => isVerifiedWorkflowRecord(dispatch) || verifiedPcrResponseIds.has(dispatch.responseId)),
    [dispatches, verifiedPcrResponseIds],
  );
  const officialAnalyticsIncidents = useMemo(() => {
    const verifiedIncidentResponseIds = new Set(officialVerifiedIncidents.map(incident => incident.responseId).filter(Boolean));
    const pcrDerivedIncidents = officialVerifiedPcrReports
      .filter(report => !report.responseId || !verifiedIncidentResponseIds.has(report.responseId))
      .map(pcrReportToAnalyticsIncident);
    return [...officialVerifiedIncidents, ...pcrDerivedIncidents];
  }, [officialVerifiedIncidents, officialVerifiedPcrReports]);

  const analyticsIncidents = useMemo(() => officialAnalyticsIncidents.map(incident => ({
    ...incident,
    classification: String(incident.classification || incident.type || 'Other').toUpperCase(),
    priority: incident.priority ? `${incident.priority[0].toUpperCase()}${incident.priority.slice(1)}` : 'Medium',
    barangay: incident.barangay,
    municipality: incident.municipality || incident.verifiedMunicipality || incident.extractedMunicipality || '',
    date: incident.date,
    time: incident.time,
    timeOfDay: getTimeOfDay(incident.time),
    month: incident.date ? new Date(incident.date).getMonth() : 0,
  })), [officialAnalyticsIncidents]);
  const analyticsPcrReports = useMemo(() => officialVerifiedPcrReports.map(report => ({
    ...report,
    date: pcrAnalyticsDate(report),
    time: pcrIncidentTime(report),
    month: pcrAnalyticsDate(report) ? new Date(pcrAnalyticsDate(report)).getMonth() : 0,
    barangay: report.barangay || report.incidentBarangay || '',
    municipality: report.municipality || report.incidentMunicipality || '',
    triage: normalizeAnalyticsLabel(report.triage, 'No Triage Recorded'),
    status: normalizeAnalyticsLabel(report.status, 'Draft'),
    receivingFacility: normalizeAnalyticsLabel(report.hospitalName || report.endorsedTo || report.receivedBy, 'No Facility Recorded'),
  })), [officialVerifiedPcrReports]);
  const dateFilteredPcrReports = useMemo(() => filterIncidentsByRange(analyticsPcrReports, range, customRange), [analyticsPcrReports, range, customRange]);
  const filteredPcrReports = useMemo(() => filterByLocationScope(dateFilteredPcrReports, locationScope), [dateFilteredPcrReports, locationScope]);
  const analyticsDispatches = useMemo(() => officialVerifiedDispatches.map(dispatch => ({
    ...dispatch,
    date: dispatch.dateOfIncident || String(dispatch.createdAt || '').slice(0, 10),
    time: dispatch.timeOfIncident || dispatch.dispatchedTime || '',
    month: dispatch.dateOfIncident ? new Date(dispatch.dateOfIncident).getMonth() : 0,
  })), [officialVerifiedDispatches]);
  const dateFilteredDispatches = useMemo(() => filterIncidentsByRange(analyticsDispatches, range, customRange), [analyticsDispatches, range, customRange]);
  const filteredDispatches = useMemo(() => filterByLocationScope(dateFilteredDispatches, locationScope), [dateFilteredDispatches, locationScope]);

  const dateFiltered = useMemo(() => filterIncidentsByRange(analyticsIncidents, range, customRange), [analyticsIncidents, range, customRange]);
  const filtered = useMemo(() => filterByLocationScope(dateFiltered, locationScope), [dateFiltered, locationScope]);
  const spatioFilterOptions = useMemo(() => {
    const typeOptions = [...new Set(filtered.map((item) => item.classification).filter(Boolean))]
      .sort()
      .map((value) => ({ value, label: toTitleCase(value) }));
    const barangayOptions = [...new Set(filtered.map((item) => primaryLocationName(item)).filter(Boolean))]
      .sort()
      .map((value) => ({ value, label: formatBarangayAnalyticsLabel(value, { outsideEchague: false }) }));
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
    const barangayMatch = spatioFilters.barangay === 'all' || primaryLocationName(item) === spatioFilters.barangay;
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
    const records = spatioFiltered.filter((item) => {
      const locationName = primaryLocationName(item);
      return barangay.missingLocation
        ? !locationName || locationName === 'Unspecified'
        : locationName === (barangay.sourceName || barangay.name);
    });
    const timeSummary = summarizeBy(records, (item) => timePeriods.find((period) => period.key === item.timeOfDay)?.label || 'Unspecified');
    const incidentSummary = summarizeBy(records, 'classification');
    const critical = records.filter((item) => item.priority === 'Critical').length;
    const high = records.filter((item) => item.priority === 'High').length;
    const weightedArea = weightedRiskByBarangay.get(barangay.sourceName || barangay.name);
    const periodCounts = Object.fromEntries(timePeriods.map((period) => [
      period.key,
      records.filter((item) => item.timeOfDay === period.key).length,
    ]));

    return {
      ...barangay,
      records,
      periodCounts,
      peakTime: timeSummary[0]?.name || 'Unspecified',
      mostCommonIncident: weightedArea?.most_common_incident_type || toTitleCase(incidentSummary[0]?.name || barangay.mostCommonIncidentType),
      riskLevel: weightedArea?.risk_level || getRiskLevel({ count: barangay.count, critical, high }, maxBarangayCount),
      dangerScore: weightedArea?.severity_burden || 0,
      uniqueIncidentCount: weightedArea?.unique_incident_count || barangay.count,
    };
  }), [barangays, maxBarangayCount, spatioFiltered, weightedRiskByBarangay]);
  const timeOfDayData = useMemo(() => timePeriods.map((period) => ({
    name: period.label,
    count: spatioFiltered.filter((item) => item.timeOfDay === period.key).length,
    range: period.range,
  })), [spatioFiltered]);
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
  const traumaCount = filtered.filter((item) => item.classification === 'TRAUMA').length;
  const medicalCount = filtered.filter((item) => item.classification === 'MEDICAL').length;
  const submittedPcrCount = filteredPcrReports.filter((item) => submittedStatuses.has(item.status)).length;
  const avgResponseMinutes = useMemo(() => average(filteredDispatches.map(dispatch => minutesBetween(
    dateTimeFrom(dispatch.date, dispatch.dispatchedTime || dispatch.timeOfIncident),
    dateTimeFrom(dispatch.date, dispatch.arrivalScene),
  ))), [filteredDispatches]);
  const avgSceneMinutes = useMemo(() => average(filteredDispatches.map(dispatch => minutesBetween(
    dateTimeFrom(dispatch.date, dispatch.arrivalScene),
    dateTimeFrom(dispatch.date, dispatch.departureScene),
  ))), [filteredDispatches]);
  const adminWholeResponseMinutes = useMemo(
    () => wholeResponseAverage(filteredDispatches, filteredPcrReports),
    [filteredDispatches, filteredPcrReports],
  );
  const monthlyTotals = useMemo(() => months.map((month, index) => ({
    month: month.slice(0, 3),
    incidents: analyticsIncidents.filter(item => item.month === index).length,
    dispatches: analyticsDispatches.filter(item => item.month === index).length,
    pcr: analyticsPcrReports.filter(item => item.month === index).length,
  })), [analyticsIncidents, analyticsDispatches, analyticsPcrReports]);
  const categoryComparison = useMemo(() => summarizeBy(filtered, 'classification').map(item => ({ name: toTitleCase(item.name), count: item.count, percent: item.percent })), [filtered]);
  const dispatchStatusStats = useMemo(() => summarizeBy(filteredDispatches, 'status'), [filteredDispatches]);
  const pcrStatusStats = useMemo(() => summarizeBy(filteredPcrReports, 'status'), [filteredPcrReports]);
  const pcrTriageStats = useMemo(() => summarizeBy(filteredPcrReports, 'triage'), [filteredPcrReports]);
  const emergencyTypeStats = useMemo(() => summarizeBy(
    filteredPcrReports.flatMap(report => (report.emergencyTypes?.length ? report.emergencyTypes : ['Unspecified']).map(type => ({ type }))),
    'type',
  ), [filteredPcrReports]);
  const traumaTypeStats = useMemo(() => summarizeBy(
    filteredPcrReports.flatMap(report => (report.traumaTypes?.length ? report.traumaTypes : []).map(type => ({ type }))),
    'type',
  ), [filteredPcrReports]);
  const hospitalStats = useMemo(() => summarizeBy(filteredPcrReports, 'receivingFacility'), [filteredPcrReports]);
  const hospitalRefusalRecords = useMemo(() => filterIncidentsByRange(pcrReports.map(report => ({
    ...report,
    date: pcrAnalyticsDate(report),
  })), range, customRange)
    .filter(report => report.waiverAccepted)
    .map(report => ({
      ...report,
      hospitalName: String(report.refusalFacility || '').trim() || 'No Facility Recorded',
      transferReason: String(report.waiverReason || '').trim() || 'No reason recorded',
      responseNumber: report.responseNumber || report.responseNo || '',
    }))
    .sort((first, second) => String(second.date || '').localeCompare(String(first.date || ''))), [customRange, pcrReports, range]);
  const hospitalRefusalStats = useMemo(() => summarizeBy(hospitalRefusalRecords, 'hospitalName'), [hospitalRefusalRecords]);
  const teamStats = useMemo(() => summarizeBy(filteredDispatches, dispatch => dispatch.team || dispatch.respondingTeam || 'Unassigned'), [filteredDispatches]);
  const pcrByResponse = useMemo(() => new Map(
    filteredPcrReports
      .filter(report => report.responseId)
      .map(report => [report.responseId, report]),
  ), [filteredPcrReports]);
  const mvcAccidentRecords = useMemo(() => {
    const incidentRows = filtered.filter(isMvcIncident).map(incident => {
      const linkedPcr = pcrByResponse.get(incident.responseId);
      return {
        id: incident.id,
        responseId: incident.responseId,
        barangay: incident.barangay,
        crash: linkedPcr?.crash || {},
        hasLinkedPcrCrash: Boolean(linkedPcr && hasCrashData(linkedPcr)),
      };
    });
    const incidentResponseIds = new Set(incidentRows.map(row => row.responseId).filter(Boolean));
    const pcrOnlyRows = filteredPcrReports
      .filter(report => hasCrashData(report) && (!report.responseId || !incidentResponseIds.has(report.responseId)))
      .map(report => ({
        id: report.id,
        responseId: report.responseId,
        barangay: report.barangay,
        crash: report.crash || {},
        hasLinkedPcrCrash: true,
      }));
    return [...incidentRows, ...pcrOnlyRows];
  }, [filtered, filteredPcrReports, pcrByResponse]);
  const crashRoleStats = useMemo(() => summarizeBy(mvcAccidentRecords, report => normalizeCrashRole(report.crash?.role)), [mvcAccidentRecords]);
  const alcoholBreathStats = useMemo(() => summarizeBy(mvcAccidentRecords, report => normalizeYesNo(report.crash?.alcohol)), [mvcAccidentRecords]);
  const helmetStats = useMemo(() => summarizeBy(mvcAccidentRecords, report => normalizeYesNo(report.crash?.helmet)), [mvcAccidentRecords]);
  const licenseStats = useMemo(() => summarizeBy(mvcAccidentRecords, report => normalizeYesNo(report.crash?.license)), [mvcAccidentRecords]);
  const mvcWithCrashDetails = useMemo(() => mvcAccidentRecords.filter(record => record.hasLinkedPcrCrash).length, [mvcAccidentRecords]);
  const mvcCompletionRows = useMemo(() => [
    ['Role', record => normalizeCrashRole(record.crash?.role) !== 'No Role Recorded'],
    ['Alcohol Breath', record => normalizeYesNo(record.crash?.alcohol) !== 'No Data'],
    ['Helmet', record => normalizeYesNo(record.crash?.helmet) !== 'No Data'],
    ['Driver License', record => normalizeYesNo(record.crash?.license) !== 'No Data'],
  ].map(([label, hasValue]) => {
    const complete = mvcAccidentRecords.filter(hasValue).length;
    const missing = Math.max(mvcAccidentRecords.length - complete, 0);
    return { label, complete, missing, percent: completionPercent(mvcAccidentRecords.length, complete) };
  }), [mvcAccidentRecords]);
  const performanceRows = useMemo(() => {
    const barangayNames = [...new Set(filteredDispatches.map(dispatch => dispatch.barangay || 'Unspecified'))];
    return barangayNames.map(name => {
      const rows = filteredDispatches.filter(dispatch => (dispatch.barangay || 'Unspecified') === name);
      const responseIds = new Set(rows.map(dispatch => dispatch.responseId).filter(Boolean));
      const submittedPcr = filteredPcrReports.filter(report => responseIds.has(report.responseId) && submittedStatuses.has(report.status)).length;
      return {
        name,
        dispatches: rows.length,
        submittedPcr,
        avgResponseMinutes: average(rows.map(dispatch => minutesBetween(
          dateTimeFrom(dispatch.date, dispatch.dispatchedTime || dispatch.timeOfIncident),
          dateTimeFrom(dispatch.date, dispatch.arrivalScene),
        ))),
        avgSceneMinutes: average(rows.map(dispatch => minutesBetween(
          dateTimeFrom(dispatch.date, dispatch.arrivalScene),
          dateTimeFrom(dispatch.date, dispatch.departureScene),
        ))),
      };
    }).sort((first, second) => second.dispatches - first.dispatches).slice(0, 10);
  }, [filteredDispatches, filteredPcrReports]);
  const teamPerformanceRows = useMemo(() => {
    const observedTeamNames = [...new Set(filteredDispatches.map(teamName).filter(Boolean))];
    const names = [...standardTeamNames, ...observedTeamNames.filter(name => !standardTeamNames.includes(name))];
    return names.map(name => {
      const rows = filteredDispatches.filter(dispatch => teamName(dispatch) === name);
      const responseIds = new Set(rows.map(dispatch => dispatch.responseId).filter(Boolean));
      const submittedPcr = filteredPcrReports.filter(report => responseIds.has(report.responseId) && submittedStatuses.has(report.status)).length;
      const parsed = parseTeamRun(name);
      return {
        name,
        family: parsed.family,
        run: parsed.run,
        dispatches: rows.length,
        submittedPcr,
        avgResponseMinutes: average(rows.map(dispatch => minutesBetween(
          dateTimeFrom(dispatch.date, dispatch.dispatchedTime || dispatch.timeOfIncident),
          dateTimeFrom(dispatch.date, dispatch.arrivalScene),
        ))),
        avgSceneMinutes: average(rows.map(dispatch => minutesBetween(
          dateTimeFrom(dispatch.date, dispatch.arrivalScene),
          dateTimeFrom(dispatch.date, dispatch.departureScene),
        ))),
      };
    });
  }, [filteredDispatches, filteredPcrReports]);
  const teamFamilyRows = useMemo(() => teamFamilies.map(family => {
    const rows = teamPerformanceRows.filter(row => row.family === family);
    return {
      family,
      dispatches: rows.reduce((sum, row) => sum + row.dispatches, 0),
    };
  }), [teamPerformanceRows]);
  const actionableInsights = useMemo(() => {
    const slowestArea = [...performanceRows]
      .filter(row => Number.isFinite(row.avgResponseMinutes))
      .sort((first, second) => second.avgResponseMinutes - first.avgResponseMinutes)[0];
    const outsideRecords = filtered.filter(item => locationScopeForItem(item) === 'outside');
    const missingCrashRecords = mvcAccidentRecords.filter(record => !record.hasLinkedPcrCrash);
    const topBarangay = enrichedBarangays[0];
    const fullAnalytics = user?.role === ROLES.ADMINISTRATOR;
    return [
      fullAnalytics && topBarangay && {
        title: 'Review highest road-risk area',
        value: topBarangay.name,
        helper: `${topBarangay.count} filtered incident${topBarangay.count === 1 ? '' : 's'} with ${topBarangay.riskLevel || 'Minimal'} risk.`,
        badge: 'Map',
        onClick: () => {
          setSelectedBarangayName(topBarangay.name);
          setActiveTab('spatial');
          setDrilldown({ title: topBarangay.name, subtitle: 'Incident records behind the current risk ranking.', records: topBarangay.records || [] });
        },
      },
      slowestArea && {
        title: 'Check slowest response area',
        value: slowestArea.name,
        helper: `Average response is ${formatMinutes(slowestArea.avgResponseMinutes)} across ${slowestArea.dispatches} dispatch${slowestArea.dispatches === 1 ? '' : 'es'}.`,
        badge: 'Ops',
        tone: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
        onClick: () => {
          setActiveTab('operations');
          setDrilldown({
            title: slowestArea.name,
            subtitle: 'Dispatch records for the slowest response area.',
            records: filteredDispatches.filter(dispatch => (dispatch.barangay || 'Unspecified') === slowestArea.name),
          });
        },
      },
      fullAnalytics && missingCrashRecords.length > 0 && {
        title: 'Complete MVC crash details',
        value: `${missingCrashRecords.length} missing`,
        helper: 'Fill linked PCR crash details for stronger helmet, license, alcohol, and role analytics.',
        badge: 'MVC',
        tone: 'border-red-500/25 bg-red-500/10 text-red-300',
        onClick: () => {
          setActiveTab('mvc');
          setDrilldown({ title: 'MVC Records Missing Crash Details', subtitle: 'Records counted as MVC but missing linked PCR crash details.', records: missingCrashRecords });
        },
      },
      fullAnalytics && outsideRecords.length > 0 && {
        title: 'Validate outside-Echague locations',
        value: `${outsideRecords.length} record${outsideRecords.length === 1 ? '' : 's'}`,
        helper: 'Known municipalities outside Echague are labeled separately from no-location records.',
        badge: 'Scope',
        onClick: () => {
          setLocationScope('outside');
          setDrilldown({ title: 'Outside Echague Locations', subtitle: 'Filtered official incidents with known locations outside Echague.', records: outsideRecords });
        },
      },
    ].filter(Boolean);
  }, [enrichedBarangays, filtered, filteredDispatches, mvcAccidentRecords, performanceRows, user?.role]);

  return (
    <div className="min-h-full bg-background p-5" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="mb-5 rounded-lg border border-border bg-card px-5 py-4 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
              <Activity className="h-3 w-3" />
              {headerCopy.eyebrow}
            </div>
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {headerCopy.title}
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {headerCopy.description}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <DateFilters range={range} setRange={setRange} customRange={customRange} setCustomRange={setCustomRange} />
          </div>
        </div>
      </div>
      {loading && <div className="mb-5 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Loading analytics data...</div>}
      {error && <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>}
      <SectionNav activeTab={activeTab} onChange={setActiveTab} tabs={roleTabs} />
      <div className="mb-5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-xs text-blue-200">
        {headerCopy.source}
      </div>
      <DataCoverageBar incidents={filtered} dispatches={filteredDispatches} pcrReports={filteredPcrReports} mvcRecords={mvcAccidentRecords} mvcWithCrashDetails={mvcWithCrashDetails} />

      {user?.role === ROLES.DISPATCHER && (
        <DispatcherWorkflowCard
          dispatches={dispatches}
          onRecords={() => navigate('/admin/dispatch')}
          onCreate={() => navigate('/admin/dispatch/new')}
        />
      )}

      {isFullAnalytics && activeTab === 'overview' && (
        <OverviewSection
          filtered={filtered}
          filteredDispatches={filteredDispatches}
          filteredPcrReports={filteredPcrReports}
          spatioFiltered={spatioFiltered}
          summary={spatioSummary}
          range={range}
          customRange={customRange}
          avgResponseMinutes={adminWholeResponseMinutes}
          avgSceneMinutes={avgSceneMinutes}
          submittedPcrCount={submittedPcrCount}
          medicalCount={medicalCount}
          traumaCount={traumaCount}
          mvcAccidentRecords={mvcAccidentRecords}
          mvcWithCrashDetails={mvcWithCrashDetails}
          actionableInsights={actionableInsights}
          onOpenTab={setActiveTab}
        />
      )}

      {!isFullAnalytics && activeTab === 'overview' && (
        <ScopedOverviewSection
          role={user?.role}
          filteredDispatches={filteredDispatches}
          filteredPcrReports={filteredPcrReports}
          avgResponseMinutes={avgResponseMinutes}
          avgSceneMinutes={avgSceneMinutes}
          submittedPcrCount={submittedPcrCount}
          dispatchStatusStats={dispatchStatusStats}
          pcrStatusStats={pcrStatusStats}
          onOpenTab={setActiveTab}
        />
      )}

      {isFullAnalytics && activeTab === 'spatial' && (
      <section id="analytics-spatial" className="scroll-mt-4">
        <SpatioTemporalSection
          filteredIncidents={spatioFiltered}
          enrichedBarangays={enrichedBarangays}
          timeOfDayData={timeOfDayData}
          priorityData={priority.map((item) => ({ ...item, color: priorityColors[item.name] }))}
          summary={spatioSummary}
          filterOptionsData={spatioFilterOptions}
          filters={spatioFilters}
          setFilters={setSpatioFilters}
          layerVisibility={spatioLayers}
          setLayerVisibility={setSpatioLayers}
          range={range}
          customRange={customRange}
          locationScope={locationScope}
          setLocationScope={setLocationScope}
          selectedBarangayName={selectedBarangayName}
          setSelectedBarangayName={setSelectedBarangayName}
          onDrilldown={setDrilldown}
        />
      </section>
      )}

      {activeTab === 'operations' && (
      <section id="analytics-operations" className="scroll-mt-4">
        <SectionHeader title="Operational Performance" subtitle="Real dispatch, incident, and PCR records from the database for the selected date range" />
        <div className="mb-5 grid gap-5 xl:grid-cols-2">
          <ReportChartCard title="Monthly Workload Trend" subtitle="Incidents, dispatches, and PCR reports recorded this year" data={monthlyTotals} kind="line" />
          <DistributionCard title="Dispatch Status Mix" subtitle="Current workflow status of filtered dispatch forms" data={dispatchStatusStats} type="pie" />
        </div>
        <div className="mb-5">
          <PerformanceTable rows={performanceRows} />
        </div>
        <TeamRunAnalyticsCard rows={teamPerformanceRows} familyRows={teamFamilyRows} />
      </section>
      )}

      {isFullAnalytics && activeTab === 'mvc' && (
      <section id="analytics-mvc" className="mt-5 scroll-mt-4">
        <SectionHeader title="MVC Safety Analytics" subtitle="Driver, passenger, pedestrian, alcohol breath, helmet, and license indicators aligned to all MVC incident records" />
        <MvcCompletionCard rows={mvcCompletionRows} />
        <div className="mb-5 grid gap-5 xl:grid-cols-2">
          <DistributionCard title="Driver / Passenger / Pedestrian" subtitle={`${mvcAccidentRecords.length} MVC accident records from the main database`} data={crashRoleStats} />
          <DistributionCard title="Alcohol Breath" subtitle="All MVC records; Yes/No only appears when linked PCR crash data is filled" data={alcoholBreathStats} type="pie" />
          <DistributionCard title="Helmet" subtitle="All MVC records; Yes/No only appears when linked PCR crash data is filled" data={helmetStats} type="pie" />
          <DistributionCard title="Driver's License" subtitle="All MVC records; Yes/No only appears when linked PCR crash data is filled" data={licenseStats} type="pie" />
        </div>
      </section>
      )}

      {activeTab === 'pcr' && (
      <section id="analytics-pcr" className="scroll-mt-4">
        <SectionHeader title="PCR Clinical Analytics" subtitle="Patient care report status, triage, emergency type, and receiving facility indicators" />
        <div className="grid gap-5 xl:grid-cols-2">
          <DistributionCard title="PCR Status Mix" subtitle="Submitted, verified, completed, and in-progress reports" data={pcrStatusStats} type="pie" />
          <DistributionCard title="Incident Category Comparison" subtitle="Classification of filtered official incident records" data={categoryComparison} />
          <DistributionCard title="PCR Triage Distribution" subtitle="Clinical triage levels recorded in patient care reports" data={pcrTriageStats} />
          <DistributionCard title="Receiving Facility Load" subtitle="Hospital or receiving facility recorded in PCR reports" data={hospitalStats} />
          <div className="xl:col-span-2">
            <OperationalBreakdownCard
              title="Clinical and Team Breakdown"
              subtitle="PCR emergency/trauma tags and responding-team workload from database records"
              groups={[
                { title: 'Emergency Types', data: emergencyTypeStats, accent: '#2563eb', emptyText: 'No emergency type records in this range' },
                { title: 'Trauma Types', data: traumaTypeStats, accent: '#dc2626', emptyText: 'No trauma type records in this range' },
                { title: 'Responding Teams', data: teamStats, accent: '#14b8a6', emptyText: 'No team dispatch records in this range' },
              ]}
            />
          </div>
        </div>
        {isFullAnalytics && <div className="mt-5">
          <HospitalRefusalCard records={hospitalRefusalRecords} stats={hospitalRefusalStats}/>
        </div>}
      </section>
      )}

      {isFullAnalytics && activeTab === 'comparative' && (
        <ComparativeAnalysisSection
          incidents={analyticsIncidents}
          dispatches={analyticsDispatches}
          pcrReports={analyticsPcrReports}
        />
      )}
      {isFullAnalytics && activeTab === 'response-segments' && (
        <ResponseTimeSegmentationSection
          dispatches={filteredDispatches}
          pcrReports={filteredPcrReports}
        />
      )}
      <DrilldownDrawer drilldown={drilldown} onClose={() => setDrilldown(null)} />
    </div>
  );
}
