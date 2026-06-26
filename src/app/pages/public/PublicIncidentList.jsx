import { useEffect, useMemo, useState } from 'react';
import { Search, MapPin, Clock, Filter, Flame, Droplets, Car, Heart, AlertTriangle } from 'lucide-react';
import { getIncidentStatusLabel, INCIDENT_STATUS } from '../../utils/incidentStatus';
import { loadPublicAccidentIncidents } from '../../utils/publicIncidentFeed';

const typeIcons = {
  vehicular: Car,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: AlertTriangle,
  other: AlertTriangle,
};

const typeBg = {
  vehicular: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
  fire: 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400',
  medical: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
  flood: 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  crime: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400',
  other: 'bg-secondary text-muted-foreground',
};

const severityColors = {
  critical: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  warning: { bg: 'bg-orange-100 dark:bg-orange-500/20', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  moderate: { bg: 'bg-yellow-100 dark:bg-yellow-500/20', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  resolved: { bg: 'bg-green-100 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  completed: { bg: 'bg-green-100 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
};

const defaultSeverityColor = severityColors.moderate;

export default function PublicIncidentList() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const publicIncidents = await loadPublicAccidentIncidents({ officialLimit: 300, scrapedLimit: 100 });
        if (mounted) setIncidents(publicIncidents);
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
    const matchSearch =
      !search ||
      (inc.location || '').toLowerCase().includes(search.toLowerCase()) ||
      (inc.type || '').toLowerCase().includes(search.toLowerCase()) ||
      String(inc.id || '').toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || inc.type === filterType;
    const matchSeverity = filterSeverity === 'all' || inc.severity === filterSeverity;
    return matchSearch && matchType && matchSeverity;
  }), [filterSeverity, filterType, incidents, search]);

  const typeCounts = {
    all: incidents.length,
    vehicular: incidents.filter(i => i.type === 'vehicular').length,
    fire: incidents.filter(i => i.type === 'fire').length,
    medical: incidents.filter(i => i.type === 'medical').length,
    flood: incidents.filter(i => i.type === 'flood').length,
    crime: incidents.filter(i => i.type === 'crime').length,
  };

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
          {[
            { key: 'all', label: 'All', icon: Filter, count: typeCounts.all },
            { key: 'vehicular', label: 'Vehicular', icon: Car, count: typeCounts.vehicular },
            { key: 'fire', label: 'Fire', icon: Flame, count: typeCounts.fire },
            { key: 'medical', label: 'Medical', icon: Heart, count: typeCounts.medical },
            { key: 'flood', label: 'Flood', icon: Droplets, count: typeCounts.flood },
            { key: 'crime', label: 'Crime', icon: AlertTriangle, count: typeCounts.crime },
          ].map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                filterType === key
                  ? 'bg-red-600 text-white border-red-600 shadow-sm'
                  : 'bg-card text-muted-foreground border-border hover:border-red-300 hover:text-red-600 dark:hover:text-red-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterType === key ? 'bg-red-500' : 'bg-secondary text-muted-foreground'}`}>
                {count}
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
            <option value="all">All Severity Levels</option>
            <option value="critical">🔴 Critical</option>
            <option value="warning">🟠 Warning</option>
            <option value="moderate">🟡 Moderate</option>
            <option value="resolved">🟢 Resolved</option>
          </select>
        </div>

        {/* Results count */}
        <div className="text-xs text-muted-foreground">
          Showing <strong className="text-foreground">{filtered.length}</strong> of {incidents.length} incidents
        </div>

        {/* Incident Cards */}
        <div className="space-y-3">
          {filtered.map((incident) => {
            const TypeIcon = typeIcons[incident.type] || AlertTriangle;
            const sev = severityColors[incident.severity] || defaultSeverityColor;
            return (
              <div
                key={incident.id}
                className="bg-card rounded-2xl border border-border p-4 hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Type Icon */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${typeBg[incident.type]}`}>
                    <TypeIcon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{incident.id}</span>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${sev.bg} ${sev.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot} ${incident.severity === 'critical' ? 'animate-pulse' : ''}`} />
                        {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground capitalize bg-secondary px-2 py-0.5 rounded-full">
                        {incident.type}
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
                        {incident.date} at {incident.time}
                      </div>
                      {incident.casualties > 0 && (
                        <div className="flex items-center gap-1 text-xs text-red-500 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          {incident.casualties} affected
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Status */}
                  <div className="flex flex-col items-end gap-2">
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                      incident.status === INCIDENT_STATUS.ON_SCENE ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400' :
                      incident.status === INCIDENT_STATUS.TRANSPORTING ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400' :
                      incident.status === INCIDENT_STATUS.IN_ROUTE ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' :
                      incident.status === INCIDENT_STATUS.SCRAPED ? 'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300' :
                      'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                    }`}>
                      {getIncidentStatusLabel(incident.status)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
            In case of emergency, always call <strong>911</strong> immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
