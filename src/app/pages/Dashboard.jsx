import { createElement, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Activity, Ambulance, Users, CheckCircle2, Clock, TrendingUp,
  Flame, Droplets, Car, Heart, Radio, ChevronRight, Bell, MapPin, RefreshCw, BarChart2, Table2, Save, X
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BarangayHeatmap } from '../components/analytics/BarangayHeatmap';
import { LeafletIncidentMap } from '../components/map/LeafletIncidentMap';
import { filterIncidentsByRange, getBarangayStats, summarizeBy } from '../data/analyticsModule';
import { PERMISSIONS } from '../access/rbac';
import { useAuth } from '../contexts/AuthContext';
import { getIncidentStatusLabel, isAmbulanceAssigned, isIncidentCompleted } from '../utils/incidentStatus';
import {
  AMBULANCE_STATUSES,
  createAmbulanceUnit,
  getAmbulanceStatus,
  listAmbulanceUnits,
  listDispatchRecords,
  listIncidents,
  listNotifications,
  listRespondingTeams,
  supabase,
  updateAmbulanceUnitAvailability,
} from '../services/supabase';

const typeColors = {
  vehicular: 'text-red-400 bg-red-500/10',
  fire: 'text-orange-400 bg-orange-500/10',
  medical: 'text-blue-400 bg-blue-500/10',
  flood: 'text-cyan-400 bg-cyan-500/10',
  crime: 'text-purple-400 bg-purple-500/10',
  other: 'text-slate-400 bg-slate-500/10',
};

const typeIcons = {
  vehicular: Car,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: AlertTriangle,
  other: AlertTriangle,
};

const severityBadge = {
  critical: 'bg-red-600/20 text-red-400 border-red-500/30',
  warning: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
  moderate: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
  resolved: 'bg-green-600/20 text-green-400 border-green-500/30',
};

const statusBadge = {
  in_route: 'bg-blue-600/20 text-blue-400',
  on_scene: 'bg-orange-600/20 text-orange-400',
  transporting: 'bg-purple-600/20 text-purple-400',
  completed: 'bg-green-600/20 text-green-400',
};

const activityColor = {
  new: 'bg-red-500',
  update: 'bg-blue-500',
  dispatch: 'bg-orange-500',
  resolved: 'bg-green-500',
  request: 'bg-yellow-500',
  report: 'bg-purple-500',
  info: 'bg-slate-500',
};

const priorityColors = {
  Critical: '#dc2626',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

const ambulanceStatusStyles = {
  available: 'bg-green-500/20 text-green-400',
  busy: 'bg-blue-500/20 text-blue-400',
  unavailable: 'bg-red-500/20 text-red-400',
  maintenance: 'bg-yellow-500/20 text-yellow-400',
};

const initialAmbulanceForm = {
  callSign: '',
  plateNumber: '',
  description: '',
  respondingTeamId: '',
  status: 'available',
};

const settledValue = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback);

const AnalyticsTooltip = ({ active, payload, label }) => {
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
};

