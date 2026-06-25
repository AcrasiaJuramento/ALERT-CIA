import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MapPin, RefreshCw } from 'lucide-react';
import { LeafletIncidentMap } from '../../components/map/LeafletIncidentMap';
import { listIncidents, listPublicScrapedMapIncidents, supabase } from '../../services/supabase';
import { ADVISORY_EVENT, loadPublishedAdvisories } from '../../utils/advisoryStorage';
import { isIncidentCompleted } from '../../utils/incidentStatus';

export default function PublicMap() {
  const [incidents, setIncidents] = useState([]);
  const [advisories, setAdvisories] = useState(() => loadPublishedAdvisories());
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [selectedAdvisoryId, setSelectedAdvisoryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMap = async () => {
    setLoading(true);
    setError('');
    try {
      const [official, scraped] = await Promise.all([
        listIncidents({ publicOnly: true, limit: 300 }),
        listPublicScrapedMapIncidents({ limit: 100 }),
      ]);
      setIncidents([...official, ...scraped]);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load public map incidents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMap();
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel('public-map-records')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scraper_records' },
        () => loadMap(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => loadMap(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const refreshAdvisories = () => setAdvisories(loadPublishedAdvisories());
    window.addEventListener('storage', refreshAdvisories);
    window.addEventListener(ADVISORY_EVENT, refreshAdvisories);
    return () => {
      window.removeEventListener('storage', refreshAdvisories);
      window.removeEventListener(ADVISORY_EVENT, refreshAdvisories);
    };
  }, []);

  const selectedIncident = incidents.find(item => item.id === selectedIncidentId);
  const activeCount = useMemo(() => incidents.filter(item => !isIncidentCompleted(item.status)).length, [incidents]);

  return (
    <div className="min-h-screen bg-background p-4" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Public Safety Map</h1>
            <p className="text-sm text-muted-foreground">Approved public incident and advisory data for Echague, Isabela.</p>
          </div>
          <button
            onClick={loadMap}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <LeafletIncidentMap
              height="calc(100vh - 190px)"
              incidents={incidents}
              advisoryMarkers={advisories}
              selectedIncidentId={selectedIncidentId || undefined}
              selectedAdvisoryId={selectedAdvisoryId || undefined}
              onMarkerClick={(id) => {
                setSelectedIncidentId(id);
                setSelectedAdvisoryId(null);
              }}
              onAdvisoryClick={(id) => {
                setSelectedAdvisoryId(id);
                setSelectedIncidentId(null);
              }}
              showHeatmap={false}
              showDangerZones={false}
            />
          </div>

          <aside className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <h2 className="text-sm font-bold text-foreground">Public Incidents</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{activeCount} active, {incidents.length} total approved records</p>
            </div>

            {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading map records...</div>}
            {error && <div className="p-6 text-center text-sm text-red-500">{error}</div>}

            {!loading && !error && (
              <div className="max-h-[calc(100vh-290px)] overflow-y-auto">
                {incidents.map((incident) => (
                  <button
                    key={incident.id}
                    onClick={() => setSelectedIncidentId(incident.id)}
                    className={`w-full border-b border-border/60 p-4 text-left hover:bg-secondary/50 ${selectedIncidentId === incident.id ? 'bg-secondary' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-blue-500">{incident.id}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold capitalize text-muted-foreground">{incident.severity}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold capitalize text-foreground">{incident.type || incident.classification || 'Incident'}</p>
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {incident.location || incident.barangay || 'Location pending'}
                    </p>
                  </button>
                ))}
                {!incidents.length && <div className="p-6 text-center text-sm text-muted-foreground">No approved public incidents are available.</div>}
              </div>
            )}
          </aside>
        </div>

        {selectedIncident && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="font-mono text-xs text-blue-500">{selectedIncident.id}</div>
            <h2 className="mt-1 text-base font-bold text-foreground">{selectedIncident.title || `${selectedIncident.type || 'Incident'} report`}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{selectedIncident.description || 'No public description is available.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
