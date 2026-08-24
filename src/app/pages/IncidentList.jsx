import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Plus, Eye, Edit2, Users,
  AlertTriangle, Flame, Droplets, Car, Heart, Download, FileText
} from 'lucide-react';
import { getPCRReportByResponse, listIncidents } from '../services/supabase';
import { PCRPreviewModal } from '../components/PCRPreviewModal';
import { getIncidentStatusLabel, INCIDENT_STATUS_OPTIONS, isIncidentCompleted } from '../utils/incidentStatus';
import { formatLongDate } from '../utils/dateFormat';

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

const titleCase = value => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, letter => letter.toUpperCase());

const incidentSummary = incident => {
  if (incident.title) return incident.title;
  if (incident.description && incident.description !== 'No narrative has been added for this incident yet.') return incident.description.split('.')[0];
  const type = incident.type === 'vehicular' ? 'Vehicular' : titleCase(incident.type || incident.classification || 'Emergency');
  const subtype = incident.subtype || incident.incidentNature || '';
  const action = subtype ? titleCase(subtype) : incident.status === 'pcr_completed' || incident.status === 'completed' ? 'Response Completed' : 'Emergency Response';
  return `${type} Incident - ${action}`;
};

export default function IncidentList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [incidents, setIncidents] = useState([]);
  const [summaryIncidents, setSummaryIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pcrLoadingIncidentId, setPcrLoadingIncidentId] = useState(null);
  const [pcrPreview, setPcrPreview] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const filters = {
          completedWorkflowOnly: true,
          status: filterStatus === 'all' ? undefined : filterStatus,
          type: filterType === 'all' ? undefined : filterType,
          severity: filterSeverity === 'all' ? undefined : filterSeverity,
        };
        const [rows, summaryRows] = await Promise.all([
          listIncidents({
            ...filters,
            limit: pageSize,
            from: (page - 1) * pageSize,
          }),
          listIncidents({
            ...filters,
            limit: 500,
            from: 0,
          }),
        ]);
        if (mounted) {
          setIncidents(Array.isArray(rows) ? rows : []);
          setSummaryIncidents(Array.isArray(summaryRows) ? summaryRows : []);
          setTotalCount(rows.totalCount ?? rows.length);
        }
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load incidents.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [filterSeverity, filterStatus, filterType, page]);

  const filtered = useMemo(() => incidents.filter(inc => {
    const searchText = [
      inc.id,
      inc.title,
      inc.description,
      inc.location,
      inc.barangay,
      inc.assignedTeam,
      inc.sourceLabel,
    ].join(' ').toLowerCase();
    const matchSearch =
      !search ||
      searchText.includes(search.toLowerCase());
    const matchSeverity = filterSeverity === 'all' || inc.severity === filterSeverity;
    const matchType = filterType === 'all' || inc.type === filterType;
    const matchStatus = filterStatus === 'all' || inc.status === filterStatus;
    return matchSearch && matchSeverity && matchType && matchStatus;
  }), [filterSeverity, filterStatus, filterType, incidents, search]);
  const pageCount = Math.max(1, Math.ceil((search ? filtered.length : totalCount) / pageSize));
  const visibleIncidents = filtered;

  useEffect(() => setPage(1), [search, filterSeverity, filterType, filterStatus]);

  const stats = {
    total: totalCount,
    critical: summaryIncidents.filter(i => i.severity === 'critical').length,
    active: summaryIncidents.filter(i => !isIncidentCompleted(i.status)).length,
    resolved: summaryIncidents.filter(i => isIncidentCompleted(i.status)).length,
  };

  const selectClass = 'px-3 py-2 bg-secondary border border-border rounded-lg text-muted-foreground text-xs focus:outline-none focus:border-blue-500 transition-all';
  const exportCsv = () => {
    const header = ['Incident ID', 'Type', 'Location', 'Date', 'Time', 'Severity', 'Status', 'Response Team', 'Source'];
    const rows = filtered.map(incident => [
      incident.id,
      incident.type,
      incident.location,
      incident.date,
      incident.time,
      incident.severity,
      getIncidentStatusLabel(incident.status),
      incident.assignedTeam,
      incident.sourceLabel,
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `alert-cia-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const openLinkedPcr = async (incident) => {
    if (!incident?.responseId) {
      setError('This incident does not have a linked PCR response.');
      return;
    }

    setError('');
    setPcrLoadingIncidentId(incident.id);
    try {
      const linkedPcr = await getPCRReportByResponse(incident.responseId);
      if (!linkedPcr) {
        setError('No Patient Care Record is linked to this incident yet.');
        return;
      }
      setPcrPreview(linkedPcr);
    } catch (requestError) {
      setError(requestError.message || 'Unable to open linked PCR.');
    } finally {
      setPcrLoadingIncidentId(null);
    }
  };
  const editPcr = (record) => {
    if (!record?.id) return;
    setPcrPreview(null);
    navigate(`/admin/pcr/new?edit=${record.id}`);
  };

  return (
    <div className="p-5 space-y-5 bg-(--emergency-bg)" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Incident & Accident List
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">{filtered.length} completed dispatch and PCR records found</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 bg-secondary border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground transition-all">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={() => navigate('/admin/dispatch/new')}
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
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Incidents</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Type</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Location</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Severity</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Response Team</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Casualties</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleIncidents.map((incident) => {
                const TypeIcon = typeIcons[incident.type] || AlertTriangle;
                return (
                  <tr
                    key={incident.id}
                    onClick={() => navigate(`/admin/incidents/${incident.id}`)}
                    className="cursor-pointer border-b border-border hover:bg-secondary/30 transition-all"
                  >
                    <td className="px-5 py-3.5">
                      <div className="max-w-72">
                        <div className="truncate font-semibold text-foreground">{incidentSummary(incident)}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {formatLongDate(incident.date)}{incident.time ? ` • ${incident.time}` : ''}
                        </div>
                      </div>
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
                    <td className="px-3 py-3.5 text-muted-foreground">
                      <div>{incident.assignedTeam}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground/80">{incident.sourceLabel}</div>
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {incident.casualties > 0 ? (
                        <span className="text-red-400 font-semibold">{incident.casualties}</span>
                      ) : (
                        <span className="text-muted-foreground opacity-50">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5" onClick={event => event.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => navigate(`/admin/incidents/${incident.id}`)}
                          className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-all"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => navigate(`/admin/dispatch/new?incident=${incident.id}`)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-all"
                          title="Create or edit dispatch"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => navigate(`/admin/dispatch/new?incident=${incident.id}`)}
                          className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10 transition-all"
                          title="Assign through dispatch"
                        >
                          <Users className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openLinkedPcr(incident)}
                          disabled={pcrLoadingIncidentId === incident.id}
                          className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10 transition-all disabled:cursor-wait disabled:opacity-60"
                          title="Open linked PCR"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="py-16 text-center">
            <p className="text-muted-foreground text-sm">Loading incidents...</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-16 text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No completed dispatch and PCR records match your filters</p>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">Showing {visibleIncidents.length ? (page - 1) * pageSize + 1 : 0}-{Math.min((page - 1) * pageSize + visibleIncidents.length, search ? filtered.length : totalCount)} of {search ? filtered.length : totalCount} incidents</span>
          <div className="flex gap-1">
            <button disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40">Prev</button>
            <span className="px-2 py-1.5 text-xs text-muted-foreground">Page {page} of {pageCount}</span>
            <button disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))} className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
      <PCRPreviewModal
        record={pcrPreview}
        onClose={() => setPcrPreview(null)}
        onEdit={editPcr}
      />
    </div>
  );
}
