import { createElement, useEffect, useMemo, useState } from 'react';
import { Search, MapPin, Clock, Filter, Car, Heart, AlertTriangle } from 'lucide-react';
import { loadPublicIncidentLogRecords } from '../../utils/publicIncidentFeed';
import { formatDateAndTime } from '../../utils/dateFormat';

const pcrFilterTypes = [
  { key: 'all', label: 'All', icon: Filter },
  { key: 'medical', label: 'Medical', icon: Heart },
  { key: 'trauma', label: 'Trauma', icon: AlertTriangle },
  { key: 'obstetrical', label: 'Obstetrical', icon: Heart },
  { key: 'mvc', label: 'Motor Vehicle Crash', icon: Car },
  { key: 'conduction', label: 'Conduction', icon: Clock },
  { key: 'other', label: 'Other PCR', icon: AlertTriangle },
];

const typeBg = {
  medical: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
  trauma: 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400',
  obstetrical: 'bg-pink-50 dark:bg-pink-500/10 text-pink-600 dark:text-pink-400',
  mvc: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
  conduction: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  other: 'bg-secondary text-muted-foreground',
};

const severityColors = {
  black: { bg: 'bg-slate-900 dark:bg-black/50', text: 'text-slate-50 dark:text-slate-100', dot: 'bg-slate-950 dark:bg-black' },
  red: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-500/20', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  green: { bg: 'bg-green-100 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  grey: { bg: 'bg-slate-100 dark:bg-slate-500/20', text: 'text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' },
  critical: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  warning: { bg: 'bg-orange-100 dark:bg-orange-500/20', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  moderate: { bg: 'bg-yellow-100 dark:bg-yellow-500/20', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  resolved: { bg: 'bg-green-100 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  completed: { bg: 'bg-green-100 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
};

const defaultSeverityColor = severityColors.grey;
const INCIDENTS_PER_PAGE = 10;
const triageFilterTypes = [
  { key: 'all', label: 'All Triage' },
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'green', label: 'Green' },
  { key: 'grey', label: 'Grey' },
];
const triageLabels = Object.fromEntries(triageFilterTypes.map(item => [item.key, item.label]));
const pcrTypeLabels = Object.fromEntries(pcrFilterTypes.map(item => [item.key, item.label]));
const pcrTypeIcons = Object.fromEntries(pcrFilterTypes.map(item => [item.key, item.icon]));

function incidentTypeText(incident = {}) {
  return [
    incident.type,
    incident.classification,
    incident.incidentType,
    incident.incident_type,
    incident.category,
    incident.title,
    incident.description,
    incident.natureOfCall,
    incident.typeOfIncident,
    incident.incidentNature,
    ...(incident.natureTypes || []),
    ...(incident.emergencyTypes || []),
    ...(incident.traumaTypes || []),
    incident.emergencyOther,
    incident.otherMedical,
    incident.otherTrauma,
  ].filter(Boolean).join(' ').toLowerCase();
}

function pcrCategoryForIncident(incident = {}) {
  const text = incidentTypeText(incident);
  if (/\b(motor vehicle crash|mvc|vehicular|vehicle|motorcycle|tricycle|collision|crash|road accident|traffic accident)\b/.test(text)) return 'mvc';
  if (/\b(obstetrical|obstetric|pregnan|labor|delivery)\b/.test(text)) return 'obstetrical';
  if (/\b(conduction|transport|transfer)\b/.test(text)) return 'conduction';
  if (/\b(trauma|fall|electrocution|domestic violence|water rescue|fire incident|assault|animal bite|hacking|stabbing|snake bite|dog bite|cat bite)\b/.test(text)) return 'trauma';
  if (/\b(medical|pediatric|psychiatric|surgical|drowning|emergency|chief complaint|patient care report)\b/.test(text)) return 'medical';
  return 'other';
}

function triageCategoryForIncident(incident = {}) {
  const value = String(incident.triage || incident.severity || incident.severity_level || incident.priority || '').trim().toLowerCase();
  if (value === 'black') return 'black';
  if (['red', 'critical', 'high', 'warning'].includes(value)) return 'red';
  if (['yellow', 'moderate', 'medium'].includes(value)) return 'yellow';
  if (['green', 'low', 'resolved', 'completed'].includes(value)) return 'green';
  if (['grey', 'gray', 'unknown', 'none', 'n/a'].includes(value)) return 'grey';
  return 'grey';
}

export default function PublicIncidentList() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [page, setPage] = useState(1);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const publicIncidents = await loadPublicIncidentLogRecords({ officialLimit: 150, pcrLimit: 75 });
        if (mounted) setIncidents(Array.isArray(publicIncidents) ? publicIncidents : []);
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load public incidents.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => incidents.filter(inc => {
    const searchableText = [
      inc.location,
      inc.type,
      inc.classification,
      inc.incidentType,
      inc.incident_type,
      inc.title,
      inc.description,
      inc.barangay,
      String(inc.id || ''),
      incidentTypeText(inc),
    ].join(' ').toLowerCase();
    const matchSearch =
      !search ||
      searchableText.includes(search.toLowerCase());
    const matchType = filterType === 'all' || pcrCategoryForIncident(inc) === filterType;
    const matchSeverity = filterSeverity === 'all' || triageCategoryForIncident(inc) === filterSeverity;
    return matchSearch && matchType && matchSeverity;
  }), [filterSeverity, filterType, incidents, search]);

  const typeCounts = useMemo(() => pcrFilterTypes.reduce((counts, item) => ({
    ...counts,
    [item.key]: item.key === 'all'
      ? incidents.length
      : incidents.filter(incident => pcrCategoryForIncident(incident) === item.key).length,
  }), {}), [incidents]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / INCIDENTS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const paginated = filtered.slice((currentPage - 1) * INCIDENTS_PER_PAGE, currentPage * INCIDENTS_PER_PAGE);

  useEffect(() => {
    setPage(1);
  }, [filterSeverity, filterType, search]);

  return (
    <div className="bg-background min-h-screen transition-colors duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Public Incident Log
          </h1>
          <p className="text-muted-foreground text-sm">Viewable incident records for public awareness</p>
        </div>

        {/* Type Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {pcrFilterTypes.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                filterType === key
                  ? 'bg-red-600 text-white border-red-600 shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:border-red-300 hover:text-red-600 dark:hover:text-red-400'
              }`}
            >
              {createElement(icon, { className: 'w-3.5 h-3.5' })}
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterType === key ? 'bg-red-500' : 'bg-secondary text-muted-foreground'}`}>
                {typeCounts[key] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Severity Filter */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by location, type..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-red-400 transition-all"
            />
          </div>
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value)}
            className="px-4 py-2.5 bg-card border border-border rounded-xl text-muted-foreground text-sm focus:outline-none focus:border-red-400 transition-all"
          >
            {triageFilterTypes.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Results count */}
        <div className="text-xs text-muted-foreground">
          Showing <strong className="text-foreground">{paginated.length}</strong> of <strong className="text-foreground">{filtered.length}</strong> matching incidents
        </div>

        {/* Incident Cards */}
        <div className="space-y-3">
          {paginated.map((incident) => {
            const pcrCategory = pcrCategoryForIncident(incident);
            const TypeIcon = pcrTypeIcons[pcrCategory] || AlertTriangle;
            const triageCategory = triageCategoryForIncident(incident);
            const sev = severityColors[triageCategory] || defaultSeverityColor;
            return (
              <div
                key={incident.id}
                className="bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Type Icon */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${typeBg[pcrCategory] || typeBg.other}`}>
                    <TypeIcon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{incident.id}</span>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${sev.bg} ${sev.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot} ${triageCategory === 'red' || triageCategory === 'black' ? 'animate-pulse' : ''}`} />
                        {triageLabels[triageCategory] || 'Grey'}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground capitalize bg-secondary px-2 py-0.5 rounded-full">
                        {pcrTypeLabels[pcrCategory] || 'Other PCR'}
                      </span>
                    </div>

                    <div className="flex items-start gap-1.5 mb-1.5">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground font-medium">{incident.location}</span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">{incident.description}</p>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDateAndTime(incident.date, incident.time)}
                      </div>
                      {incident.casualties > 0 && (
                        <div className="flex items-center gap-1 text-xs text-red-500 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          {incident.casualties} affected
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!loading && !error && filtered.length > INCIDENTS_PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-medium text-muted-foreground">
              Page <strong className="text-foreground">{currentPage}</strong> of <strong className="text-foreground">{pageCount}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(value => Math.max(1, value - 1))}
                disabled={currentPage <= 1}
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage(value => Math.min(pageCount, value + 1))}
                disabled={currentPage >= pageCount}
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="py-20 text-center text-sm text-muted-foreground">Loading public incidents...</div>
        )}

        {!loading && error && (
          <div className="py-20 text-center text-sm text-red-500">{error}</div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-muted-foreground opacity-40" />
            </div>
            <p className="text-muted-foreground text-sm font-medium">No incidents match your search</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Try adjusting your filters</p>
          </div>
        )}

        {/* Disclaimer */}
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-4">
          <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
            <strong>Disclaimer:</strong> Incident information is provided for public awareness only. Some details may be withheld for operational security. 
            In case of emergency, call MDRRMO Echague immediately at <strong>09176262352</strong> or <strong>09431320604</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
