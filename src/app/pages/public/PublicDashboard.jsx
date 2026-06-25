import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Activity, CheckCircle2, MapPin, Clock, ChevronRight,
  Flame, Droplets, Car, Heart, PhoneCall, Shield, Volume2
} from 'lucide-react';
import { listIncidents, listPublicScrapedMapIncidents } from '../../services/supabase';
import { ADVISORY_EVENT, formatAdvisoryTime, loadPublishedAdvisories } from '../../utils/advisoryStorage';
import { isIncidentCompleted } from '../../utils/incidentStatus';

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

export default function PublicDashboard() {
  const navigate = useNavigate();
  const [publicAdvisories, setPublicAdvisories] = useState(() => loadPublishedAdvisories());
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeIncidents = incidents.filter(i => !isIncidentCompleted(i.status));
  const resolvedToday = incidents.filter(i => isIncidentCompleted(i.status)).length;
  const criticalCount = incidents.filter(i => i.severity === 'critical').length;

  useEffect(() => {
    let mounted = true;
    async function loadIncidents() {
      setLoading(true);
      setError('');
      try {
        const [official, scraped] = await Promise.all([
          listIncidents({ publicOnly: true, limit: 200 }),
          listPublicScrapedMapIncidents({ limit: 100 }),
        ]);
        if (mounted) setIncidents([...official, ...scraped]);
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load public incident data.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadIncidents();
    const refreshAdvisories = () => setPublicAdvisories(loadPublishedAdvisories());
    window.addEventListener('storage', refreshAdvisories);
    window.addEventListener(ADVISORY_EVENT, refreshAdvisories);
    return () => {
      mounted = false;
      window.removeEventListener('storage', refreshAdvisories);
      window.removeEventListener(ADVISORY_EVENT, refreshAdvisories);
    };
  }, []);

  return (
    <div className="bg-background min-h-screen transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Emergency Banner */}
      {criticalCount > 0 && (
        <div className="bg-red-600 text-white py-2.5 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-sm font-semibold">⚠ {criticalCount} Critical Incident{criticalCount > 1 ? 's' : ''} Active</span>
              <span className="text-red-200 text-xs hidden sm:inline">Stay alert and follow safety guidelines</span>
            </div>
            <a href="tel:911" className="flex items-center gap-1.5 bg-white text-red-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-50 transition-all">
              <PhoneCall className="w-3.5 h-3.5" /> Call 911
            </a>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
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
          ].map(({ label, value, icon: Icon, color, bg, border }) => (
            <div key={label} className={`p-4 rounded-2xl border ${bg} ${border} transition-colors duration-300`}>
              <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-muted-foreground text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>

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
                const s = announcementSeverity[ann.severity];
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
                {[
                  { label: 'Emergency Hotline', number: '911', color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10' },
                  { label: 'MDRRMO Office', number: '036-268-5123', color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10' },
                  { label: 'Fire Station', number: '036-268-3456', color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10' },
                  { label: 'Police (PNP)', number: '036-268-7890', color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10' },
                  { label: 'KDH Hospital', number: '036-268-2100', color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10' },
                ].map(({ label, number, color }) => (
                  <a key={label} href={`tel:${number}`} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-secondary transition-all group">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${color} group-hover:opacity-80 transition-all`}>{number}</span>
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
                  'In case of fire, call 911 immediately before attempting to fight it',
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
                    <span className="text-[10px] text-muted-foreground opacity-70">{incident.date} • {incident.time}</span>
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
