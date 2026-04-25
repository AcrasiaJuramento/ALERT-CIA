import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Activity, Users, CheckCircle2, Clock, TrendingUp,
  Flame, Droplets, Car, Heart, Radio, ChevronRight, Bell, MapPin, RefreshCw
} from 'lucide-react';
import { MapSimulation } from '../components/MapSimulation';
import { incidents, recentActivity } from '../data/mockData';

const statCards = [
  {
    label: 'Total Incidents Today',
    value: '12',
    change: '+3 from yesterday',
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    trend: 'up',
  },
  {
    label: 'Active Emergencies',
    value: '8',
    change: '3 critical, 5 responding',
    icon: Activity,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    trend: 'up',
  },
  {
    label: 'Teams Deployed',
    value: '5',
    change: 'Alpha, Bravo, Charlie, Delta, Echo',
    icon: Users,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    trend: 'neutral',
  },
  {
    label: 'Resolved Today',
    value: '4',
    change: '33% resolution rate',
    icon: CheckCircle2,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    trend: 'down',
  },
  {
    label: 'Avg Response Time',
    value: '7.4m',
    change: '-1.2m from last week',
    icon: Clock,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    trend: 'down',
  },
];

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
  active: 'bg-red-600/20 text-red-400',
  responding: 'bg-orange-600/20 text-orange-400',
  resolved: 'bg-green-600/20 text-green-400',
  pending: 'bg-slate-600/20 text-slate-400',
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

export default function Dashboard() {
  const navigate = useNavigate();
  const [selectedIncident, setSelectedIncident] = useState(null);
  const activeIncidents = incidents.filter(i => i.status !== 'resolved').slice(0, 6);

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
          <button className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => navigate('/admin/pcr')}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-all"
          >
            <Radio className="w-3.5 h-3.5" />
            New PCR Report
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map(({ label, value, change, icon: Icon, color, bg, border, trend }) => (
          <div key={label} className={`p-4 rounded-xl border ${bg} ${border} bg-card`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <TrendingUp className={`w-3.5 h-3.5 ${trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-green-400 rotate-180' : 'text-muted-foreground'}`} />
            </div>
            <div className={`text-2xl font-bold ${color} mb-0.5`}>{value}</div>
            <div className="text-muted-foreground text-[10px] leading-tight mb-1">{label}</div>
            <div className="text-muted-foreground text-[9px] opacity-70">{change}</div>
          </div>
        ))}
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
          <MapSimulation
            height="calc(100% - 45px)"
            showControls={true}
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
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border hover:bg-secondary/50 transition-all">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${activityColor[item.type]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-tight">{item.message}</p>
                    <span className="text-[10px] text-muted-foreground">{item.time}</span>
                  </div>
                </div>
              ))}
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
              {[
                { team: 'Alpha Team', location: 'Bridge Maragat', status: 'On Scene', color: 'text-red-400' },
                { team: 'Bravo Team', location: 'Brgy. Poblacion', status: 'Active', color: 'text-orange-400' },
                { team: 'Charlie Team', location: 'Brgy. San Miguel', status: 'Responding', color: 'text-orange-400' },
                { team: 'Delta Team', location: 'Brgy. Pandan', status: 'Active', color: 'text-orange-400' },
                { team: 'Echo Team', location: 'Brgy. Concepcion', status: 'Responding', color: 'text-orange-400' },
              ].map(({ team, location, status, color }) => (
                <div key={team} className="flex items-center justify-between px-3 py-2 bg-secondary/50 rounded-lg">
                  <div>
                    <div className="text-xs font-medium text-foreground">{team}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" /> {location}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold ${color}`}>{status}</span>
                </div>
              ))}
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
                        {incident.status}
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