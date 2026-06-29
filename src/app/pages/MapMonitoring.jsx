import { createElement, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers, AlertTriangle, Flame, Droplets, Car, Heart, Shield,
  RefreshCw, ChevronRight, ChevronDown, Zap, Clock, Database, FileText, Radio
} from 'lucide-react';
import { LeafletIncidentMap } from '../components/map/LeafletIncidentMap';
import { getScraperProgress, listIncidents, listOfficerScrapedMapIncidents, listPCRMapIncidents, supabase, triggerScraperRefresh } from '../services/supabase';
import { getIncidentStatusLabel, isIncidentCompleted } from '../utils/incidentStatus';
import { hasValidLatLng, isWithinEchagueMapArea } from '../utils/mapData';

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

function getSourceGroup(incident) {
  if (incident.sourceKind === 'pcr_report') return 'pcr_report';
  if (String(incident.sourceKind || '').includes('scraped')) return 'scraper';
  return 'official';
}

const settledValue = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback);

export default function MapMonitoring() {
  const navigate = useNavigate();

  const [selectedIncident, setSelectedIncident] = useState(null);
  const [activeLayer, setActiveLayer] = useState(null);
  const [activeSource, setActiveSource] = useState('all');
  const [incidentPanelOpen, setIncidentPanelOpen] = useState(true);
  const [scrapeMenuOpen, setScrapeMenuOpen] = useState(false);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [mapLayerMenuOpen, setMapLayerMenuOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState({
    incidents: true,
    advisories: false,
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
  const [scraperMode, setScraperMode] = useState(null);
  const [scraperProgress, setScraperProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadMapData() {
      setLoading(true);
      try {
        const [officialResult, scrapedResult, pcrResult] = await Promise.allSettled([
          listIncidents({ limit: 500 }),
          listOfficerScrapedMapIncidents(),
          listPCRMapIncidents({ limit: 200 }),
        ]);
        if (mounted) {
          const officialRecords = settledValue(officialResult, []);
          const scrapedRecords = settledValue(scrapedResult, []);
          const pcrRecords = settledValue(pcrResult, []);
          setIncidents(officialRecords);
          setScrapedIncidents(scrapedRecords);
          setPcrIncidents(pcrRecords);
          const failed = [officialResult, scrapedResult, pcrResult].find(result => result.status === 'rejected');
          setScraperError(failed?.reason?.message || '');
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

  useEffect(() => {
    if (!scraperRefreshing) return undefined;
    let active = true;
    const poll = async () => {
      const progress = await getScraperProgress();
      if (active && progress) setScraperProgress(progress);
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [scraperRefreshing]);

  const refreshScraperData = async (mode = 'update') => {
    setScrapeMenuOpen(false);
    setScraperRefreshing(true);
    setScraperMode(mode);
    setScraperError('');
    setScraperMessage('');
    setScraperProgress(null);
    try {
      const result = await triggerScraperRefresh({ type: 'vehicular', mode });
      const inserted = result.new_incidents ?? result.totals?.inserted ?? 0;
      const merged = result.merged_incidents ?? result.totals?.matched ?? 0;
      const duplicates = result.duplicates_skipped ?? result.totals?.duplicates ?? 0;
      setScraperMessage(`${mode === 'full' ? 'Full accident scrape' : 'Accident update'} completed: ${inserted} new, ${merged} merged, ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped.`);
      setReloadKey(key => key + 1);
    } catch (error) {
      setScraperError(error.message || 'Unable to refresh scraper data.');
    } finally {
      setScraperRefreshing(false);
      setScraperMode(null);
    }
  };

  const mapIncidents = useMemo(
    () => [...incidents, ...pcrIncidents, ...scrapedIncidents]
      .filter(hasValidLatLng)
      .filter(isWithinEchagueMapArea)
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
  const layerOptions = [
    { key: 'incidents', label: 'Incidents' },
    { key: 'advisories', label: 'Advisories' },
    { key: 'heatmap', label: 'Heatmap' },
    { key: 'dangerZones', label: 'Geofences' },
    { key: 'routes', label: 'Routes' },
  ];
  const mapLayerOptions = [
    { key: 'hotspot', label: 'Accident Hotspot', color: 'text-red-400', icon: AlertTriangle },
    { key: 'flood', label: 'Flood Risk Area', color: 'text-blue-400', icon: Droplets },
    { key: 'traffic', label: 'Traffic Hazard', color: 'text-yellow-400', icon: Car },
    { key: 'heatmap', label: 'Heatmap', color: 'text-orange-400', icon: Zap },
  ];

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
          externalLayers={mapLayers}
          onExternalLayersChange={setMapLayers}
          hideLayerControl
          onMarkerClick={(id) => setSelectedIncident(id)}
          selectedIncidentId={selectedIncident || undefined}
        />

        {/* Top overlay bar */}
        <div className="absolute left-6 right-6 top-5 z-[500] flex items-start justify-between gap-4 pointer-events-none">
          <div className="pointer-events-auto flex min-h-12 items-center gap-2.5 rounded-xl bg-white/95 px-4 py-2.5 text-slate-950 shadow-xl ring-1 ring-slate-900/10 dark:bg-slate-900/95 dark:text-white dark:ring-white/10">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_5px_rgba(239,68,68,0.12)]" />
            <div>
              <div className="text-xs font-bold uppercase leading-tight">Operations Map</div>
              <div className="text-xs text-slate-500 dark:text-slate-300">Echague, Isabela</div>
            </div>
          </div>

          <div className="pointer-events-auto flex items-start gap-4">
            <div className="relative">
              <button
                onClick={() => {
                  setLayerMenuOpen(current => !current);
                  setScrapeMenuOpen(false);
                  setMapLayerMenuOpen(false);
                }}
                className="flex h-12 items-center gap-2.5 rounded-xl bg-white/95 px-4 text-xs font-bold text-slate-800 shadow-xl ring-1 ring-slate-900/10 hover:bg-slate-100 dark:bg-slate-900/95 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-slate-800"
              >
                <Layers className="h-4 w-4 text-blue-400" />
                Layers
                <ChevronDown className={`h-4 w-4 transition-transform ${layerMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {layerMenuOpen && (
                <div className="absolute left-0 top-14 w-52 rounded-xl bg-white/95 p-4 text-slate-900 shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-900/95 dark:text-slate-100 dark:ring-white/10">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    Layers
                  </div>
                  <div className="space-y-3">
                    {layerOptions.map(({ key, label }) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm font-bold text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
                        <input
                          type="checkbox"
                          checked={Boolean(mapLayers[key])}
                          onChange={(event) => setMapLayers(current => ({ ...current, [key]: event.target.checked }))}
                          className="h-4 w-4 accent-blue-500"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setReloadKey(key => key + 1);
                  setScrapeMenuOpen(false);
                  setLayerMenuOpen(false);
                  setMapLayerMenuOpen(false);
                }}
                className="flex h-12 items-center gap-2.5 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-xl hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-75"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setScrapeMenuOpen(current => !current);
                  setLayerMenuOpen(false);
                  setMapLayerMenuOpen(false);
                }}
                disabled={scraperRefreshing}
                className="flex h-12 items-center gap-2.5 rounded-xl bg-white/95 px-4 text-xs font-bold text-slate-800 shadow-xl ring-1 ring-slate-900/10 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-75 dark:bg-slate-900/95 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-slate-800"
                title="Scraping actions"
              >
                <Database className={`h-4 w-4 text-purple-300 ${scraperRefreshing ? 'animate-pulse' : ''}`} />
                {scraperMode === 'update' ? 'Updating...' : scraperMode === 'full' ? 'Full scrape...' : 'Scraping'}
                <ChevronDown className={`h-4 w-4 transition-transform ${scrapeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {scrapeMenuOpen && (
                <div className="absolute right-0 top-14 w-64 rounded-xl bg-white/95 p-3 text-slate-900 shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-900/95 dark:text-slate-100 dark:ring-white/10">
                  <div className="mb-1.5 flex items-center gap-2 px-2 py-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    <Database className="h-3.5 w-3.5 text-purple-300" />
                    Scraping
                  </div>
                  <button
                    onClick={() => refreshScraperData('update')}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left text-base font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-slate-800 dark:hover:text-blue-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>
                      Update scrape
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-500 dark:text-slate-500">Pages 1-3 per news site</span>
                    </span>
                  </button>
                  <button
                    onClick={() => refreshScraperData('full')}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left text-base font-bold text-purple-600 hover:bg-purple-50 hover:text-purple-700 dark:text-purple-300 dark:hover:bg-slate-800 dark:hover:text-purple-200"
                  >
                    <Database className="h-4 w-4" />
                    <span>
                      Full scrape
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-500 dark:text-slate-500">All configured pages</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setMapLayerMenuOpen(current => !current);
                  setLayerMenuOpen(false);
                  setScrapeMenuOpen(false);
                }}
                className="flex h-12 items-center gap-2.5 rounded-xl bg-white/95 px-4 text-xs font-bold uppercase text-slate-700 shadow-xl ring-1 ring-slate-900/10 hover:bg-slate-100 hover:text-slate-950 dark:bg-slate-900/95 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <Layers className="h-4 w-4 text-blue-400" />
                Map Layers
                <ChevronDown className={`h-4 w-4 transition-transform ${mapLayerMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {mapLayerMenuOpen && (
                <div className="absolute right-0 top-14 w-56 rounded-xl bg-white/95 p-4 text-slate-900 shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-900/95 dark:text-slate-100 dark:ring-white/10">
                  <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    Map Layers
                  </div>
                  <div className="space-y-3">
                    {mapLayerOptions.map(({ key, label, color, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => setActiveLayer(activeLayer === key ? null : key)}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-base font-bold transition-all ${
                          activeLayer === key ? 'text-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-500 dark:hover:text-slate-200'
                        }`}
                      >
                        {createElement(Icon, { className: `h-4 w-4 ${color}` })}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {scraperRefreshing && scraperProgress && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[501] min-w-80 max-w-xl rounded-xl border border-blue-500/30 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:bg-slate-900/95">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="font-semibold text-foreground">
                {scraperProgress.source_name || 'Preparing scraper'}
              </span>
              <span className="text-muted-foreground">
                Website {scraperProgress.source_index || 0}/{scraperProgress.sources_total || 0}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
              <span className="capitalize">{String(scraperProgress.phase || 'starting').replaceAll('_', ' ')}</span>
              {scraperProgress.phase === 'pages' && (
                <span>Page {scraperProgress.page || 0} / {scraperProgress.max_pages || '?'}</span>
              )}
              {['downloading_articles', 'processing_articles'].includes(scraperProgress.phase) && (
                <span>Article {scraperProgress.article || 0} / {scraperProgress.articles_total || 0}</span>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.max(3, ((scraperProgress.source_index || 0) / Math.max(scraperProgress.sources_total || 1, 1)) * 100)}%` }}
              />
            </div>
          </div>
        )}

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
                  ×
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
                    {hasValidLatLng(selectedInc)
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
                    ● {getIncidentStatusLabel(selectedInc.status).toUpperCase()}
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
          incidentPanelOpen ? 'w-[420px]' : 'w-10'
        }`}
      >
        <button
          onClick={() => setIncidentPanelOpen(!incidentPanelOpen)}
          className="w-full h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shrink-0"
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
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {sourceFilters.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveSource(key)}
                    className={`flex min-h-9 shrink-0 items-center justify-between gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${
                      activeSource === key
                        ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                        : 'border-border bg-background/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {createElement(Icon, { className: 'h-3 w-3 shrink-0' })}
                      <span className="truncate">{label}</span>
                    </span>
                    <span className="shrink-0">{sourceCounts[key] || 0}</span>
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
