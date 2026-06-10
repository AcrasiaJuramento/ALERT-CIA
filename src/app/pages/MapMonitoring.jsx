import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers, AlertTriangle, Flame, Droplets, Car, Heart, Shield,
  RefreshCw, ChevronRight, MapPin, Zap
} from 'lucide-react';
import { LeafletIncidentMap } from '../components/map/LeafletIncidentMap';
import { incidents } from '../data/mockData';

const severityBadge = {
  critical: 'bg-red-600/20 text-red-400 border border-red-500/30',
  warning: 'bg-orange-600/20 text-orange-400 border border-orange-500/30',
  moderate: 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30',
  resolved: 'bg-green-600/20 text-green-400 border border-green-500/30',
};

const statusColors = {
  active: 'text-red-400',
  responding: 'text-orange-400',
  pending: 'text-yellow-400',
  resolved: 'text-green-400',
};

const typeIcons = {
  vehicular: Car,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: AlertTriangle,
  other: AlertTriangle,
};

export default function MapMonitoring() {
  const navigate = useNavigate();

  const [selectedIncident, setSelectedIncident] = useState(null);
  const [activeLayer, setActiveLayer] = useState(null);
  const [incidentPanelOpen, setIncidentPanelOpen] = useState(true);

  const activeIncidents = incidents.filter(i => i.status !== 'resolved');
  const selectedInc = incidents.find(i => i.id === selectedIncident);

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      {/* Full-screen Map */}
      <div className="flex-1 relative overflow-hidden">
        <LeafletIncidentMap
          height="100%"
          showControls={true}
          showHeatmap={true}
          showDangerZones={true}
          onMarkerClick={(id) => setSelectedIncident(id)}
          selectedIncidentId={selectedIncident || undefined}
        />

        {/* Top overlay bar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          <div className="flex items-center gap-2 bg-card/95 border border-border rounded-xl px-4 py-2 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-foreground font-semibold">LIVE MAP</span>
            <span className="text-[10px] text-muted-foreground">— Echague, Isabela</span>
          </div>
          <button
            onClick={() => {}}
            className="flex items-center gap-1.5 bg-card/95 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-all shadow-lg"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Layer Control (top right) */}
        <div className="absolute top-14 right-14 z-20">
          <div className="bg-card/95 border border-border rounded-xl p-3 shadow-lg min-w-36">
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase">Map Layers</span>
            </div>
            {[
              { key: 'hotspot', label: 'Accident Hotspot', color: 'text-red-400', icon: AlertTriangle },
              { key: 'flood', label: 'Flood Risk Area', color: 'text-blue-400', icon: Droplets },
              { key: 'traffic', label: 'Traffic Hazard', color: 'text-yellow-400', icon: Car },
              { key: 'heatmap', label: 'Heatmap', color: 'text-orange-400', icon: Zap },
            ].map(({ key, label, color, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveLayer(activeLayer === key ? null : key)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[10px] transition-all mb-0.5 ${
                  activeLayer === key ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-secondary'
                }`}
              >
                <Icon className={`w-3 h-3 ${color}`} />
                <span className="text-foreground/80">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Incident Popup */}
        {selectedInc && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 w-96">
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
                </div>
                <button
                  onClick={() => setSelectedIncident(null)}
                  className="text-muted-foreground hover:text-foreground text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{selectedInc.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold ${statusColors[selectedInc.status]}`}>
                    ● {selectedInc.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">{selectedInc.assignedTeam}</span>
                </div>
                <button
                  onClick={() => navigate(`/admin/incidents/${selectedInc.id}`)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all"
                >
                  Details <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Incidents Panel */}
      <div
        className={`shrink-0 bg-card border-l border-border flex flex-col transition-all duration-300 overflow-hidden ${
          incidentPanelOpen ? 'w-72' : 'w-10'
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
                <span className="text-sm font-semibold text-foreground">Active Incidents</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{activeIncidents.length} ongoing</p>
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
                        <div className="flex items-center gap-1 mt-1">
                          <Shield className="w-2.5 h-2.5 text-muted-foreground" />
                          <span className="text-[9px] text-muted-foreground">{inc.assignedTeam}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
