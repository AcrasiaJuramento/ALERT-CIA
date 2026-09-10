import { subscribeToPublicDataChanges } from '../../services/supabase/publicRealtime';
import { createInformationalRefresh } from '../../utils/informationalRefresh';
import { getPublicGadAnalytics, invalidatePublicData } from '../../services/supabase/publicDataService';
import { createElement, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, Activity, CheckCircle2, MapPin, Clock, ChevronRight,
  Flame, Droplets, Car, Heart, PhoneCall, Shield, Volume2, X
} from 'lucide-react';
import { formatAdvisoryTime, loadPublishedAdvisories } from '../../utils/advisoryStorage';
import { isIncidentCompleted } from '../../utils/incidentStatus';
import { loadPublicAccidentIncidents } from '../../utils/publicIncidentFeed';
import { listPublishedAdvisories, subscribeToPublicAdvisories } from '../../services/supabase';
import { formatDateAndTime } from '../../utils/dateFormat';

const typeIcons = {
  vehicular: Car,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: AlertTriangle,
  other: AlertTriangle,
};

const typeColors = {
  vehicular: 'text-red-500 bg-red-50 dark:bg-red-500/10',
  fire: 'text-orange-500 bg-orange-50 dark:bg-orange-500/10',
  medical: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10',
  flood: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10',
  crime: 'text-purple-500 bg-purple-50 dark:bg-purple-500/10',
  other: 'text-muted-foreground bg-muted',
};

const severityBadge = {
  critical: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30',
  warning: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30',
  moderate: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/30',
  resolved: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30',
};

