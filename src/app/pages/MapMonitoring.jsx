import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Layers, AlertTriangle, Flame, Droplets, Car, Heart, Shield,
  RefreshCw, ChevronRight, ChevronDown, Clock, Database, FileText, Radio,
  MapPin, X, ExternalLink, ChevronUp, Trash2
} from 'lucide-react';
import { LeafletIncidentMap } from '../components/map/LeafletIncidentMap';
import { listAdvisories, listIncidents, listOfficerScrapedMapIncidents, listPCRMapIncidents, promoteScraperRecordToIncident, rejectScraperRecord, supabase } from '../services/supabase';
import { cancelScraperJob, getScraperJobState, startScraperJob, subscribeScraperJob } from '../services/scraperJobService';
import { getIncidentStatusLabel, isIncidentCompleted } from '../utils/incidentStatus';
import { hasValidLatLng, isWithinEchagueMapArea, isWithinIsabelaMapArea } from '../utils/mapData';
import { formatDateAndTime } from '../utils/dateFormat';
import { ISABELA_MUNICIPALITIES } from '../data/isabelaMunicipalities';
import {
  calculateNewsCautionAreas,
  calculateOfficialAccidentProneAreas,
  riskStyles,
} from '../utils/accidentProneAreas';

function SafeIcon({ icon: Icon, fallback: Fallback = AlertTriangle, className = '' }) {
  const Component = Icon || Fallback;
  return <Component className={className} />;
}

const severityBadge = {
  black: 'bg-slate-950 text-slate-100 border border-slate-500/60',
  red: 'bg-red-600/20 text-red-400 border border-red-500/30',
  yellow: 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30',
  green: 'bg-green-600/20 text-green-400 border border-green-500/30',
  critical: 'bg-red-600/20 text-red-400 border border-red-500/30',
  warning: 'bg-red-600/20 text-red-400 border border-red-500/30',
  moderate: 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30',
  resolved: 'bg-green-600/20 text-green-400 border border-green-500/30',
};

const statusColors = {
  in_route: 'text-blue-400',
  on_scene: 'text-orange-400',
  transporting: 'text-purple-400',
  completed: 'text-green-400',
};

function severityKey(value = '') {
  return String(value || '').trim().toLowerCase();
}

function severityLabel(value = '') {
  const key = severityKey(value);
  if (key === 'black') return 'BLACK';
  if (key === 'red' || key === 'critical') return 'RED';
  if (key === 'yellow' || key === 'moderate') return 'YELLOW';
  if (key === 'warning') return 'RED';
  if (key === 'green' || key === 'low' || key === 'resolved') return 'GREEN';
  return String(value || 'YELLOW').toUpperCase();
}

function severityBorderClass(value = '') {
  const key = severityKey(value);
  if (key === 'black') return 'border-slate-500/70';
  if (key === 'red' || key === 'critical' || key === 'warning') return 'border-red-500/50';
  if (key === 'green' || key === 'low' || key === 'resolved') return 'border-green-500/50';
  return 'border-yellow-500/50';
}

function severityDotClass(value = '') {
  const key = severityKey(value);
  if (key === 'black') return { bg: 'bg-slate-950 ring-slate-500/30', text: 'text-slate-300' };
  if (key === 'red' || key === 'critical' || key === 'warning') return { bg: 'bg-red-500/20', text: 'text-red-400' };
  if (key === 'green' || key === 'low' || key === 'resolved') return { bg: 'bg-green-500/20', text: 'text-green-400' };
  return { bg: 'bg-yellow-500/20', text: 'text-yellow-400' };
}

const typeIcons = {
  vehicular: Car,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: AlertTriangle,
  other: AlertTriangle,
};

const sourceFilters = [
  { key: 'all', label: 'All', icon: Database },
  { key: 'official', label: 'Official', icon: Shield },
  { key: 'scraper', label: 'News Reports', icon: Radio },
];

const accuracyLegend = [
  { label: 'Black - Very Critical / Fatal', color: '#111827', icon: AlertTriangle },
  { label: 'Red - Critical', color: '#dc2626', icon: Shield },
  { label: 'Yellow - Moderate', color: '#eab308', icon: Car },
  { label: 'Green - Non-critical', color: '#16a34a', icon: Heart },
  { label: 'Verified / Exact Location', color: '#2563eb', icon: Shield },
  { label: 'Landmark Matched', color: '#2563eb', icon: MapPin },
  { label: 'Road-level (Medium)', color: '#f97316', icon: Car },
  { label: 'Barangay-level (Low)', color: '#eab308', icon: MapPin },
  { label: 'Unmapped / Review', color: '#64748b', icon: AlertTriangle },
];

function getSourceGroup(incident) {
  if (String(incident.sourceKind || '').includes('scraped')) return 'scraper';
  return 'official';
}

const settledValue = (result, fallback) => (result.status === 'fulfilled' ? result.value : fallback);

function failedLayerMessage(results = []) {
  const failed = results.filter(([, result]) => result.status === 'rejected').map(([label]) => label);
  if (!failed.length) return '';
  if (failed.length === results.length) return 'Unable to load map records. Check Supabase/network connection and retry.';
  return `${failed.join(', ')} unavailable. Showing remaining map records.`;
}