export default function Dashboard() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [rankingView, setRankingView] = useState('bar');
  const [incidents, setIncidents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [ambulanceUnits, setAmbulanceUnits] = useState([]);
  const [ambulancePanelOpen, setAmbulancePanelOpen] = useState(false);
  const [registerFormOpen, setRegisterFormOpen] = useState(false);
  const [ambulanceForm, setAmbulanceForm] = useState(initialAmbulanceForm);
  const [ambulanceSaving, setAmbulanceSaving] = useState(false);
  const [respondingTeams, setRespondingTeams] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canManageAmbulances = can(PERMISSIONS.MANAGE_AMBULANCES);

  const refreshAmbulanceUnits = async () => {
    const rows = await listAmbulanceUnits({ activeOnly: false });
    setAmbulanceUnits(rows);
    return rows;
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const [incidentResult, dispatchResult, notificationResult, ambulanceResult, teamResult] = await Promise.allSettled([
        listIncidents({ limit: 500 }),
        listDispatchRecords({ limit: 100 }),
        listNotifications({ limit: 20 }),
        listAmbulanceUnits({ activeOnly: false }),
        listRespondingTeams({ activeOnly: true }),
      ]);
      const incidentRows = settledValue(incidentResult, []);
      const dispatchRows = settledValue(dispatchResult, []);
      const notificationRows = settledValue(notificationResult, []);
      const ambulanceRows = settledValue(ambulanceResult, []);
      const teamRows = settledValue(teamResult, []);
      setIncidents(incidentRows);
      setDispatches(dispatchRows);
      setAmbulanceUnits(ambulanceRows);
      setRespondingTeams(teamRows);
      setRecentActivity(notificationRows.map(item => ({
        id: item.id,
        type: item.type === 'pcr_created' ? 'report' : item.type === 'response_completed' ? 'resolved' : 'info',
        message: item.title || item.message,
        time: item.timestamp ? new Date(item.timestamp).toLocaleString() : '',
      })));
      const failed = [incidentResult, dispatchResult, notificationResult, ambulanceResult, teamResult].find(result => result.status === 'rejected');
      if (failed) setError(failed.reason?.message || 'Some dashboard data could not be loaded for your role.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel('dashboard-ambulance-units')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ambulance_units' },
        () => {
          refreshAmbulanceUnits().catch((requestError) => {
            setError(requestError.message || 'Unable to refresh ambulance availability.');
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const activeResponses = useMemo(() => incidents.filter(i => isAmbulanceAssigned(i.status)), [incidents]);
  const availableAmbulances = ambulanceUnits.filter(unit => getAmbulanceStatus(unit) === 'available').length;
  const ambulanceTotal = ambulanceUnits.length;
  const activeIncidents = incidents.filter(i => !isIncidentCompleted(i.status)).slice(0, 6);
  const analyticsIncidents = useMemo(() => incidents.map(incident => ({
    ...incident,
    barangay: incident.barangay,
    classification: String(incident.classification || incident.type || 'Other').toUpperCase(),
    priority: incident.priority ? `${incident.priority[0].toUpperCase()}${incident.priority.slice(1)}` : 'Medium',
    date: incident.date,
    time: incident.time,
  })), [incidents]);
  const todayAnalytics = useMemo(() => filterIncidentsByRange(analyticsIncidents, 'today'), [analyticsIncidents]);
  const barangayRanking = useMemo(() => getBarangayStats(todayAnalytics).filter((item) => item.count > 0), [todayAnalytics]);
  const priorityData = useMemo(() => summarizeBy(todayAnalytics, 'priority'), [todayAnalytics]);
  const dashboardStats = useMemo(() => [
    {
      label: 'Total Incidents Today',
      value: String(todayAnalytics.length),
      change: 'From approved database records',
      icon: AlertTriangle,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      trend: 'neutral',
    },
    {
      label: 'Active Emergencies',
      value: String(activeIncidents.length),
      change: 'Not yet completed',
      icon: Activity,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20',
      trend: 'neutral',
    },
    {
      label: 'Teams Deployed',
      value: String(new Set(activeResponses.map(item => item.assignedTeam).filter(Boolean)).size),
      change: 'Assigned active responses',
      icon: Users,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      trend: 'neutral',
    },
    {
      label: 'Resolved Today',
      value: String(todayAnalytics.filter(item => isIncidentCompleted(item.status)).length),
      change: 'Completed incident records',
      icon: CheckCircle2,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
      trend: 'neutral',
    },
    {
      label: 'Avg Response Time',
      value: '-',
      change: 'Awaiting dispatch timing data',
      icon: Clock,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      trend: 'neutral',
    },
    {
      label: 'Ambulances Available',
      value: `${availableAmbulances} / ${ambulanceTotal}`,
      change: 'Live Supabase unit status',
      icon: Ambulance,
      color: availableAmbulances <= 2 ? 'text-red-400' : 'text-purple-400',
      bg: availableAmbulances <= 2 ? 'bg-red-500/10' : 'bg-purple-500/10',
      border: availableAmbulances <= 2 ? 'border-red-500/20' : 'border-purple-500/20',
      trend: availableAmbulances <= 2 ? 'up' : 'neutral',
    },
  ], [activeIncidents.length, activeResponses, ambulanceTotal, availableAmbulances, todayAnalytics]);

  const openAmbulancePanel = () => {
    setAmbulancePanelOpen(true);
  };

  const updateUnitStatus = async (unitId, nextStatus) => {
    const previousUnits = ambulanceUnits;
    setError('');
    setAmbulanceUnits(current => current.map(unit => (
      unit.id === unitId ? { ...unit, status: nextStatus, active: nextStatus === 'available' } : unit
    )));

    try {
      const savedUnit = await updateAmbulanceUnitAvailability(unitId, nextStatus);
      setAmbulanceUnits(current => current.map(unit => (unit.id === unitId ? savedUnit : unit)));
    } catch (requestError) {
      setAmbulanceUnits(previousUnits);
      setError(requestError.message || 'Unable to update ambulance availability.');
    }
  };

  const registerAmbulance = async (event) => {
    event.preventDefault();
    if (!ambulanceForm.callSign.trim()) {
      setError('Ambulance unit name or number is required.');
      return;
    }

    setAmbulanceSaving(true);
    setError('');
    try {
      const unit = await createAmbulanceUnit({
        callSign: ambulanceForm.callSign.trim(),
        plateNumber: ambulanceForm.plateNumber.trim(),
        description: ambulanceForm.description.trim(),
        respondingTeamId: ambulanceForm.respondingTeamId || null,
        status: ambulanceForm.status,
      });
      setAmbulanceUnits(current => (
        current.some(existing => existing.id === unit.id)
          ? current.map(existing => (existing.id === unit.id ? unit : existing))
          : [...current, unit].sort((a, b) => a.call_sign.localeCompare(b.call_sign))
      ));
      setAmbulanceForm(initialAmbulanceForm);
      setRegisterFormOpen(false);
    } catch (requestError) {
      setError(requestError.message || 'Unable to register ambulance unit.');
    } finally {
      setAmbulanceSaving(false);
    }
  };

  return (
    <div className="p-5 space-y-5 min-h-full bg-(--emergency-bg)" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Command Dashboard
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">Real-time emergency monitoring — Echague, Isabela</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadDashboard} className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {canManageAmbulances && <button
            onClick={openAmbulancePanel}
            className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all"
          >
            <Ambulance className="w-3.5 h-3.5" />
            Update Ambulances
          </button>}
          {can(PERMISSIONS.CREATE_PCR) && <button
            onClick={() => navigate('/admin/dispatch/received')}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-all"
          >
            <Radio className="w-3.5 h-3.5" />
            Accept Dispatch
          </button>}
        </div>
      </div>

      {ambulancePanelOpen && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ambulance Availability</h2>
              <p className="text-xs text-muted-foreground">Changes are saved to Supabase and reflected live across dashboards.</p>
            </div>
            <div className="flex items-center gap-2">
              {canManageAmbulances && <button
                onClick={() => setRegisterFormOpen(current => !current)}
                className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                Register Unit
              </button>}
              <button onClick={() => setAmbulancePanelOpen(false)} className="rounded-lg border border-border bg-secondary/50 p-2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {registerFormOpen && canManageAmbulances && (
            <form onSubmit={registerAmbulance} className="mb-4 rounded-lg border border-border bg-background p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <label className="text-xs text-muted-foreground">
                  Unit name or number
                  <input
                    value={ambulanceForm.callSign}
                    onChange={(event) => setAmbulanceForm(current => ({ ...current, callSign: event.target.value }))}
                    placeholder="Ambulance 01"
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Plate number
                  <input
                    value={ambulanceForm.plateNumber}
                    onChange={(event) => setAmbulanceForm(current => ({ ...current, plateNumber: event.target.value }))}
                    placeholder="ABC 1234"
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Status
                  <select
                    value={ambulanceForm.status}
                    onChange={(event) => setAmbulanceForm(current => ({ ...current, status: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
                  >
                    {AMBULANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Team assignment
                  <select
                    value={ambulanceForm.respondingTeamId}
                    onChange={(event) => setAmbulanceForm(current => ({ ...current, respondingTeamId: event.target.value }))}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
                  >
                    <option value="">Unassigned</option>
                    {respondingTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Description
                  <input
                    value={ambulanceForm.description}
                    onChange={(event) => setAmbulanceForm(current => ({ ...current, description: event.target.value }))}
                    placeholder="Optional notes"
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
                  />
                </label>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={ambulanceSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />
                  {ambulanceSaving ? 'Registering...' : 'Register Ambulance'}
                </button>
              </div>
            </form>
          )}
          {!ambulanceUnits.length && (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              <div>No ambulance units are registered in Supabase yet.</div>
              {canManageAmbulances && (
                <button
                  onClick={() => setRegisterFormOpen(true)}
                  className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Register First Unit
                </button>
              )}
            </div>
          )}
          {!!ambulanceUnits.length && (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {ambulanceUnits.map((unit) => (
                <div
                  key={unit.id}
                  className={`rounded-lg border p-3 transition-all ${
                    getAmbulanceStatus(unit) === 'available'
                      ? 'border-green-500/30 bg-green-500/10'
                      : 'border-border bg-background'
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{unit.call_sign}</span>
                      <span className="block text-xs text-muted-foreground">{unit.plate_number || unit.description || 'No plate number'}</span>
                      {unit.responding_team?.name && <span className="mt-1 block text-[10px] text-muted-foreground">Team: {unit.responding_team.name}</span>}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${ambulanceStatusStyles[getAmbulanceStatus(unit)]}`}>
                      {getAmbulanceStatus(unit)}
                    </span>
                  </div>
                  {canManageAmbulances ? (
                    <select
                      value={getAmbulanceStatus(unit)}
                      onChange={(event) => updateUnitStatus(unit.id, event.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none focus:border-blue-500"
                    >
                      {AMBULANCE_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-xs text-muted-foreground">Live status from Supabase</div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Available units: <span className="font-semibold text-foreground">{availableAmbulances}</span>
            </div>
            <div className="text-xs text-muted-foreground">Total units: <span className="font-semibold text-foreground">{ambulanceTotal}</span></div>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {dashboardStats.map(({ label, value, change, icon, color, bg, border, trend }) => (
          <div key={label} className={`p-4 rounded-xl border ${bg} ${border} bg-card`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
                {createElement(icon, { className: `w-4 h-4 ${color}` })}
              </div>
              <TrendingUp className={`w-3.5 h-3.5 ${trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-green-400 rotate-180' : 'text-muted-foreground'}`} />
            </div>
            <div className={`text-2xl font-bold ${color} mb-0.5`}>{value}</div>
            <div className="text-muted-foreground text-[10px] leading-tight mb-1">{label}</div>
            <div className="text-muted-foreground text-[9px] opacity-70">{change}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <BarangayHeatmap
            incidents={todayAnalytics}
            allIncidents={analyticsIncidents}
            compact
            range="today"
            mapZoomBoost={0}
            mapMinZoom={8}
          />
        </div>
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Top Barangays by Incident Count Today</h3>
                <p className="text-xs text-muted-foreground">Highest to lowest ranking</p>
              </div>
              <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5">
                <button
                  onClick={() => setRankingView('bar')}
                  className={`grid h-7 w-7 place-items-center rounded-md ${rankingView === 'bar' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Bar chart view"
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setRankingView('table')}
                  className={`grid h-7 w-7 place-items-center rounded-md ${rankingView === 'table' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Table view"
                >
                  <Table2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {rankingView === 'bar' ? (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={barangayRanking} layout="vertical" margin={{ top: 0, right: 8, left: 22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'currentColor' }} className="text-muted-foreground" width={78} />
                  <Tooltip content={<AnalyticsTooltip />} />
                  <Bar dataKey="count" name="Incidents" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2 text-left font-medium">Barangay</th>
                      <th className="py-2 text-right font-medium">Total</th>
                      <th className="py-2 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barangayRanking.map((item) => (
                      <tr key={item.name} className="border-b border-border/60">
                        <td className="py-2 text-foreground">{item.name}</td>
                        <td className="py-2 text-right font-semibold text-foreground">{item.count}</td>
                        <td className="py-2 text-right text-muted-foreground">{item.percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Incidents by Priority</h3>
              <p className="text-xs text-muted-foreground">Critical, high, medium, and low distribution</p>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={priorityData} dataKey="count" nameKey="name" innerRadius={34} outerRadius={55} paddingAngle={2}>
                    {priorityData.map((entry) => <Cell key={entry.name} fill={priorityColors[entry.name]} />)}
                  </Pie>
                  <Tooltip content={<AnalyticsTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {priorityData.map((item) => (
                  <div key={item.name}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="font-semibold text-foreground">{item.count} / {item.percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: priorityColors[item.name] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Map + Side Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Live Map */}
        <div className="xl:col-span-2 bg-card border border-border rounded-xl overflow-hidden" style={{ height: '460px' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-semibold text-foreground">Live Incident Map</span>
            </div>
            <button
              onClick={() => navigate('/admin/map')}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Full Map <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <LeafletIncidentMap
            height="calc(100% - 45px)"
            showControls={true}
            compact={true}
            onMarkerClick={(id) => setSelectedIncident(id)}
            selectedIncidentId={selectedIncident || undefined}
          />
        </div>

        {/* Side Panel */}
        <div className="flex flex-col gap-4">
          {/* Recent Activity Feed */}
          <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-foreground">Activity Feed</span>
              </div>
              <span className="text-[10px] text-muted-foreground px-2 py-0.5 bg-secondary rounded-full">Live</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
              {loading && <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading activity...</div>}
              {!loading && error && <div className="px-4 py-8 text-center text-xs text-red-400">{error}</div>}
              {!loading && !error && recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border hover:bg-secondary/50 transition-all">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${activityColor[item.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-tight">{item.message}</p>
                    <span className="text-[10px] text-muted-foreground">{item.time}</span>
                  </div>
                </div>
              ))}
              {!loading && !error && !recentActivity.length && <div className="px-4 py-8 text-center text-xs text-muted-foreground">No recent activity is available.</div>}
            </div>
          </div>

          {/* Dispatch Quick View */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-semibold text-foreground">Dispatch Status</span>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {dispatches.slice(0, 5).map(({ id, team, placeOfIncident, barangay, status }) => (
                <div key={id} className="flex items-center justify-between px-3 py-2 bg-secondary/50 rounded-lg">
                  <div>
                    <div className="text-xs font-medium text-foreground">{team || 'Unassigned'}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" /> {placeOfIncident || barangay || 'No location'}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-blue-400">{status}</span>
                </div>
              ))}
              {!dispatches.length && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No dispatch records are available.</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Active Incidents Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-foreground">Active Incidents</span>
          </div>
          <button
            onClick={() => navigate('/admin/incidents')}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View All <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-2.5 text-muted-foreground font-medium">ID</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Type</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Location</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Severity</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Team</th>
                <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Time</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {activeIncidents.map((incident) => {
                const TypeIcon = typeIcons[incident.type];
                return (
                  <tr
                    key={incident.id}
                    className={`border-b border-border hover:bg-secondary/30 transition-all cursor-pointer ${
                      selectedIncident === incident.id ? 'bg-blue-500/10' : ''
                    }`}
                    onClick={() => navigate(`/admin/incidents/${incident.id}`)}
                  >
                    <td className="px-5 py-3 font-mono text-blue-400">{incident.id}</td>
                    <td className="px-3 py-3">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium ${typeColors[incident.type]}`}>
                        <TypeIcon className="w-3 h-3" />
                        {incident.type}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-foreground max-w-32 truncate">{incident.location}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${severityBadge[incident.severity]}`}>
                        {incident.severity}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusBadge[incident.status]}`}>
                        {getIncidentStatusLabel(incident.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{incident.assignedTeam}</td>
                    <td className="px-3 py-3 text-muted-foreground">{incident.time}</td>
                    <td className="px-3 py-3">
                      <button className="text-blue-400 hover:text-blue-300 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
