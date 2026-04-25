import { useState, useEffect } from "react";
import {
  AlertTriangle, MapPin, Navigation, Zap, X,
  Volume2, VolumeX, ChevronRight, Clock, Shield
} from "lucide-react";
import { MockMap } from "../components/MockMap";
import { incidents } from "../data/mockData";

// Simulated proximity alerts
const proximityAlerts = [
  {
    id: 1,
    distance: 200,
    type: "Accident-prone area",
    location: "Quirino Ave",
    risk: "High",
    color: "bg-red-600",
    borderColor: "border-red-500",
    textColor: "text-red-600",
    icon: "⚠️",
  },
  {
    id: 2,
    distance: 450,
    type: "Flood risk zone",
    location: "Matina Aplaya",
    risk: "Moderate",
    color: "bg-orange-500",
    borderColor: "border-orange-500",
    textColor: "text-orange-600",
    icon: "💧",
  },
  {
    id: 3,
    distance: 800,
    type: "Active accident ahead",
    location: "Buhangin Road",
    risk: "Critical",
    color: "bg-red-700",
    borderColor: "border-red-600",
    textColor: "text-red-700",
    icon: "🚨",
  },
];

const heatZones = [
  { x: 52, y: 38, size: 140, color: "#dc2626", opacity: 0.3 },
  { x: 68, y: 45, size: 110, color: "#dc2626", opacity: 0.25 },
  { x: 35, y: 55, size: 160, color: "#ea580c", opacity: 0.2 },
  { x: 45, y: 72, size: 140, color: "#2563eb", opacity: 0.2 },
  { x: 25, y: 40, size: 90, color: "#9333ea", opacity: 0.18 },
];

const dangerZones = [
  { x: 50, y: 40, size: 85, label: "High Risk", color: "#dc2626" },
  { x: 42, y: 70, size: 100, label: "Flood Risk", color: "#2563eb" },
  { x: 68, y: 52, size: 70, label: "Traffic Risk", color: "#ea580c" },
];

export default function PublicMap() {
  const [currentAlert, setCurrentAlert] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [alertDismissed, setAlertDismissed] = useState([]);
  const [selectedInc, setSelectedInc] = useState(null);
  const [showPanel, setShowPanel] = useState(true);

  // Rotate through alerts
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentAlert(c => (c + 1) % proximityAlerts.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const visibleAlert = proximityAlerts[currentAlert];
  const isDismissed = alertDismissed.includes(visibleAlert.id);

  const publicIncidents = incidents
    .filter(i => i.status !== "resolved")
    .map((inc, idx) => ({
      id: String(idx + 1),
      x: inc.coordinates.x,
      y: inc.coordinates.y,
      type: "vehicular",
      severity: inc.severity,
      label: inc.type,
      status: inc.status,
    }));

  return (
    <div className="flex h-[calc(100vh-130px)] flex-col md:flex-row overflow-hidden">
      {/* Map */}
      <div className="flex-1 relative min-h-60">
        <MockMap
          markers={publicIncidents}
          heatZones={heatZones}
          dangerZones={dangerZones}
          showLayers={false}
          style="dark"
        />

        {/* Waze-style Navigation Bar */}
        <div className="absolute top-0 left-0 right-0 p-3 z-20">
          <div className="bg-slate-900/95 backdrop-blur-sm rounded-2xl border border-white/10 shadow-xl p-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <Navigation size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-400 text-[10px]">Your location</p>
                <p className="text-white text-sm font-semibold truncate">Davao City, Philippines</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSoundOn(!soundOn)}
                  className="p-2 bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                >
                  {soundOn ? <Volume2 size={14} className="text-white" /> : <VolumeX size={14} className="text-white/40" />}
                </button>
                <button
                  onClick={() => setShowPanel(!showPanel)}
                  className="p-2 bg-white/10 hover:bg-white/15 rounded-xl transition-colors md:hidden"
                >
                  <ChevronRight size={14} className={`text-white transition-transform ${showPanel ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Proximity Alert */}
        {!isDismissed && (
          <div className="absolute bottom-16 left-3 right-3 md:right-auto md:w-72 z-20">
            <div className={`${visibleAlert.color} text-white rounded-2xl p-4 shadow-2xl border border-white/20 relative overflow-hidden`}>
              <div className="absolute inset-0 bg-white/10 animate-pulse rounded-2xl" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{visibleAlert.icon}</span>
                    <div>
                      <p className="font-black text-base leading-tight">{visibleAlert.type} ahead</p>
                      <p className="text-white/80 text-xs">in {visibleAlert.distance} meters</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAlertDismissed(prev => [...prev, visibleAlert.id])}
                    className="text-white/60 hover:text-white p-1 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2">
                  <MapPin size={12} className="text-white/80 shrink-0" />
                  <span className="text-white text-xs font-medium">{visibleAlert.location}</span>
                  <span className="ml-auto text-white/70 text-[10px] font-semibold uppercase">{visibleAlert.risk} RISK</span>
                </div>
              </div>
            </div>

            {/* Alert dots */}
            <div className="flex justify-center gap-1.5 mt-2">
              {proximityAlerts.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentAlert(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentAlert ? "bg-white w-3" : "bg-white/40"}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Current road status */}
        <div className="absolute bottom-3 left-3 right-auto z-20">
          <div className="flex flex-col gap-2">
            <div className="bg-slate-900/90 backdrop-blur-sm rounded-xl border border-white/10 px-3 py-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
              <span className="text-white text-[11px] font-medium">4 active incidents in area</span>
            </div>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      {showPanel && (
        <div className="h-52 md:h-full md:w-72 bg-white border-t md:border-t-0 md:border-l border-slate-200 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* AI Warning */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={13} className="text-violet-600" />
                <p className="text-violet-800 text-xs font-bold">AI Risk Prediction</p>
              </div>
              <p className="text-violet-600 text-xs leading-relaxed">
                Elevated accident risk predicted for Quirino Avenue between <strong>3–6 PM</strong> today based on traffic and weather patterns.
              </p>
            </div>

            {/* Nearby incidents */}
            <div>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Nearby Incidents</p>
              <div className="space-y-2">
                {incidents.filter(i => i.status !== "resolved").map((inc, idx) => (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedInc(selectedInc === inc.id ? null : inc.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all
                      ${selectedInc === inc.id ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200 hover:bg-slate-100"}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0
                        ${inc.severity === "critical" ? "bg-red-500 animate-pulse" :
                          inc.severity === "warning" ? "bg-orange-500" : "bg-yellow-500"}`}
                      />
                      <div>
                        <p className="text-slate-800 text-xs font-semibold">{inc.type}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin size={9} className="text-slate-400" />
                          <p className="text-slate-500 text-[10px]">{inc.location}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock size={9} className="text-slate-400" />
                          <p className="text-slate-400 text-[10px]">{inc.time}</p>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Safety Tips */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-slate-600 text-xs font-semibold flex items-center gap-1.5 mb-2">
                <Shield size={11} /> Safety Notice
              </p>
              <p className="text-slate-500 text-xs leading-relaxed">
                This map shows real-time incident data. For emergencies, always call <strong className="text-red-600">911</strong> immediately.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}