const DEFAULT_RISK_FILTERS = {
  startDate: '',
  endDate: '',
  incidentType: 'all',
  severity: 'all',
  municipality: 'all',
  barangay: 'all',
  sourceType: 'all',
  timeOfDay: 'all',
};

function getRecordMunicipality(record = {}) {
  return record.municipality || record.verifiedMunicipality || record.extractedMunicipality || (isWithinEchagueMapArea(record) ? 'Echague' : '');
}

function isPromotableScrapedRecord(record = {}) {
  return getSourceGroup(record) === 'scraper' && record.recordId && (!record.relatedIncidentId || record.sourceKind !== 'promoted_scraped');
}

function isRemovableScrapedMapRecord(record = {}) {
  return getSourceGroup(record) === 'scraper' && record.recordId && record.sourceKind !== 'promoted_scraped';
}

function isRelocatableScrapedMapRecord(record = {}) {
  return getSourceGroup(record) === 'scraper' && record.recordId;
}

function riskBadgeClass(level = '') {
  if (level === 'Critical') return 'bg-red-600 text-white';
  if (level === 'High') return 'bg-red-500 text-white';
  if (level === 'Moderate') return 'bg-amber-500 text-slate-950';
  return 'bg-green-500 text-white';
}

function mapRecordRank(record = {}) {
  if (record.sourceKind === 'pcr_report') return 2;
  const group = getSourceGroup(record);
  if (group === 'official') return 3;
  if (record.sourceKind === 'promoted_scraped') return 1;
  return 0;
}

function mapRecordKey(record = {}) {
  if (record.relatedIncidentId) return `incident:${record.relatedIncidentId}`;
  if (record.sourceKind === 'official' && record.id) return `incident:${record.id}`;
  if (record.responseId) return `response:${record.responseId}`;
  if (record.scraperRecordId || record.recordId) return `record:${record.scraperRecordId || record.recordId}`;
  return `id:${record.id}`;
}

function dedupeMapRecords(records = []) {
  const byKey = new Map();
  records.forEach(record => {
    const key = mapRecordKey(record);
    const current = byKey.get(key);
    if (!current || mapRecordRank(record) > mapRecordRank(current)) {
      byKey.set(key, record);
    }
  });
  return [...byKey.values()];
}

