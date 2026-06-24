import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Clock, Users, AlertTriangle, CheckCircle2,
  FileText, Edit2, Phone, Radio, Camera, ChevronRight,
  Flame, Droplets, Car, Heart,Share2, Activity
} from 'lucide-react';
import { incidents } from '../data/mockData';
import { LeafletIncidentMap } from '../components/map/LeafletIncidentMap';
import { getIncidentStatusLabel, INCIDENT_STATUS_ORDER } from '../utils/incidentStatus';

const typeIcons = {
  vehicular: Car,
  fire: Flame,
  medical: Heart,
  flood: Droplets,
  crime: AlertTriangle,
  other: AlertTriangle,
};

const severityBadge = {
  critical: 'bg-red-600/20 text-red-400 border border-red-500/40',
  warning: 'bg-orange-600/20 text-orange-400 border border-orange-500/40',
  moderate: 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/40',
  resolved: 'bg-green-600/20 text-green-400 border border-green-500/40',
};

const severityBorderLeft = {
  critical: 'border-l-red-500',
  warning: 'border-l-orange-500',
  moderate: 'border-l-yellow-500',
  resolved: 'border-l-green-500',
};

const timeline = [
  { time: '08:23', event: 'Incident reported by motorist', type: 'new' },
  { time: '08:25', event: 'Dispatch received alert', type: 'dispatch' },
  { time: '08:27', event: 'Alpha Team dispatched', type: 'dispatch' },
  { time: '08:35', event: 'Alpha Team arrived at scene', type: 'arrive' },
  { time: '08:40', event: 'Medical assessment initiated', type: 'assess' },
  { time: '09:10', event: 'Patient transported to KDH', type: 'transport' },
  { time: '09:45', event: 'PCR Report submitted', type: 'report' },
];

const timelineColor = {
  new: 'bg-red-500',
  dispatch: 'bg-orange-500',
  arrive: 'bg-blue-500',
  assess: 'bg-purple-500',
  transport: 'bg-teal-500',
  report: 'bg-green-500',
};

export default function IncidentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const incident = incidents.find(i => i.id === id) || incidents[0];
  const TypeIcon = typeIcons[incident.type];

  return (
    <div className="p-5 space-y-5" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Back */}
      <button
        onClick={() => navigate('/admin/incidents')}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Incidents
      </button>

      {/* Header Card */}
      <div className={`bg-slate-900 border border-slate-700/50 border-l-4 ${severityBorderLeft[incident.severity]} rounded-xl p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center shrink-0">
              <TypeIcon className={`w-6 h-6 ${
                incident.severity === 'critical' ? 'text-red-400' :
                incident.severity === 'warning' ? 'text-orange-400' :
                incident.severity === 'moderate' ? 'text-yellow-400' : 'text-green-400'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="font-mono text-blue-400 font-bold text-lg">{incident.id}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${severityBadge[incident.severity]}`}>
                  {incident.severity.toUpperCase()}
                </span>
              </div>
              <h2 className="text-base font-bold text-white capitalize mb-1">
                {incident.type} Incident — {incident.location}
              </h2>
              <p className="text-slate-400 text-sm max-w-2xl">{incident.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white transition-all">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white transition-all">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <button
              onClick={() => navigate('/admin/pcr')}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white font-medium transition-all"
            >
              <FileText className="w-3.5 h-3.5" /> PCR Report
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[ 
            { icon: MapPin, label: 'Location', value: incident.location },
            { icon: Clock, label: 'Reported', value: `${incident.date} ${incident.time}` },
            { icon: Users, label: 'Responders', value: `${incident.responders} deployed` },
            { icon: AlertTriangle, label: 'Casualties', value: `${incident.casualties} affected` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-slate-800/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
              </div>
              <div className="text-xs text-white font-medium truncate">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Map + Images */}
        <div className="xl:col-span-2 space-y-4">
          {/* Mini Map */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">Incident Location</span>
              </div>
              <button
                onClick={() => navigate('/admin/map')}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                Full Map <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <LeafletIncidentMap
              height="280px"
              showControls={false}
              showHeatmap={true}
              showDangerZones={true}
              selectedIncidentId={incident.id}
              compact={true}
            />
          </div>

          {/* Incident Photos */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-white">Attached Photos</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['bg-slate-700', 'bg-slate-800', 'bg-slate-700/60'].map((bg, i) => (
                <div key={i} className={`${bg} rounded-lg aspect-video flex items-center justify-center border border-slate-700/50 cursor-pointer hover:border-blue-500/50 transition-all`}>
                  <Camera className="w-6 h-6 text-slate-500" />
                </div>
              ))}
              <button className="rounded-lg aspect-video flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500/50 text-slate-500 hover:text-blue-400 transition-all cursor-pointer text-xs gap-1">
                <Camera className="w-5 h-5" />
                Add Photo
              </button>
            </div>
          </div>
        </div>

        {/* Right: Timeline + Team */}
        <div className="space-y-4">
          {/* Status */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-semibold text-white">Incident Status</span>
              </div>
              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] font-semibold rounded-lg capitalize">
                {getIncidentStatusLabel(incident.status)}
              </span>
            </div>
            <div className="space-y-2">
              {INCIDENT_STATUS_ORDER.map(s => {
                const currentIdx = INCIDENT_STATUS_ORDER.indexOf(incident.status);
                const isCompleted = INCIDENT_STATUS_ORDER.indexOf(s) < currentIdx;
                const isCurrent = s === incident.status;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      isCompleted ? 'bg-green-500' : isCurrent ? 'bg-orange-500 animate-pulse' : 'bg-slate-700'
                    }`}>
                      {isCompleted && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-xs capitalize ${isCurrent ? 'text-white font-semibold' : isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                      {getIncidentStatusLabel(s)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">Incident Timeline</span>
            </div>
            <div className="space-y-3 relative">
              <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-700" />
              {timeline.map((item, i) => (
                <div key={i} className="flex gap-4 relative">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${timelineColor[item.type]}`}>
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-slate-400">{item.time}</div>
                    <div className="text-xs text-slate-300">{item.event}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Response Team */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold text-white">Response Team</span>
            </div>
            <div className="mb-3">
              <div className="text-sm font-semibold text-blue-400">{incident.assignedTeam}</div>
              <div className="text-xs text-slate-400">{incident.responders} responders deployed</div>
            </div>
            <div className="space-y-2">
              {[
                { name: 'Cpl. Roberto Aquino', role: 'Team Leader' },
                { name: 'Cpl. Diana Torres', role: 'Medical Responder' },
                { name: 'Driver Juan Reyes', role: 'Vehicle Operator' },
              ].map(({ name, role }) => (
                <div key={name} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0">
                    {name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-white">{name}</div>
                    <div className="text-[10px] text-slate-500">{role}</div>
                  </div>
                  <button className="ml-auto text-slate-500 hover:text-blue-400 transition-colors">
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* PCR Link */}
          <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-300">PCR Report</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Patient Care Report filed for this incident. Click to view full report.
            </p>
            <button
              onClick={() => navigate('/admin/pcr')}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              View PCR Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
