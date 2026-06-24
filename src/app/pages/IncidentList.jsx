import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Plus, Eye, Edit2, Users, ChevronDown,
  AlertTriangle, Flame, Droplets, Car, Heart, Download
} from 'lucide-react';
import { incidents } from '../data/mockData';
import { getIncidentStatusLabel, INCIDENT_STATUS_OPTIONS, isIncidentCompleted } from '../utils/incidentStatus';

const severityBadge = {
  critical: 'bg-red-600/20 text-red-400 border border-red-500/30',
  warning: 'bg-orange-600/20 text-orange-400 border border-orange-500/30',
  moderate: 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30',
  resolved: 'bg-green-600/20 text-green-400 border border-green-500/30',
};

const statusBadge = {
  in_route: 'bg-blue-500/20 text-blue-400',
  on_scene: 'bg-orange-500/20 text-orange-400',
  transporting: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-green-500/20 text-green-400',
};

const typeIcons = {
  vehicular: Car,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: AlertTriangle,
  other: AlertTriangle,
};

const typeColors = {
  vehicular: 'text-red-400',
  fire: 'text-orange-400',
  medical: 'text-blue-400',
  flood: 'text-cyan-400',
  crime: 'text-purple-400',
  other: 'text-slate-400',
};

export default function IncidentList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const filtered = incidents.filter(inc => {
    const matchSearch =
      !search ||
      inc.id.toLowerCase().includes(search.toLowerCase()) ||
      inc.location.toLowerCase().includes(search.toLowerCase()) ||
      inc.assignedTeam.toLowerCase().includes(search.toLowerCase());
    const matchSeverity = filterSeverity === 'all' || inc.severity === filterSeverity;
    const matchType = filterType === 'all' || inc.type === filterType;
    const matchStatus = filterStatus === 'all' || inc.status === filterStatus;
    return matchSearch && matchSeverity && matchType && matchStatus;
  });

  const stats = {
    total: incidents.length,
    critical: incidents.filter(i => i.severity === 'critical').length,
    active: incidents.filter(i => !isIncidentCompleted(i.status)).length,
    resolved: incidents.filter(i => isIncidentCompleted(i.status)).length,
  };

  const selectClass = 'px-3 py-2 bg-secondary border border-border rounded-lg text-muted-foreground text-xs focus:outline-none focus:border-blue-500 transition-all';

  return (
    <div className="p-5 space-y-5 bg-(--emergency-bg)" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Incident & Accident List
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">{filtered.length} incidents found</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={() => navigate('/admin/pcr')}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New Incident
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground', bg: 'bg-card' },
          { label: 'Critical', value: stats.critical, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Ongoing', value: stats.active, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          { label: 'Completed', value: stats.resolved, color: 'text-green-400', bg: 'bg-green-500/10' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-border rounded-xl p-4`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-muted-foreground text-xs mt-0.5">{label} Incidents</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by ID, location, team..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-input-background border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>

          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} className={selectClass}>
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="moderate">Moderate</option>
            <option value="resolved">Resolved</option>
          </select>

          <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectClass}>
            <option value="all">All Types</option>
            <option value="vehicular">Vehicular</option>
            <option value="fire">Fire</option>
            <option value="medical">Medical</option>
            <option value="flood">Flood</option>
            <option value="crime">Crime</option>
            <option value="other">Other</option>
          </select>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
            <option value="all">All Status</option>
            {INCIDENT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            {filtered.length} results
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Incident ID</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Type</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Location</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Date & Time</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Severity</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Response Team</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Casualties</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((incident) => {
                const TypeIcon = typeIcons[incident.type];
                return (
                  <tr
                    key={incident.id}
                    className="border-b border-border hover:bg-secondary/30 transition-all"
                  >
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-blue-400 font-medium">{incident.id}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className={`inline-flex items-center gap-1.5 ${typeColors[incident.type]}`}>
                        <TypeIcon className="w-3.5 h-3.5" />
                        <span className="capitalize">{incident.type}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-foreground max-w-40">
                      <div className="truncate">{incident.location}</div>
                    </td>
                    <td className="px-3 py-3.5 text-muted-foreground">
                      <div>{incident.date}</div>
                      <div className="opacity-70">{incident.time}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${severityBadge[incident.severity]}`}>
                        {incident.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusBadge[incident.status]}`}>
                        {getIncidentStatusLabel(incident.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-muted-foreground">{incident.assignedTeam}</td>
                    <td className="px-3 py-3.5 text-center">
                      {incident.casualties > 0 ? (
                        <span className="text-red-400 font-semibold">{incident.casualties}</span>
                      ) : (
                        <span className="text-muted-foreground opacity-50">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => navigate(`/admin/incidents/${incident.id}`)}
                          className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-all"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-all"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-all"
                          title="Assign Team"
                        >
                          <Users className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No incidents match your filters</p>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">Showing {filtered.length} of {incidents.length} incidents</span>
          <div className="flex gap-1">
            {[1, 2, 3].map(page => (
              <button
                key={page}
                className={`w-7 h-7 rounded text-xs font-medium transition-all ${
                  page === 1 ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
