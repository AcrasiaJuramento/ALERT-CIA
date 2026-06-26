import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Flame, Droplets, Car, Heart, Shield,
  ChevronDown, Layers, RefreshCw, ChevronRight, Clock, Database, FileText, Radio, Zap
} from 'lucide-react';
import { LeafletIncidentMap } from '../components/map/LeafletIncidentMap';
import { listIncidents, listOfficerScrapedMapIncidents, listPCRMapIncidents, supabase, triggerScraperRefresh } from '../services/supabase';
import { getIncidentStatusLabel, isIncidentCompleted } from '../utils/incidentStatus';

const severityBadge = {
  critical: 'bg-red-600/20 text-red-400 border border-red-500/30',
  warning: 'bg-orange-600/20 text-orange-400 border border-orange-500/30',
  moderate: 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30',
  resolved: 'bg-green-600/20 text-green-400 border border-green-500/30',
};

const statusColors = {
  in_route: 'text-blue-400',
  on_scene: 'text-orange-400',
  transporting: 'text-purple-400',
  completed: 'text-green-400',
};

const typeIcons = {
  vehicular: Car,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: AlertTriangle,
  other: AlertTriangle,
};

const sourceFilters = [
  { key: 'all', label: 'All sources', icon: Database },
  { key: 'official', label: 'Official', icon: Shield },
  { key: 'pcr_report', label: 'PCR', icon: FileText },
  { key: 'scraper', label: 'Scraper', icon: Radio },
];

const mapLayerOptions = [
  { key: 'incidents', label: 'Accident Hotspot', icon: AlertTriangle, color: 'text-red-500' },
  { key: 'dangerZones', label: 'Flood Risk Area', icon: Droplets, color: 'text-blue-500' },
  { key: 'advisories', label: 'Traffic Hazard', icon: Car, color: 'text-yellow-500' },
  { key: 'heatmap', label: 'Heatmap', icon: Zap, color: 'text-orange-500' },
];

const layerToggleOptions = [
  ['incidents', 'Incidents'],
  ['advisories', 'Advisories'],
  ['heatmap', 'Heatmap'],
  ['dangerZones', 'Geofences'],
  ['routes', 'Routes'],
];

function getSourceGroup(incident) {
  if (incident.sourceKind === 'pcr_report') return 'pcr_report';
  if (String(incident.sourceKind || '').includes('scraped')) return 'scraper';
  return 'official';
}

function hasMapCoordinates(incident) {
  return Number.isFinite(Number(incident?.lat)) && Number.isFinite(Number(incident?.lng));
}

