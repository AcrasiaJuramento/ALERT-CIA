import { createElement, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeft, Camera, Car, CheckCircle2, ChevronRight,
  Clock, Droplets, Edit2, ExternalLink, FileText, Flame, Heart, MapPin, Plus,
  Radio, Share2, Users,
} from 'lucide-react';
import { getDispatchRecordByResponse, getIncident, getPCRReportByResponse, listAuditLogs } from '../services/supabase';
import { LeafletIncidentMap } from '../components/map/LeafletIncidentMap';
import { getIncidentStatusLabel, INCIDENT_STATUS_ORDER } from '../utils/incidentStatus';
import { formatDateAndTime, formatLongDateTime } from '../utils/dateFormat';

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

const timelineColor = {
  new: 'bg-red-500',
  dispatch: 'bg-orange-500',
  arrive: 'bg-blue-500',
  assess: 'bg-purple-500',
  transport: 'bg-teal-500',
  report: 'bg-green-500',
};

const RESPONSE_STATUS_ORDER = ['draft', 'sent_to_responding_team', 'accepted_by_responding_team', 'pcr_in_progress', 'pcr_completed'];

const formatDateTime = value => formatLongDateTime(value);

const displayValue = value => value || '-';

export default function IncidentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [dispatch, setDispatch] = useState(null);
  const [pcr, setPcr] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const row = await getIncident(id);
        const [linkedDispatch, linkedPcr, logs] = row?.responseId
          ? await Promise.all([
              getDispatchRecordByResponse(row.responseId).catch(() => null),
              getPCRReportByResponse(row.responseId).catch(() => null),
              listAuditLogs({ responseId: row.responseId, limit: 20 }).catch(() => []),
            ])
          : [null, null, []];
        if (mounted) {
          setIncident(row);
          setDispatch(linkedDispatch);
          setPcr(linkedPcr);
          setAuditLogs(logs);
        }
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load incident.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return <div className="p-5 text-sm text-slate-400">Loading incident details...</div>;
  }

  if (error || !incident) {
    return (
      <div className="p-5 space-y-4">
        <button onClick={() => navigate('/admin/incidents')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Incidents
        </button>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center text-sm text-slate-400">
          {error || 'Incident was not found or is not available to your role.'}
        </div>
      </div>
    );
  }

  const TypeIcon = typeIcons[incident.type] || AlertTriangle;
  const statusSteps = RESPONSE_STATUS_ORDER.includes(incident.status) ? RESPONSE_STATUS_ORDER : INCIDENT_STATUS_ORDER;
  const currentStatusIndex = statusSteps.indexOf(incident.status);
  const attachments = pcr?.attachments || [];
  const timeline = auditLogs.length
    ? auditLogs.map(log => ({
        time: formatDateTime(log.created_at),
        event: `${log.action} ${log.table_name}`,
        type: log.action === 'create' ? 'new' : log.action === 'accept' ? 'dispatch' : log.action === 'back_to_base' ? 'report' : 'assess',
      }))
    : [];

  const shareIncident = async () => {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div className="p-5 space-y-5" style={{ fontFamily: 'Inter, sans-serif' }}>
      <button
        onClick={() => navigate('/admin/incidents')}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Incidents
      </button>

      <div className={`bg-slate-900 border border-slate-700/50 border-l-4 ${severityBorderLeft[incident.severity] || 'border-l-slate-500'} rounded-xl p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center shrink-0">
              <TypeIcon className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <span className="font-mono text-blue-400 font-bold text-lg">{incident.id}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${severityBadge[incident.severity] || severityBadge.moderate}`}>
                  {String(incident.severity || 'moderate').toUpperCase()}
                </span>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                  {getIncidentStatusLabel(incident.status)}
                </span>
              </div>
              <h2 className="text-base font-bold text-white capitalize mb-1">
                {incident.type} Incident - {displayValue(incident.location)}
              </h2>
              <p className="text-slate-400 text-sm max-w-2xl">
                {incident.description || 'No narrative has been added for this incident yet.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => dispatch ? navigate(`/admin/dispatch/new?edit=${dispatch.dispatchId || dispatch.id}`) : navigate(`/admin/dispatch/new?incident=${incident.id}`)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" /> {dispatch ? 'Edit Dispatch' : 'Create Dispatch'}
            </button>
            <button onClick={shareIncident} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white transition-all">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <button
              onClick={() => pcr ? navigate(`/admin/pcr/new?edit=${pcr.id}`) : navigate('/admin/pcr')}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white font-medium transition-all"
            >
              <FileText className="w-3.5 h-3.5" /> {pcr ? 'Open PCR' : 'PCR Records'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { icon: MapPin, label: 'Location', value: displayValue(incident.location) },
            { icon: Clock, label: 'Reported', value: formatDateAndTime(incident.date, incident.time) },
            { icon: Users, label: 'Dispatch', value: dispatch ? dispatch.status : 'No dispatch linked' },
            { icon: AlertTriangle, label: 'PCR', value: pcr ? pcr.status : 'No PCR linked' },
          ].map(({ icon, label, value }) => (
            <div key={label} className="bg-slate-800/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                {createElement(icon, { className: 'w-3.5 h-3.5 text-slate-500' })}
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
              </div>
              <div className="text-xs text-white font-medium truncate">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-4">
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
              incidents={[incident]}
              height="280px"
              showControls={false}
              showHeatmap={false}
              showDangerZones={true}
              selectedIncidentId={incident.id}
              compact={true}
            />
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-white">Photos & Attachments</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {attachments.length ? attachments.slice(0, 6).map((attachment) => (
                <div key={attachment.id || attachment.name} className="rounded-lg border border-slate-700/50 bg-slate-800 p-3">
                  <Camera className="mb-2 h-5 w-5 text-slate-500" />
                  <div className="truncate text-xs font-semibold text-slate-200">{attachment.name || 'PCR attachment'}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{formatDateTime(attachment.capturedAt)}</div>
                </div>
              )) : (
                <div className="sm:col-span-2 rounded-lg border border-dashed border-slate-700 bg-slate-800/40 p-5 text-center">
                  <Camera className="mx-auto mb-2 h-6 w-6 text-slate-500" />
                  <p className="text-xs text-slate-400">No incident photos or PCR attachments are linked yet.</p>
                </div>
              )}
              <button onClick={() => pcr ? navigate(`/admin/pcr/new?edit=${pcr.id}`) : navigate('/admin/pcr')} className="rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500/50 text-slate-500 hover:text-blue-400 transition-all cursor-pointer text-xs gap-1 p-4">
                <Plus className="w-5 h-5" />
                {pcr ? 'Add via PCR' : 'Open PCR Records'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
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
              {statusSteps.map(s => {
                const stepIdx = statusSteps.indexOf(s);
                const isCompleted = currentStatusIndex >= 0 && stepIdx < currentStatusIndex;
                const isCurrent = s === incident.status;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      isCompleted ? 'bg-green-500' : isCurrent ? 'bg-orange-500 animate-pulse' : 'bg-slate-700'
                    }`}>
                      {isCompleted && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-xs ${isCurrent ? 'text-white font-semibold' : isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>
                      {getIncidentStatusLabel(s)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-white">Incident Timeline</span>
            </div>
            <div className="space-y-3 relative">
              <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-700" />
              {timeline.map((item, i) => (
                <div key={`${item.time}-${i}`} className="flex gap-4 relative">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${timelineColor[item.type]}`}>
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-slate-400">{item.time}</div>
                    <div className="text-xs text-slate-300">{item.event}</div>
                  </div>
                </div>
              ))}
              {!timeline.length && <p className="text-xs text-slate-400">No audit timeline is available for this incident.</p>}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-semibold text-white">Response Team</span>
            </div>
            <div className="mb-3">
              <div className="text-sm font-semibold text-blue-400">{incident.assignedTeam}</div>
              <div className="text-xs text-slate-400">{dispatch?.vehicle || 'No vehicle recorded'} {dispatch?.driver ? `- ${dispatch.driver}` : ''}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-800/60 p-2">
                <div className="text-slate-500">Main aider</div>
                <div className="truncate text-slate-200">{displayValue(dispatch?.mainAider)}</div>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-2">
                <div className="text-slate-500">Assistant</div>
                <div className="truncate text-slate-200">{displayValue(dispatch?.assistantAider)}</div>
              </div>
            </div>
          </div>

          <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-300">Patient Care Record</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              {pcr ? `Linked PCR is ${pcr.status}. ${pcr.workflowLabel || ''}` : 'No Patient Care Record is linked to this incident yet.'}
            </p>
            <button
              onClick={() => pcr ? navigate(`/admin/pcr/new?edit=${pcr.id}`) : navigate('/admin/pcr')}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all"
            >
              {pcr ? <ExternalLink className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
              {pcr ? 'Open Linked PCR' : 'Go to PCR Records'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