export default function MapMonitoring() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedRecordId = searchParams.get('record');

  const [selectedIncident, setSelectedIncident] = useState(null);
  const [activeSource, setActiveSource] = useState('all');
  const [mapScope, setMapScope] = useState('isabela');
  const [selectedMunicipality, setSelectedMunicipality] = useState('all');
  const [intelTab, setIntelTab] = useState('incidents');
  const [incidentPanelOpen, setIncidentPanelOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const [scrapeMenuOpen, setScrapeMenuOpen] = useState(false);
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [selectedAccidentProneAreaId, setSelectedAccidentProneAreaId] = useState(null);
  const [mobileRiskNavOpen, setMobileRiskNavOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState({
    incidents: true,
    verifiedMdrrmo: true,
    verifiedScraped: true,
    unverifiedScraped: false,
    advisories: false,
    accidentProneAreas: true,
    cautionAreas: true,
    criticalZones: true,
    heatmap: true,
    barangayBoundaries: true,
  });
  const [incidents, setIncidents] = useState([]);
  const [pcrIncidents, setPcrIncidents] = useState([]);
  const [scrapedIncidents, setScrapedIncidents] = useState([]);
  const [advisories, setAdvisories] = useState([]);
  const [mapError, setMapError] = useState('');
  const [scraperJob, setScraperJob] = useState(getScraperJobState());
  const [linkingRecordId, setLinkingRecordId] = useState(null);
  const [removingRecordId, setRemovingRecordId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const scraperRefreshing = scraperJob.running;
  const scraperMode = scraperJob.mode;
  const scraperProgress = scraperJob.progress;
  const scraperError = scraperJob.error;
  const scraperMessage = scraperJob.message;

  useEffect(() => {
    let mounted = true;

    async function loadMapData() {
      setLoading(true);
      try {
        const [officialResult, scrapedResult, pcrResult, advisoryResult] = await Promise.allSettled([
          listIncidents({ limit: 500 }),
          listOfficerScrapedMapIncidents({ includeUnverified: true }),
          listPCRMapIncidents({ limit: 200 }),
          listAdvisories({ activeOnly: true, limit: 100 }),
        ]);
        if (mounted) {
          const officialRecords = settledValue(officialResult, []);
          const scrapedRecords = settledValue(scrapedResult, []);
          const pcrRecords = settledValue(pcrResult, []);
          const advisoryRecords = settledValue(advisoryResult, []);
          setIncidents(officialRecords);
          setScrapedIncidents(scrapedRecords);
          setPcrIncidents(pcrRecords);
          setAdvisories(advisoryRecords);
          setMapError(failedLayerMessage([
            ['Official incidents', officialResult],
            ['News reports', scrapedResult],
            ['PCR records', pcrResult],
            ['Advisories', advisoryResult],
          ]));
        }
      } catch (error) {
        if (mounted) setMapError(error.message || 'Unable to load map records.');
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'responses' },
        () => setReloadKey(key => key + 1),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'public_advisories' },
        () => setReloadKey(key => key + 1),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    return subscribeScraperJob(setScraperJob);
  }, []);

  useEffect(() => {
    if (mapScope !== 'isabela') setSelectedMunicipality('all');
  }, [mapScope]);

  const refreshScraperData = async (mode = 'update') => {
    setScrapeMenuOpen(false);
    try {
      await startScraperJob(mode, mode === 'update' ? { pageFrom: 1, pageTo: 1 } : {});
      setReloadKey(key => key + 1);
    } catch {
      // The shared scraper job service owns the visible error state.
    }
  };

  const openOrCreateLinkedRecord = async (record) => {
    if (!record) return;
    if (record.sourceKind === 'pcr_report' && record.recordId) {
      navigate(`/admin/pcr/new?edit=${record.recordId}`);
      return;
    }
    if (!record.sourceKind || record.sourceKind === 'official' || record.sourceKind === 'promoted_scraped') {
      navigate(`/admin/incidents/${record.relatedIncidentId || record.id}`);
      return;
    }
    if (!isPromotableScrapedRecord(record)) return;

    setMapError('');
    setLinkingRecordId(record.recordId);
    try {
      const incidentId = await promoteScraperRecordToIncident(record.recordId);
      setReloadKey(key => key + 1);
      navigate(`/admin/incidents/${incidentId}`);
    } catch (error) {
      setMapError(error.message || 'Unable to create a linked incident record from this news article.');
    } finally {
      setLinkingRecordId(null);
    }
  };

  const removeScrapedMapPin = async (record) => {
    if (!isRemovableScrapedMapRecord(record)) return;
    const confirmed = window.confirm('Remove this scraped news pin from the map and mark it as not accident related?');
    if (!confirmed) return;

    setMapError('');
    setRemovingRecordId(record.recordId);
    try {
      await rejectScraperRecord(record.recordId, 'Removed from admin map: not accident related.');
      setScrapedIncidents(current => current.filter(item => item.recordId !== record.recordId));
      setSelectedIncident(null);
    } catch (error) {
      setMapError(error.message || 'Unable to remove this scraped map pin.');
    } finally {
      setRemovingRecordId(null);
    }
  };

  const openScrapedLocationReview = (record) => {
    if (!isRelocatableScrapedMapRecord(record)) return;
    navigate(`/admin/scraper-review?record=${encodeURIComponent(record.recordId)}&correct=1`);
  };

  const riskFilters = useMemo(() => ({
    ...DEFAULT_RISK_FILTERS,
    municipality: mapScope === 'isabela' ? selectedMunicipality : 'all',
  }), [mapScope, selectedMunicipality]);

  const allMapRecords = useMemo(
    () => dedupeMapRecords([...incidents, ...pcrIncidents, ...scrapedIncidents]),
    [incidents, pcrIncidents, scrapedIncidents]
  );

  const mapIncidents = useMemo(
    () => allMapRecords
      .filter(hasValidLatLng)
      .filter(item => {
        if (mapScope === 'echague') return isWithinEchagueMapArea(item);
        return isWithinIsabelaMapArea(item);
      })
      .filter(item => mapScope !== 'isabela' || selectedMunicipality === 'all' || getRecordMunicipality(item) === selectedMunicipality)
      .filter(item => activeSource === 'all' || getSourceGroup(item) === activeSource)
      .filter(item => {
        const group = getSourceGroup(item);
        if (group === 'scraper') return item.sourceKind === 'scraped' ? mapLayers.unverifiedScraped : mapLayers.verifiedScraped;
        if (group === 'official') return mapLayers.verifiedMdrrmo;
        return true;
      }),
    [activeSource, allMapRecords, mapLayers.unverifiedScraped, mapLayers.verifiedMdrrmo, mapLayers.verifiedScraped, mapScope, selectedMunicipality]
  );
  const riskSourceRecords = useMemo(
    () => allMapRecords
      .filter(hasValidLatLng)
      .filter(item => {
        if (mapScope === 'echague') return isWithinEchagueMapArea(item);
        return isWithinIsabelaMapArea(item);
      })
      .filter(item => mapScope !== 'isabela' || selectedMunicipality === 'all' || getRecordMunicipality(item) === selectedMunicipality)
      .filter(item => getSourceGroup(item) !== 'scraper' || item.sourceKind !== 'scraped'),
    [allMapRecords, mapScope, selectedMunicipality]
  );
  const officialComputedAreas = useMemo(
    () => calculateOfficialAccidentProneAreas(riskSourceRecords, {
      publicOnly: false,
      filters: riskFilters,
      groupBy: 'barangay',
    }),
    [riskFilters, riskSourceRecords]
  );
  const accidentProneAreas = useMemo(
    () => officialComputedAreas.filter(area => ['High', 'Critical'].includes(area.risk_level)),
    [officialComputedAreas]
  );
  const cautionAreas = useMemo(
    () => calculateNewsCautionAreas(riskSourceRecords, {
      publicOnly: false,
      filters: riskFilters,
      groupBy: 'barangay',
    }),
    [riskFilters, riskSourceRecords]
  );
  const topAccidentProneAreas = accidentProneAreas.slice(0, 5);
  const selectedAccidentProneArea = [...accidentProneAreas, ...cautionAreas].find(area => area.area_id === selectedAccidentProneAreaId);
  const focusedRiskArea = useMemo(() => selectedAccidentProneArea ? ({
    latLng: [Number(selectedAccidentProneArea.latitude), Number(selectedAccidentProneArea.longitude)],
  }) : null, [selectedAccidentProneArea]);
  const highRiskAreas = accidentProneAreas;
  const highCautionAreas = cautionAreas.filter(area => ['High', 'Critical'].includes(area.risk_level));
  const activeIncidents = mapIncidents.filter(i => !isIncidentCompleted(i.status));
  const selectedInc = mapIncidents.find(i => i.id === selectedIncident);
  const recentIncidents = useMemo(
    () => [...mapIncidents]
      .sort((left, right) => new Date(`${right.date || ''}T${right.time || '00:00'}`) - new Date(`${left.date || ''}T${left.time || '00:00'}`))
      .slice(0, 8),
    [mapIncidents]
  );
  useEffect(() => {
    if (!requestedRecordId) return;
    const requestedRecord = allMapRecords.find(item => String(item.id) === requestedRecordId || String(item.recordId) === requestedRecordId);
    if (!requestedRecord) return;
    if (getSourceGroup(requestedRecord) === 'scraper' && requestedRecord.sourceKind === 'scraped' && !mapLayers.unverifiedScraped) {
      setMapLayers(current => ({ ...current, incidents: true, unverifiedScraped: true }));
    }
    if (requestedRecord.id !== selectedIncident) setSelectedIncident(requestedRecord.id);
  }, [allMapRecords, mapLayers.unverifiedScraped, requestedRecordId, selectedIncident]);
  const sourceCounts = {
    all: allMapRecords.length,
    official: allMapRecords.filter(record => getSourceGroup(record) === 'official').length,
    scraper: allMapRecords.filter(record => getSourceGroup(record) === 'scraper').length,
  };
  const municipalityOptions = useMemo(() => {
    const seen = new Set(ISABELA_MUNICIPALITIES);
    allMapRecords.forEach(record => {
      const municipality = getRecordMunicipality(record);
      if (municipality) seen.add(municipality);
    });
    return ['all', ...[...seen].sort((left, right) => left.localeCompare(right))];
  }, [allMapRecords]);
  const layerOptions = [
    { key: 'incidents', label: 'Incident Markers' },
    { key: 'accidentProneAreas', label: 'Accident-Prone Areas' },
    { key: 'cautionAreas', label: 'News Caution Areas' },
    { key: 'criticalZones', label: 'Critical Zones' },
    { key: 'verifiedScraped', label: 'News Reports' },
    { key: 'unverifiedScraped', label: 'Unverified News Reports' },
    { key: 'verifiedMdrrmo', label: 'Official Reports' },
    { key: 'advisories', label: 'Public Advisories' },
    { key: 'barangayBoundaries', label: 'Barangay Boundaries' },
  ];
  return (
    <div className="relative flex overflow-hidden bg-[#03111f] text-slate-100" style={{ height: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      {/* Full-screen Map */}
      <div className="relative flex-1 overflow-hidden p-0.5">
        <LeafletIncidentMap
          height="100%"
          incidents={mapIncidents}
          advisoryMarkers={advisories}
          accidentProneAreas={accidentProneAreas}
          cautionAreas={cautionAreas}
          showControls={true}
          showHeatmap={true}
          showDangerZones={false}
          externalLayers={mapLayers}
          onExternalLayersChange={setMapLayers}
          hideLayerControl
          onMarkerClick={(id) => setSelectedIncident(id)}
          selectedIncidentId={selectedIncident || undefined}
          clusterMarkers={false}
          spreadOverlappingMarkers
          scope={mapScope}
          fitScopeView={mapScope === 'echague'}
          focusedLocation={focusedRiskArea}
          selectedAccidentProneAreaId={selectedAccidentProneAreaId}
          onAccidentProneAreaClick={(area) => setSelectedAccidentProneAreaId(area.area_id)}
        />

        <div className="absolute left-4 right-4 top-4 z-[500] flex flex-wrap items-start justify-between gap-3 pointer-events-none">
          <div className="pointer-events-auto flex flex-wrap gap-2">
            <div className="flex h-10 overflow-hidden rounded-lg border border-slate-800 bg-white/95 text-xs font-bold text-slate-700 shadow-xl">
              <button
                onClick={() => {
                  setMapScope('echague');
                  setSelectedMunicipality('all');
                  setSelectedIncident(null);
                  setSelectedAccidentProneAreaId(null);
                }}
                className={`flex items-center gap-2 px-4 transition-colors ${mapScope === 'echague' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}`}
              >
                <MapPin className="h-3.5 w-3.5" />
                Echague Reports
              </button>
              <button
                onClick={() => setMapScope('isabela')}
                className={`border-l border-slate-200 px-4 transition-colors ${mapScope === 'isabela' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'}`}
              >
                Isabela News
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setLayerMenuOpen(current => !current);
                  setScrapeMenuOpen(false);
                }}
                aria-expanded={layerMenuOpen}
                className="flex h-10 items-center gap-2.5 rounded-lg border border-slate-800 bg-white/95 px-4 text-xs font-bold text-slate-800 shadow-xl hover:bg-slate-100"
              >
                <Layers className="h-4 w-4 text-slate-700" />
                Layers
                <ChevronDown className={`h-4 w-4 transition-transform ${layerMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {layerMenuOpen && (
                <div className="absolute left-0 top-12 w-64 rounded-xl border border-slate-800 bg-[#071726]/95 p-4 text-slate-100 shadow-2xl">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    <Layers className="h-3.5 w-3.5 text-blue-400" />
                    Layers
                  </div>
                  <fieldset className="mb-4 border-b border-slate-800 pb-4">
                    <legend className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Map View</legend>
                    <div className="space-y-1">
                      {[
                        [false, 'Standard'],
                        [true, 'Heat Map'],
                      ].map(([checked, label]) => (
                        <label key={label} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white">
                          <input
                            type="radio"
                            name="map-view"
                            checked={Boolean(mapLayers.heatmap) === checked}
                            onChange={() => setMapLayers(current => ({ ...current, heatmap: checked }))}
                            className="h-4 w-4 accent-blue-500"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Show on Map</div>
                  <div className="space-y-1">
                    {layerOptions.map(({ key, label }) => (
                      <label key={key} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white">
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
                }}
                className="flex h-10 items-center gap-2.5 rounded-lg border border-blue-500/50 bg-white/95 px-3 text-xs font-bold text-slate-800 shadow-xl hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-75"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="pointer-events-auto flex items-start gap-3">
            <div className="relative">
              <button
                onClick={() => {
                  setScrapeMenuOpen(current => !current);
                  setLayerMenuOpen(false);
                }}
                disabled={scraperRefreshing}
                aria-expanded={scrapeMenuOpen}
                className="flex h-10 items-center gap-2.5 rounded-lg border border-slate-800 bg-[#071726]/95 px-4 text-xs font-bold text-slate-100 shadow-xl hover:bg-[#0b2136] disabled:cursor-not-allowed disabled:opacity-75"
                title="News source actions"
              >
                <Database className={`h-4 w-4 text-purple-300 ${scraperRefreshing ? 'animate-pulse' : ''}`} />
                {scraperMode === 'update' ? 'Checking...' : scraperMode === 'full' ? 'Full check...' : 'News Sources'}
                <ChevronDown className={`h-4 w-4 transition-transform ${scrapeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {scrapeMenuOpen && (
                <div className="absolute right-0 top-14 w-64 rounded-xl bg-white/95 p-3 text-slate-900 shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-900/95 dark:text-slate-100 dark:ring-white/10">
                  <div className="mb-1.5 flex items-center gap-2 px-2 py-1.5 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    <Database className="h-3.5 w-3.5 text-purple-300" />
                    News Sources
                  </div>
                  <button
                    onClick={() => refreshScraperData('update')}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left text-base font-bold text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-slate-800 dark:hover:text-blue-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>
                      Check latest articles
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-500 dark:text-slate-500">Latest page from each news site</span>
                    </span>
                  </button>
                  <button
                    onClick={() => refreshScraperData('full')}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left text-base font-bold text-purple-600 hover:bg-purple-50 hover:text-purple-700 dark:text-purple-300 dark:hover:bg-slate-800 dark:hover:text-purple-200"
                  >
                    <Database className="h-4 w-4" />
                    <span>
                      Full source check
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-500 dark:text-slate-500">Check configured historical page batches</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pointer-events-auto absolute left-4 top-36 z-[500] hidden w-72 overflow-hidden rounded-xl border border-slate-800 bg-[#071726]/70 text-slate-100 shadow-2xl lg:block xl:top-20">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2.5">
            <div>
              <div className="text-xs font-bold">Accident-Prone Areas</div>
              <div className="text-[10px] text-slate-500">Top 5 by recommended risk</div>
            </div>
            <AlertTriangle className="h-4 w-4 text-orange-400" />
          </div>
          <div className="p-1.5">
            {topAccidentProneAreas.map((area, index) => (
              <button
                key={area.area_id}
                onClick={() => {
                  setSelectedAccidentProneAreaId(area.area_id);
                  setMapLayers(current => ({ ...current, accidentProneAreas: true, criticalZones: true }));
                }}
                className={`flex min-h-12 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${selectedAccidentProneAreaId === area.area_id ? 'bg-blue-600/20 ring-1 ring-blue-500/40' : 'hover:bg-slate-800'}`}
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-800 text-[10px] font-bold text-slate-300">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold text-slate-100">{area.barangay}</span>
                  <span className="block text-[10px] text-slate-400">{area.unique_incident_count ?? area.total_incidents ?? area.records?.length ?? 0} accidents / danger score {area.severity_burden ?? 0}</span>
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${riskBadgeClass(area.risk_level)}`}>{area.risk_level}</span>
              </button>
            ))}
            {!topAccidentProneAreas.length && <div className="px-2 py-4 text-center text-[11px] text-slate-500">No official high or critical accident-prone areas available.</div>}
          </div>
          <button
            onClick={() => { setIntelTab('risk'); setIncidentPanelOpen(true); }}
            className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-slate-800 text-[11px] font-bold text-blue-300 hover:bg-slate-800 hover:text-blue-200"
          >
            View All Areas <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className={`absolute bottom-16 left-3 z-[700] lg:hidden ${legendOpen ? 'hidden' : ''}`}>
          <button
            onClick={() => {
              setMobileRiskNavOpen(current => !current);
              setLegendOpen(false);
            }}
            aria-expanded={mobileRiskNavOpen}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-orange-500/30 bg-[#071726]/95 px-3 text-xs font-bold text-slate-100 shadow-xl backdrop-blur"
          >
            <AlertTriangle className="h-4 w-4 text-orange-400" />
            Risk Areas
            {mobileRiskNavOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          {mobileRiskNavOpen && (
            <div className="absolute bottom-14 left-0 max-h-[55vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-slate-800 bg-[#071726]/98 p-2 text-slate-100 shadow-2xl">
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <div className="text-xs font-bold">Top 5 Accident-Prone Areas</div>
                <button onClick={() => setMobileRiskNavOpen(false)} aria-label="Close accident-prone areas" className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              {topAccidentProneAreas.map((area, index) => (
                <button
                  key={area.area_id}
                  onClick={() => {
                    setSelectedAccidentProneAreaId(area.area_id);
                    setMapLayers(current => ({ ...current, accidentProneAreas: true, criticalZones: true }));
                    setMobileRiskNavOpen(false);
                  }}
                  className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-800 text-[10px] font-bold">{index + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold">{area.barangay}</span><span className="text-[10px] text-slate-500">{area.unique_incident_count ?? area.total_incidents ?? 0} accidents / danger score {area.severity_burden ?? 0}</span></span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${riskBadgeClass(area.risk_level)}`}>{area.risk_level}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {scraperRefreshing && scraperProgress && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[501] min-w-80 max-w-xl rounded-xl border border-blue-500/30 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:bg-slate-900/95">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="font-semibold text-foreground">
                {scraperProgress.source_name || 'Preparing news source check'}
              </span>
              <span className="text-muted-foreground">
                Website {scraperProgress.source_index || 0}/{scraperProgress.sources_total || 0}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-4 text-[11px] text-muted-foreground">
              <span className="capitalize">{String(scraperProgress.phase || 'starting').replaceAll('_', ' ')}</span>
              {scraperProgress.phase === 'pages' && Number(scraperProgress.page) > 0 && (
                <span>Page {scraperProgress.page} / {scraperProgress.max_pages || '?'}</span>
              )}
              {scraperProgress.phase === 'source_running' && (
                <span>
                  Pages {scraperProgress.page || 1}-{scraperProgress.page_to || scraperProgress.page || '?'} / {scraperProgress.max_pages || '?'}
                </span>
              )}
              {['downloading_articles', 'processing_articles'].includes(scraperProgress.phase) && (
                <span>Article {scraperProgress.article || 0} / {scraperProgress.articles_total || 0}</span>
              )}
            </div>
            {scraperProgress.phase === 'source_running' && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                A full source check reviews one website in small page batches.
              </p>
            )}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.max(3, ((scraperProgress.source_index || 0) / Math.max(scraperProgress.sources_total || 1, 1)) * 100)}%` }}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={cancelScraperJob}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-500 hover:bg-red-500/20"
              >
                Cancel check
              </button>
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-44 z-[700]">
          {legendOpen && (
            <div
              id="map-legend-panel"
              className="absolute bottom-12 left-[calc(-11rem+0.75rem)] w-[min(14rem,calc(100vw-1.5rem))] rounded-xl border border-slate-800/80 bg-[#071726]/70 p-3 text-xs text-slate-200 shadow-2xl backdrop-blur sm:left-0"
            >
              <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Map Legend</div>
              <div className="space-y-1.5">
                {accuracyLegend.map(({ label, color, icon }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: color }}>
                      <SafeIcon icon={icon} className="h-2.5 w-2.5" />
                    </span>
                    <span className="text-[11px] text-slate-300">{label}</span>
                  </div>
                ))}
              </div>
              <div className="my-2.5 h-px bg-slate-800" />
              <div className="space-y-1.5">
                {Object.entries(riskStyles)
                  .filter(([level]) => ['High', 'Critical'].includes(level))
                  .map(([level, style]) => (
                    <div key={level} className="flex items-center gap-2">
                      <span className="h-4 w-4 shrink-0 rounded-full border-2 bg-transparent" style={{ borderColor: style.color }} />
                      <span className="text-[11px] text-slate-300">Accident-Prone ({level})</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setLegendOpen(current => !current);
              setMobileRiskNavOpen(false);
            }}
            aria-expanded={legendOpen}
            aria-controls="map-legend-panel"
            className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold text-slate-100 shadow-xl backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              legendOpen
                ? 'border-blue-500/40 bg-[#0b2136]/95'
                : 'border-slate-800 bg-[#071726]/95 hover:bg-[#0b2136]'
            }`}
          >
            Map Legend
            {legendOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
          </button>
        </div>

        {/* Selected Incident Popup */}
        {selectedInc && (
          <div className="absolute bottom-20 left-1/2 z-[1001] w-[min(420px,calc(100vw-1.5rem))] -translate-x-1/2">
            <div className={`rounded-xl border bg-[#071726]/96 p-4 text-slate-100 shadow-2xl backdrop-blur ${severityBorderClass(selectedInc.severity)}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-blue-400 text-sm font-bold">{selectedInc.id}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${severityBadge[severityKey(selectedInc.severity)] || severityBadge.yellow}`}>
                      {severityLabel(selectedInc.severity)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{selectedInc.location}</p>
                  {selectedInc.sourceKind && (
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                      {getSourceGroup(selectedInc) === 'scraper' ? 'External Isabela news' : selectedInc.sourceKind.replaceAll('_', ' ')} / {selectedInc.sourceLabel}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedIncident(null)}
                  aria-label="Close incident details"
                  className="grid h-8 w-8 place-items-center rounded-md text-[0px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  ×
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{selectedInc.description}</p>
              <div className="mb-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div className="rounded-lg bg-secondary/60 p-2">
                  <span className="block uppercase tracking-wide">Barangay</span>
                  <span className="text-foreground">{selectedInc.barangay || selectedInc.location || 'Unspecified'}</span>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2">
                  <span className="block uppercase tracking-wide">Municipality</span>
                  <span className="text-foreground">{getRecordMunicipality(selectedInc) || 'Unspecified'}</span>
                </div>
                <div className="rounded-lg bg-secondary/60 p-2">
                  <span className="block uppercase tracking-wide">Date / Time</span>
                  <span className="text-foreground">{formatDateAndTime(selectedInc.date, selectedInc.time)}</span>
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
              {selectedInc.externalSourceUrl && (
                <a
                  href={selectedInc.externalSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-3 block truncate text-[10px] font-semibold text-blue-400 hover:text-blue-300"
                >
                  Source article: {selectedInc.externalSourceUrl}
                </a>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold ${statusColors[selectedInc.status]}`}>
                    ● {getIncidentStatusLabel(selectedInc.status).toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">{selectedInc.assignedTeam}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isRelocatableScrapedMapRecord(selectedInc) && (
                    <button
                      type="button"
                      onClick={() => openScrapedLocationReview(selectedInc)}
                      className="flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 transition-all hover:bg-blue-500/20"
                      title="Re-map this scraped news location"
                    >
                      <MapPin className="h-3 w-3" />
                      Re-map
                    </button>
                  )}
                  {isRemovableScrapedMapRecord(selectedInc) && (
                    <button
                      type="button"
                      onClick={() => removeScrapedMapPin(selectedInc)}
                      disabled={removingRecordId === selectedInc.recordId}
                      className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Remove scraped news pin"
                    >
                      <Trash2 className="h-3 w-3" />
                      {removingRecordId === selectedInc.recordId ? 'Removing...' : 'Remove pin'}
                    </button>
                  )}
                  <button
                    onClick={() => openOrCreateLinkedRecord(selectedInc)}
                    disabled={linkingRecordId === selectedInc.recordId}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all"
                  >
                    {linkingRecordId === selectedInc.recordId ? 'Creating...' : isPromotableScrapedRecord(selectedInc) ? 'Create linked record' : 'Details'} <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Incidents Panel */}
      <div
        className={`absolute inset-y-0 right-0 z-[900] min-h-0 shrink-0 overflow-hidden border-l border-slate-800 bg-[#071726] text-slate-100 shadow-2xl transition-all duration-300 lg:relative lg:z-auto ${
          incidentPanelOpen ? 'w-[min(420px,calc(100vw-2rem))] lg:w-[420px]' : 'w-10'
        }`}
      >
        <button
          onClick={() => setIncidentPanelOpen(!incidentPanelOpen)}
          className="flex h-10 w-full shrink-0 items-center justify-center text-slate-500 transition-all hover:bg-slate-800 hover:text-slate-100"
        >
          {incidentPanelOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />}
        </button>

        {incidentPanelOpen && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.12)]" />
                <span className="text-sm font-bold uppercase tracking-wide text-slate-100">{mapScope === 'isabela' ? 'Isabela Accident Intelligence' : 'Operational Records'}</span>
              </div>
              <p className="text-[10px] text-slate-400">{activeIncidents.length} active / {mapIncidents.length} mapped records</p>
              {mapScope === 'isabela' && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Location Filter</span>
                  <select
                    value={selectedMunicipality}
                    onChange={(event) => setSelectedMunicipality(event.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-700 bg-[#0b1d31] px-3 text-xs font-semibold text-slate-100 outline-none focus:border-blue-500"
                  >
                    {municipalityOptions.map(value => (
                      <option key={value} value={value}>{value === 'all' ? 'All Isabela municipalities' : value}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Sources</div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {sourceFilters.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveSource(key)}
                    className={`flex min-h-8 shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-1 text-[11px] font-bold transition-all ${
                      activeSource === key
                        ? 'border-blue-500/50 bg-blue-600 text-white'
                        : 'border-slate-700 bg-[#0b1d31] text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <SafeIcon icon={Icon} fallback={Database} className="h-3 w-3 shrink-0" />
                      <span className="truncate">{label}</span>
                    </span>
                    <span className="shrink-0">{sourceCounts[key] || 0}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-[#0b1d31] p-1">
                {[
                  ['incidents', 'Incidents'],
                  ['risk', 'Risk Areas'],
                  ['intelligence', 'Intelligence'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setIntelTab(key)}
                    className={`rounded-md px-2 py-2 text-[11px] font-bold transition ${
                      intelTab === key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {loading && <p className="mt-1 text-[10px] text-slate-400">Loading map records...</p>}
              {scraperMessage && <p className="mt-1 text-[10px] text-green-400">{scraperMessage}</p>}
              {(mapError || scraperError) && <p className="mt-1 text-[10px] text-orange-400">{scraperError || mapError}</p>}
            </div>

            {intelTab === 'risk' && <div className="min-h-0 flex-1 overflow-y-auto border-b border-slate-800 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Accident-Prone Areas</div>
                  <div className="text-[10px] text-slate-500">{highRiskAreas.length} official high or critical / {highCautionAreas.length} news caution</div>
                </div>
              </div>
              <div className="space-y-2">
                {[...accidentProneAreas, ...cautionAreas].slice(0, 8).map(area => (
                  <div key={area.area_id} className="rounded-lg border border-slate-800 bg-[#0b1d31] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-slate-100">{area.barangay}</div>
                        <div className="mt-1 text-[10px] text-slate-500">{area.zone_label || 'Accident-Prone Area'} / peak {area.peak_time}</div>
                      </div>
                      <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${riskBadgeClass(area.risk_level)}`}>
                        {area.risk_level}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                      <span>Danger <strong className="text-slate-100">{area.severity_burden ?? 0}</strong></span>
                      <span>Accidents <strong className="text-slate-100">{area.unique_incident_count ?? area.total_incidents}</strong></span>
                      <span>Confidence <strong className="text-slate-100">{area.evidence_confidence || 'Low'}</strong></span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                      <span>Legacy <strong className="text-slate-100">{area.legacy_total_risk_score ?? area.total_risk_score}</strong></span>
                      <span>MDRRMO <strong className="text-slate-100">{area.mdrrmo_incident_count}</strong></span>
                      <span>Web <strong className="text-slate-100">{area.web_scraped_verified_count}</strong></span>
                    </div>
                    <div className="mt-2 max-h-20 overflow-y-auto border-t border-slate-800 pt-2">
                      {area.records.slice(0, 4).map(record => (
                        <button
                          key={record.id || record.recordId}
                          onClick={() => openOrCreateLinkedRecord(record)}
                          className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-blue-400 hover:bg-secondary/60"
                        >
                          {record.title || record.description || record.id}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!accidentProneAreas.length && !cautionAreas.length && <div className="rounded-lg border border-slate-800 bg-[#0b1d31] p-3 text-xs text-slate-400">No official accident-prone or news caution areas match the filters.</div>}
              </div>
            </div>}

            {intelTab === 'incidents' && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Recent Incidents</div>
                <button className="text-[10px] font-bold text-blue-300 hover:text-blue-200">View all</button>
              </div>
              {recentIncidents.map((inc) => {
                const TypeIcon = typeIcons[inc.type] || AlertTriangle;
                const tone = severityDotClass(inc.severity);
                return (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedIncident(inc.id === selectedIncident ? null : inc.id)}
                    className={`w-full border-b border-slate-800 px-4 py-3 text-left transition-all hover:bg-slate-800/60 ${
                      selectedIncident === inc.id ? 'border-l-2 border-l-blue-500 bg-blue-500/10' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${tone.bg}`}>
                        <TypeIcon className={`w-3 h-3 ${tone.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[10px] font-mono text-blue-400">{inc.id}</span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${severityBadge[severityKey(inc.severity)] || severityBadge.yellow}`}>
                            {severityLabel(inc.severity)}
                          </span>
                        </div>
                        <p className="truncate text-xs font-bold text-slate-100">{inc.title || `${inc.type} incident`}</p>
                        <p className="truncate text-[10px] text-slate-400">{inc.location}</p>
                        {inc.sourceKind && (
                          <p className="truncate text-[9px] font-bold uppercase tracking-wide text-blue-400">
                          {inc.sourceKind.replaceAll('_', ' ')}
                          {getSourceGroup(inc) === 'scraper' && mapScope === 'isabela' ? ' / Isabela intelligence' : ''}
                        </p>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className="h-2.5 w-2.5 text-slate-500" />
                          <span className="text-[9px] text-slate-500">{formatDateAndTime(inc.date, inc.time)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Shield className="h-2.5 w-2.5 text-slate-500" />
                          <span className="text-[9px] text-slate-500">{inc.assignedTeam}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!loading && !activeIncidents.length && (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  No mapped records are available for the selected scope.
                </div>
              )}
            </div>}

            {intelTab === 'intelligence' && <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-[#0b1d31] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Mapped Records</div>
                  <div className="mt-2 text-2xl font-bold text-white">{mapIncidents.length}</div>
                  <div className="text-[10px] text-slate-500">{activeIncidents.length} active responses</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#0b1d31] p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Risk Areas</div>
                  <div className="mt-2 text-2xl font-bold text-white">{accidentProneAreas.length}</div>
                  <div className="text-[10px] text-slate-500">{highRiskAreas.length} official high/critical / {cautionAreas.length} news caution</div>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-slate-800 bg-[#0b1d31] p-3">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Source Breakdown</div>
                {sourceFilters.map(({ key, label }) => (
                  <div key={key} className="mb-2 last:mb-0">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{label}</span>
                      <span>{sourceCounts[key] || 0}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min(100, ((sourceCounts[key] || 0) / Math.max(sourceCounts.all || 1, 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-100">
                Low-confidence barangay-only news and PCR centroid records are not used as exact hotspot points. They still support barangay-level intelligence.
              </div>
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}