export default function MapMonitoring() {
  const navigate = useNavigate();

  const [selectedIncident, setSelectedIncident] = useState(null);
  const [activeSource, setActiveSource] = useState('all');
  const [incidentPanelOpen, setIncidentPanelOpen] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [mapLayerMenuOpen, setMapLayerMenuOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState({
    incidents: true,
    advisories: true,
    heatmap: true,
    dangerZones: true,
    routes: true,
  });
  const [incidents, setIncidents] = useState([]);
  const [pcrIncidents, setPcrIncidents] = useState([]);
  const [scrapedIncidents, setScrapedIncidents] = useState([]);
  const [scraperError, setScraperError] = useState('');
  const [scraperMessage, setScraperMessage] = useState('');
  const [scraperRefreshing, setScraperRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadMapData() {
      setLoading(true);
      try {
        const [officialRecords, scrapedRecords, pcrRecords] = await Promise.all([
          listIncidents({ limit: 500 }),
          listOfficerScrapedMapIncidents(),
          listPCRMapIncidents({ limit: 200 }),
        ]);
        if (mounted) {
          setIncidents(officialRecords);
          setScrapedIncidents(scrapedRecords);
          setPcrIncidents(pcrRecords);
          setScraperError('');
        }
      } catch (error) {
        if (mounted) setScraperError(error.message || 'Unable to load map records.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadMapData();
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel('map-monitoring-scraper-records')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scraper_records' },
        () => setReloadKey(key => key + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => setReloadKey(key => key + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pcr_reports' },
        () => setReloadKey(key => key + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const refreshScraperData = async () => {
    setScraperRefreshing(true);
    setScraperError('');
    setScraperMessage('');
    try {
      const result = await triggerScraperRefresh({ type: 'all' });
      const inserted = result.totals?.inserted ?? 0;
      const duplicates = result.totals?.duplicates ?? 0;
      setScraperMessage(`Scraper updated: ${inserted} new, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped.`);
      setReloadKey(key => key + 1);
    } catch (error) {
      setScraperError(error.message || 'Unable to refresh scraper data.');
    } finally {
      setScraperRefreshing(false);
    }
  };

  const mapIncidents = useMemo(
    () => [...incidents, ...pcrIncidents, ...scrapedIncidents]
      .filter(hasMapCoordinates)
      .filter(item => activeSource === 'all' || getSourceGroup(item) === activeSource),
    [activeSource, incidents, pcrIncidents, scrapedIncidents]
  );
  const activeIncidents = mapIncidents.filter(i => !isIncidentCompleted(i.status));
  const selectedInc = mapIncidents.find(i => i.id === selectedIncident);
  const sourceCounts = {
    all: incidents.length + pcrIncidents.length + scrapedIncidents.length,
    official: incidents.length,
    pcr_report: pcrIncidents.length,
    scraper: scrapedIncidents.length,
  };

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      {/* Full-screen Map */}
      <div className="flex-1 relative overflow-hidden">
        <LeafletIncidentMap
          height="100%"
          incidents={mapIncidents}
          showControls={true}
          showHeatmap={true}
          showDangerZones={true}
          onMarkerClick={(id) => setSelectedIncident(id)}
          selectedIncidentId={selectedIncident || undefined}
          externalLayers={mapLayers}
          onExternalLayersChange={setMapLayers}
          hideLayerControl
        />

        {/* Operations toolbar */}
        <div className="absolute left-4 right-4 top-3 z-1001 flex items-start justify-between gap-3">
          <div className="flex h-10 min-w-36 items-center gap-2 rounded-lg border border-slate-300 bg-white/95 px-3 text-slate-900 shadow-lg backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95 dark:text-slate-100">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <div className="min-w-0 leading-tight">
              <div className="text-[11px] font-bold uppercase">Operations Map</div>
              <div className="truncate text-[10px] text-slate-500 dark:text-slate-300">Echague, Isabela</div>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-center gap-3">
            <div className="relative">
              <button
                onClick={() => {
                  setLayersOpen(current => !current);
                  setActionsOpen(false);
                  setMapLayerMenuOpen(false);
                }}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white/95 px-3 text-[12px] font-semibold text-slate-700 shadow-lg backdrop-blur transition-all hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700/70 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Layers"
              >
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                Layers
                <ChevronDown className={`h-3.5 w-3.5 text-slate-600 transition-transform dark:text-slate-100 ${layersOpen ? 'rotate-180' : ''}`} />
              </button>
              {layersOpen && (
                <div className="absolute left-0 mt-2 w-40 rounded-xl border border-slate-300 bg-white/95 p-2 text-slate-700 shadow-2xl backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95 dark:text-slate-200">
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    Layers
                  </div>
                  {layerToggleOptions.map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-lg font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
                      <input
                        type="checkbox"
                        checked={mapLayers[key]}
                        onChange={(event) => setMapLayers(current => ({ ...current, [key]: event.target.checked }))}
                        className="h-4 w-4 rounded accent-blue-500"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setActionsOpen(current => !current);
                  setLayersOpen(false);
                  setMapLayerMenuOpen(false);
                }}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-blue-400/40 bg-blue-600/95 px-4 text-[12px] font-semibold text-white shadow-lg transition-all hover:bg-blue-700 dark:border-blue-400/50 dark:bg-blue-600/95 dark:hover:bg-blue-500"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-white ${scraperRefreshing ? 'animate-spin' : ''}`} />
                Refresh
                <ChevronDown className={`h-3.5 w-3.5 text-white transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
              </button>
              {actionsOpen && (
                <div className="absolute left-1/2 mt-2 w-48 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-300 bg-white/95 p-3 text-slate-700 shadow-2xl backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95 dark:text-slate-200">
                  <button
                    onClick={() => {
                      setReloadKey(key => key + 1);
                      setActionsOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-lg font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh map
                  </button>
                  <button
                    onClick={() => {
                      refreshScraperData();
                      setActionsOpen(false);
                    }}
                    disabled={scraperRefreshing}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-lg font-semibold text-blue-300 hover:bg-blue-600/20 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${scraperRefreshing ? 'animate-spin' : ''}`} />
                    {scraperRefreshing ? 'Fetching latest' : 'Fetch latest'}
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setMapLayerMenuOpen(current => !current);
                  setActionsOpen(false);
                  setLayersOpen(false);
                }}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white/95 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-700 shadow-lg backdrop-blur transition-all hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700/70 dark:bg-slate-900/95 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Map layers"
              >
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                Map Layers
                <ChevronDown className={`h-3.5 w-3.5 text-slate-600 transition-transform dark:text-slate-100 ${mapLayerMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {mapLayerMenuOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-300 bg-white/95 p-3 text-xs text-slate-700 shadow-2xl backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/95 dark:text-slate-200">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    Map Layers
                  </div>
                  {mapLayerOptions.map(({ key, label, icon: Icon, color }) => (
                    <button
                      key={key}
                      onClick={() => setMapLayers(current => ({ ...current, [key]: !current[key] }))}
                      className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left font-semibold transition-all ${
                        mapLayers[key] ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'
                      } hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${color}`} />
                      <span className="flex-1">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selected Incident Popup */}
        {selectedInc && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-1001 w-96">
            <div className={`bg-card/98 border rounded-xl p-4 shadow-2xl ${
              selectedInc.severity === 'critical' ? 'border-red-500/50' :
              selectedInc.severity === 'warning' ? 'border-orange-500/50' :
              'border-border'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-blue-400 text-sm font-bold">{selectedInc.id}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${severityBadge[selectedInc.severity]}`}>
                      {selectedInc.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80">{selectedInc.location}</p>
                  {selectedInc.sourceKind && (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                      {selectedInc.sourceKind.replaceAll('_', ' ')} / {selectedInc.sourceLabel}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedIncident(null)}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none"
                >
                  x
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{selectedInc.description}</p>
              <div className="mb-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div className="rounded-lg bg-secondary/60 p-2">
                  <span className="block uppercase tracking-wide">Barangay</span>
                  <span className="text-foreground">{selectedInc.barangay || selectedInc.location || 'Unspecified'}</span>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2">
                  <span className="block uppercase tracking-wide">Date / Time</span>
                  <span className="text-foreground">{selectedInc.date || '-'} {selectedInc.time || ''}</span>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2">
                  <span className="block uppercase tracking-wide">Coordinates</span>
                  <span className="text-foreground">
                    {Number.isFinite(Number(selectedInc.lat)) && Number.isFinite(Number(selectedInc.lng))
                      ? `${Number(selectedInc.lat).toFixed(5)}, ${Number(selectedInc.lng).toFixed(5)}`
                      : 'Location pending'}
                  </span>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2">
                  <span className="block uppercase tracking-wide">Related Record</span>
                  <span className="text-foreground">{selectedInc.recordId || selectedInc.relatedIncidentId || selectedInc.responseId || 'Official'}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold ${statusColors[selectedInc.status]}`}>
                    Status: {getIncidentStatusLabel(selectedInc.status).toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">{selectedInc.assignedTeam}</span>
                </div>
                <button
                  onClick={() => {
                    if (!selectedInc.sourceKind || selectedInc.sourceKind === 'official' || selectedInc.sourceKind === 'promoted_scraped') {
                      navigate(`/admin/incidents/${selectedInc.relatedIncidentId || selectedInc.id}`);
                    }
                  }}
                  disabled={selectedInc.sourceKind && !['official', 'promoted_scraped'].includes(selectedInc.sourceKind)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all"
                >
                  {selectedInc.sourceKind && !['official', 'promoted_scraped'].includes(selectedInc.sourceKind) ? 'Linked record' : 'Details'} <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Incidents Panel */}
      <div
        className={`shrink-0 bg-card border-l border-border flex flex-col transition-all duration-300 overflow-hidden ${
          incidentPanelOpen ? 'w-80' : 'w-10'
        }`}
      >
        <button
          onClick={() => setIncidentPanelOpen(!incidentPanelOpen)}
          className="w-full h-9 flex items-center justify-center border-b border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shrink-0"
          title={incidentPanelOpen ? 'Collapse records panel' : 'Open records panel'}
        >
          {incidentPanelOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />}
        </button>

        {incidentPanelOpen && (
          <>
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-semibold text-foreground">Operational Records</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{activeIncidents.length} active / {mapIncidents.length} mapped records</p>
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {sourceFilters.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveSource(key)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all ${
                      activeSource === key
                        ? 'border-blue-500/40 bg-blue-600/15 text-blue-500'
                        : 'border-border bg-background/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                    <span className="text-[9px] opacity-70">{sourceCounts[key]}</span>
                  </button>
                ))}
              </div>
              {loading && <p className="mt-1 text-[10px] text-muted-foreground">Loading map records...</p>}
              {scraperMessage && <p className="mt-1 text-[10px] text-green-400">{scraperMessage}</p>}
              {scraperError && <p className="mt-1 text-[10px] text-orange-400">{scraperError}</p>}
            </div>

            <div className="flex-1 overflow-y-auto">
              {activeIncidents.map((inc) => {
                const TypeIcon = typeIcons[inc.type] || AlertTriangle;
                return (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedIncident(inc.id === selectedIncident ? null : inc.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-secondary/50 transition-all ${
                      selectedIncident === inc.id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        inc.severity === 'critical' ? 'bg-red-500/20' :
                        inc.severity === 'warning' ? 'bg-orange-500/20' : 'bg-yellow-500/20'
                      }`}>
                        <TypeIcon className={`w-3 h-3 ${
                          inc.severity === 'critical' ? 'text-red-400' :
                          inc.severity === 'warning' ? 'text-orange-400' : 'text-yellow-400'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[10px] font-mono text-blue-400">{inc.id}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${severityBadge[inc.severity]}`}>
                            {inc.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-foreground truncate capitalize">{inc.type} Incident</p>
                        <p className="text-[10px] text-muted-foreground truncate">{inc.location}</p>
                        {inc.sourceKind && (
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-blue-400 truncate">
                            {inc.sourceKind.replaceAll('_', ' ')}
                          </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                          <span className="text-[9px] text-muted-foreground">{inc.date || '-'} {inc.time || ''}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Shield className="w-2.5 h-2.5 text-muted-foreground" />
                          <span className="text-[9px] text-muted-foreground">{inc.assignedTeam}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!loading && !activeIncidents.length && (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No active incidents are available for your role.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