const announcementSeverity = {
  critical: { bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/30', dot: 'bg-red-500', icon: 'text-red-500' },
  warning: { bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-200 dark:border-orange-500/30', dot: 'bg-orange-500', icon: 'text-orange-500' },
  moderate: { bg: 'bg-yellow-50 dark:bg-yellow-500/10', border: 'border-yellow-200 dark:border-yellow-500/30', dot: 'bg-yellow-500', icon: 'text-yellow-500' },
  resolved: { bg: 'bg-green-50 dark:bg-green-500/10', border: 'border-green-200 dark:border-green-500/30', dot: 'bg-green-500', icon: 'text-green-500' },
};

const mdrrmoContacts = [
  { label: 'MDRRMO Hotline', value: '09176262352', href: 'tel:09176262352', color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10' },
  { label: 'MDRRMO Hotline 2', value: '09431320604', href: 'tel:09431320604', color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10' },
  { label: 'MDRRMO Email', value: 'mdrrmo.echague@gmail.com', href: 'mailto:mdrrmo.echague@gmail.com', color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10' },
  { label: 'OPWAR Email', value: 'opwar.mdrrm.echague@gmail.com', href: 'mailto:opwar.mdrrm.echague@gmail.com', color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10' },
  { label: 'Mdrrmo Echague', value: 'Facebook', href: 'https://www.facebook.com/mdrrmo.echague.5', color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10' },
  { label: 'Echague Rescue', value: 'Facebook', href: 'https://www.facebook.com/mdrrmoechague', color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10' },
];

const sexSeries = [
  { key: 'female', label: 'Female', color: '#dc2626' },
  { key: 'male', label: 'Male', color: '#2563eb' },
  { key: 'unspecified', label: 'Unspecified', color: '#64748b' },
];

const incidentTypeSeries = [
  { key: 'mvc', label: 'MVC', color: '#dc2626' },
  { key: 'medical', label: 'Medical', color: '#2563eb' },
  { key: 'trauma', label: 'Trauma', color: '#f97316' },
  { key: 'fire', label: 'Fire', color: '#ea580c' },
  { key: 'rescue', label: 'Rescue', color: '#14b8a6' },
  { key: 'other', label: 'Other', color: '#64748b' },
];

const chartColors = ['#dc2626', '#2563eb', '#14b8a6', '#f97316', '#64748b', '#eab308'];

function isPublicAnnouncementAdvisory(advisory = {}) {
  return !['accident_prone_area', 'accident_hotspot'].includes(String(advisory.advisoryType || advisory.category || '').toLowerCase());
}

export default function PublicDashboard() {
  const navigate = useNavigate();
  const [publicAdvisories, setPublicAdvisories] = useState(() => loadPublishedAdvisories().filter(isPublicAnnouncementAdvisory));
  const [dismissedAdvisoryId, setDismissedAdvisoryId] = useState('');
  const [incidents, setIncidents] = useState([]);
  const [gadAnalytics, setGadAnalytics] = useState(null);
  const [gadLoading, setGadLoading] = useState(true);
  const [gadError, setGadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeIncidents = incidents.filter(i => !isIncidentCompleted(i.status));
  const resolvedToday = incidents.filter(i => isIncidentCompleted(i.status)).length;
  const criticalCount = activeIncidents.filter(
    incident => String(incident.severity || incident.priority || '').trim().toLowerCase() === 'critical',
  ).length;
  const topAdvisory = useMemo(() => publicAdvisories[0] || null, [publicAdvisories]);
  const showAdvisoryPopup = topAdvisory && topAdvisory.id !== dismissedAdvisoryId;

  useEffect(() => {
    let mounted = true;
    let incidentRequestInFlight = false;

    async function loadAdvisoriesFromDatabase() {
      try {
        const advisories = await listPublishedAdvisories({ limit: 50 });
        if (mounted) setPublicAdvisories(advisories.filter(isPublicAnnouncementAdvisory));
      } catch {
        if (mounted) setPublicAdvisories(loadPublishedAdvisories().filter(isPublicAnnouncementAdvisory));
      }
    }

    async function loadIncidents({ silent = false } = {}) {
      if (incidentRequestInFlight) return;
      incidentRequestInFlight = true;
      if (!silent) setLoading(true);
      if (!silent) setError('');
      try {
        const publicIncidents = await loadPublicAccidentIncidents();
        if (mounted) {
          setIncidents(publicIncidents);
          setError('');
        }
      } catch (requestError) {
        if (mounted && !silent) setError(requestError.message || 'Unable to load public incident data.');
      } finally {
        incidentRequestInFlight = false;
        if (mounted && !silent) setLoading(false);
      }
    }

    async function loadGadAnalytics({ silent = false } = {}) {
      if (!silent) setGadLoading(true);
      if (!silent) setGadError('');
      try {
        const analytics = await getPublicGadAnalytics();
        if (mounted) {
          setGadAnalytics(analytics);
          setGadError('');
        }
      } catch (requestError) {
        if (mounted && !silent) setGadError(requestError.message || 'Unable to load public GAD analytics.');
      } finally {
        if (mounted && !silent) setGadLoading(false);
      }
    }

    const refresh = createInformationalRefresh(() => {
      loadIncidents({ silent: true });
      loadGadAnalytics({ silent: true });
    }, { invalidate: invalidatePublicData });
    const queueIncidentRefresh = refresh.markStale;
    loadIncidents();
    loadGadAnalytics();
    loadAdvisoriesFromDatabase();
    const unsubscribe = subscribeToPublicAdvisories(loadAdvisoriesFromDatabase);
    const refreshTimer = window.setInterval(() => { if (document.visibilityState === 'visible') loadAdvisoriesFromDatabase(); }, 60000);
    const unsubscribeIncidents = subscribeToPublicDataChanges(queueIncidentRefresh);
    return () => {
      mounted = false;
      unsubscribe();
      window.clearInterval(refreshTimer);
      refresh.dispose();
      unsubscribeIncidents();
    };
  }, []);

  return (
    <div className="bg-background min-h-screen transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {topAdvisory && (
        <div className={`${announcementSeverity[topAdvisory.severity]?.dot || 'bg-orange-500'} text-white px-4 py-2.5 shadow-sm`}>
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-white animate-pulse" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{topAdvisory.title}</div>
              <div className="truncate text-xs text-white/85">{topAdvisory.message}</div>
            </div>
            <button onClick={() => navigate('/public/map')} className="hidden rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25 sm:inline-flex">
              View map
            </button>
          </div>
        </div>
      )}

      {/* Emergency Banner */}
      {criticalCount > 0 && (
        <div className="bg-red-600 text-white py-2.5 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-sm font-semibold">⚠ {criticalCount} Critical Incident{criticalCount > 1 ? 's' : ''} Active</span>
              <span className="text-red-200 text-xs hidden sm:inline">Stay alert and follow safety guidelines</span>
            </div>
            <a href="tel:09176262352" className="flex items-center gap-1.5 bg-white text-red-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-50 transition-all">
              <PhoneCall className="w-3.5 h-3.5" /> Call MDRRMO
            </a>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {showAdvisoryPopup && (
          <div className={`rounded-2xl border p-4 shadow-lg ${announcementSeverity[topAdvisory.severity]?.bg || announcementSeverity.warning.bg} ${announcementSeverity[topAdvisory.severity]?.border || announcementSeverity.warning.border}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${announcementSeverity[topAdvisory.severity]?.dot || announcementSeverity.warning.dot} animate-pulse`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">{topAdvisory.title}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${severityBadge[topAdvisory.severity] || severityBadge.warning}`}>
                    {topAdvisory.severity}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{topAdvisory.message}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{topAdvisory.area}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatAdvisoryTime(topAdvisory)}</span>
                </div>
              </div>
              <button onClick={() => setDismissedAdvisoryId(topAdvisory.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-background/60" title="Dismiss advisory">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Public Safety Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">Real-time emergency information for Echague, Isabela residents</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Active Incidents', value: activeIncidents.length, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-100 dark:border-red-500/20' },
            { label: 'Critical Alerts', value: criticalCount, icon: Activity, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10', border: 'border-orange-100 dark:border-orange-500/20' },
            { label: 'Teams Responding', value: new Set(activeIncidents.map(item => item.assignedTeam).filter(Boolean)).size, icon: Shield, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-100 dark:border-blue-500/20' },
            { label: 'Completed Today', value: resolvedToday, icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/10', border: 'border-green-100 dark:border-green-500/20' },
          ].map(({ label, value, icon, color, bg, border }) => (
            <div key={label} className={`p-4 rounded-2xl border ${bg} ${border} transition-colors duration-300`}>
              <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                {createElement(icon, { className: `w-5 h-5 ${color}` })}
              </div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-muted-foreground text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        <PublicGadAnalyticsSection analytics={gadAnalytics} loading={gadLoading} error={gadError} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Announcements */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Emergency Announcements
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Volume2 className="w-3.5 h-3.5" />
                Public Advisories
              </div>
            </div>
            <div className="space-y-3">
              {publicAdvisories.map((ann) => {
                const s = announcementSeverity[ann.severity] || announcementSeverity.warning;
                return (
                  <div key={ann.id} className={`p-4 rounded-2xl border ${s.bg} ${s.border} transition-colors duration-300`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${s.dot} ${ann.severity === 'critical' ? 'animate-pulse' : ''}`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-foreground">{ann.title}</h3>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${severityBadge[ann.severity]}`}>
                            {ann.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{ann.message}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground opacity-70">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {ann.area}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {ann.time || formatAdvisoryTime(ann)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {publicAdvisories.length === 0 && (
                <div className="p-4 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
                  No public advisories are posted right now.
                </div>
              )}
            </div>
          </div>

          {/* Quick Links + Safety Tips */}
          <div className="space-y-4">
            {/* Emergency Contacts */}
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm transition-colors duration-300">
              <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Emergency Contacts
              </h3>
              <div className="space-y-2">
                {mdrrmoContacts.map(({ label, value, href, color }) => (
                  <a key={label} href={href} className="flex items-center justify-between gap-3 p-2.5 rounded-xl hover:bg-secondary transition-all group">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg text-right ${color} group-hover:opacity-80 transition-all`}>{value}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm transition-colors duration-300">
              <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Quick Actions
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/public/map')}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-700 dark:text-red-400 rounded-xl text-xs font-medium transition-all"
                >
                  <MapPin className="w-4 h-4" />
                  View Live Safety Map
                  <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                </button>
                <button
                  onClick={() => navigate('/public/incidents')}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 rounded-xl text-xs font-medium transition-all"
                >
                  <AlertTriangle className="w-4 h-4" />
                  View All Incidents
                  <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                </button>
              </div>
            </div>

            {/* Safety Tips */}
            <div className="bg-linear-to-br from-blue-50 to-slate-50 dark:from-blue-500/10 dark:to-secondary rounded-2xl border border-blue-100 dark:border-blue-500/20 p-4 transition-colors duration-300">
              <h3 className="text-sm font-bold text-foreground mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Safety Tips
              </h3>
              <div className="space-y-2">
                {[
                  'During floods, stay away from rivers and low-lying areas',
                  'In case of fire, call MDRRMO immediately before attempting to fight it',
                  'If you witness an accident, keep a safe distance and call for help',
                  'Keep your emergency contacts updated and easily accessible',
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-4 h-4 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold mt-0.5">
                      {i + 1}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Active Incidents */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Active Incidents Nearby
            </h2>
            <button
              onClick={() => navigate('/public/incidents')}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium hover:text-blue-700 dark:hover:text-blue-300"
            >
              View all <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeIncidents.slice(0, 6).map((incident) => {
              const TypeIcon = typeIcons[incident.type] || AlertTriangle;
              return (
                <div
                  key={incident.id}
                  className="bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate('/public/incidents')}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${typeColors[incident.type]}`}>
                      <TypeIcon className="w-4.5 h-4.5" style={{ width: '18px', height: '18px' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-muted-foreground">{incident.id}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${severityBadge[incident.severity]}`}>
                          {incident.severity}
                        </span>
                      </div>
                      <p className="text-xs text-foreground font-medium truncate capitalize">{incident.type} Incident</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-xs text-muted-foreground leading-relaxed">{incident.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground opacity-70">{formatDateAndTime(incident.date, incident.time)}</span>
                  </div>
                </div>
              );
            })}
            {loading && <div className="col-span-full py-12 text-center text-sm text-muted-foreground">Loading public incidents...</div>}
            {!loading && error && <div className="col-span-full py-12 text-center text-sm text-red-500">{error}</div>}
            {!loading && !error && !activeIncidents.length && <div className="col-span-full py-12 text-center text-sm text-muted-foreground">No active public incidents are available.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PublicGadAnalyticsSection({ analytics, loading, error }) {
  const totals = analytics?.totals || {};
  const mvcTotal = totals.mvcPersons || 0;
  const incidentTotal = totals.verifiedIncidents || 0;
  const personTotal = totals.verifiedPersons || 0;
  const incidentTypeRows = analytics?.incidentTypeTotals || [];
  const gadBySex = analytics?.gadBySex || [];
  const gadAgeRows = analytics?.gadByAgeGroup || [];
  const monthlyIncidentRows = analytics?.monthlyIncidentsByType || [];
  const monthlyPersonRows = analytics?.monthlyPersonsBySex || [];
  const mvcBySex = analytics?.mvcBySex || [];
  const monthlyRows = analytics?.monthlyMvcBySex || [];
  const typeRows = analytics?.incidentTypeBySex || [];
  const barangayIncidentRows = analytics?.barangayIncidentTotals || [];
  const barangayPersonRows = analytics?.barangayPersonsBySex || [];
  const barangayRows = analytics?.barangayMvcBySex || [];
  const hasAnalytics = incidentTotal > 0 || personTotal > 0;
  const hasMvcData = mvcTotal > 0;

  return (
    <section className="space-y-5">
      <div className="border-l-2 border-blue-500 pl-4">
        <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Public Safety Analytics
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Aggregate trends from verified public-safe incident records, with a GAD lens and MVC safety focus.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Loading public analytics...
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <AnalyticsMetricCards totals={totals} />

            <PublicDistributionCard
              title="Incident Categories"
              subtitle={`${incidentTotal} verified public incident${incidentTotal === 1 ? '' : 's'}`}
              data={incidentTypeRows}
              type="bar"
            />
            <PublicDistributionCard
              title="GAD Affected Persons by Sex"
              subtitle={`${personTotal} verified affected person${personTotal === 1 ? '' : 's'}`}
              data={gadBySex}
              type="bar"
            />
            <PublicDistributionCard
              title="GAD Age Groups"
              subtitle="Age brackets across verified public-safe patient records"
              data={gadAgeRows}
              type="pie"
            />
            <StackedChartCard
              title="Monthly Incident Trend"
              subtitle="Verified public incidents over the last 12 calendar months"
              data={monthlyIncidentRows}
              series={incidentTypeSeries}
            />
            <StackedChartCard
              title="Incident Type by Sex"
              subtitle="Affected persons grouped by incident category"
              data={typeRows.slice(0, 6)}
              categoryKey="name"
            />
            <StackedChartCard
              title="Monthly GAD Trend"
              subtitle="Affected persons by sex over the last 12 calendar months"
              data={monthlyPersonRows}
            />
            <RankedBarCard
              title="Top Barangays by Incidents"
              subtitle="Verified public incident count by barangay"
              data={barangayIncidentRows}
            />
            <StackedChartCard
              title="Affected Persons by Barangay"
              subtitle="Top barangays grouped by sex"
              data={barangayPersonRows}
              layout="vertical"
            />

            <div className="xl:col-span-2 border-l-2 border-red-500 pl-4 pt-2">
              <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                MVC Safety Focus
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Motor vehicle crash details for affected persons, age groups, monthly movement, and barangay concentration.
              </p>
            </div>

            <PublicDistributionCard
              title="MVC Patients by Sex"
              subtitle={`${mvcTotal} verified MVC affected person${mvcTotal === 1 ? '' : 's'}`}
              data={mvcBySex}
              type="bar"
            />
            <PublicDistributionCard
              title="MVC Age Groups"
              subtitle="Age brackets from verified response and dispatch patient records"
              data={analytics?.mvcByAgeGroup || []}
              type="pie"
            />
            <StackedChartCard
              title="Monthly MVC by Sex"
              subtitle="Last 12 calendar months"
              data={monthlyRows}
            />
            <div className="xl:col-span-2">
              <StackedChartCard
                title="MVC Affected Persons by Barangay"
                subtitle="Top barangays among verified MVC records"
                data={barangayRows}
                layout="vertical"
              />
            </div>
          </div>

          {!hasMvcData && (
            <div className="rounded-lg border border-border bg-secondary/30 px-4 py-5 text-center text-sm text-muted-foreground">
              No verified MVC GAD records are available for public analytics yet.
            </div>
          )}
          {!hasAnalytics && (
            <div className="rounded-lg border border-border bg-secondary/30 px-4 py-5 text-center text-sm text-muted-foreground">
              No verified public analytics records are available yet.
            </div>
          )}
        </>
      )}
    </section>
  );
}

function AnalyticsMetricCards({ totals }) {
  const cards = [
    { label: 'Verified Incidents', value: totals.verifiedIncidents || 0, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10' },
    { label: 'Affected Persons', value: totals.verifiedPersons || 0, icon: Activity, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
    { label: 'MVC Incidents', value: totals.mvcIncidents || 0, icon: Car, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-500/10' },
    { label: 'MVC Affected Persons', value: totals.mvcPersons || 0, icon: Shield, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-500/10' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon, color, bg }) => (
        <div key={label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${bg}`}>
            {createElement(icon, { className: `h-5 w-5 ${color}` })}
          </div>
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}

function PublicChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
      {label && <div className="mb-1 font-semibold text-foreground">{label}</div>}
      {payload.map(item => (
        <div key={`${item.name}-${item.dataKey}`} className="flex items-center justify-between gap-5">
          <span className="text-muted-foreground">{item.name}</span>
          <span className="font-semibold text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function PublicDistributionCard({ title, subtitle, data, type = 'bar' }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const hasData = data.some(item => item.count > 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <ChartHeader title={title} subtitle={subtitle} total={total} />
      {!hasData ? <EmptyChart /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <ResponsiveContainer width="100%" height={220}>
            {type === 'pie' ? (
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="name" innerRadius={55} outerRadius={86} paddingAngle={2}>
                  {data.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
                </Pie>
                <Tooltip content={<PublicChartTooltip />} />
              </PieChart>
            ) : (
              <BarChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<PublicChartTooltip />} />
                <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
          <ChartLegendRows data={data} />
        </div>
      )}
    </div>
  );
}

function StackedChartCard({ title, subtitle, data, layout = 'horizontal', categoryKey = 'month', series = sexSeries }) {
  const total = data.reduce((sum, item) => sum + item.total, 0);
  const hasData = data.some(item => item.total > 0);
  const vertical = layout === 'vertical';

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <ChartHeader title={title} subtitle={subtitle} total={total} />
      {!hasData ? <EmptyChart /> : (
        <ResponsiveContainer width="100%" height={vertical ? 300 : 240}>
          <BarChart
            data={data}
            layout={vertical ? 'vertical' : 'horizontal'}
            margin={vertical ? { top: 4, right: 18, left: 26, bottom: 0 } : { top: 4, right: 8, left: -18, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
            {vertical ? (
              <>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              </>
            ) : (
              <>
                <XAxis dataKey={categoryKey} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              </>
            )}
            <Tooltip content={<PublicChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map(item => (
              <Bar key={item.key} dataKey={item.key} name={item.label} stackId="analytics" fill={item.color} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function RankedBarCard({ title, subtitle, data }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(...data.map(item => item.count), 0);
  const hasData = data.some(item => item.count > 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <ChartHeader title={title} subtitle={subtitle} total={total} />
      {!hasData ? <EmptyChart /> : (
        <div className="space-y-3">
          {data.map((item, index) => {
            const width = max > 0 ? Math.round((item.count / max) * 100) : 0;
            return (
              <div key={item.name}>
                <div className="mb-1 flex justify-between gap-3 text-xs">
                  <span className="truncate text-muted-foreground">{index + 1}. {item.name}</span>
                  <span className="font-semibold text-foreground">{item.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: chartColors[index % chartColors.length] }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChartHeader({ title, subtitle, total }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitle}</p>
      </div>
      <span className="shrink-0 rounded-md border border-border bg-secondary/50 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
        {total} total
      </span>
    </div>
  );
}

function ChartLegendRows({ data }) {
  return (
    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
      {data.map((item, index) => (
        <div key={item.name}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className="truncate text-muted-foreground">{item.name}</span>
            <span className="font-semibold text-foreground">{item.count} / {item.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: chartColors[index % chartColors.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-8 text-center text-xs text-muted-foreground">
      No verified public aggregate records available yet
    </div>
  );
}
