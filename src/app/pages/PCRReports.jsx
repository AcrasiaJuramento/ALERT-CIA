import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Archive, CheckCircle2, ChevronLeft, ChevronRight, Download, Edit3, Eye,
  FilePlus2, FileText, Filter, RefreshCw, Search, X, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, ROLES } from '../access/rbac';
import { PrintablePCR } from '../components/PCRWidgets';
import { useAuth } from '../contexts/AuthContext';
import { exportPCRToPdf, PCR_EDIT_KEY } from '../utils/pcrStorage';
import { archivePCRReport, getPCRReportByResponse, listPCRReports, savePCRReport } from '../services/supabase';
import { hybridRepository } from '../api/hybrid-client';
import { cloudClient } from '../api/cloud-client';
import { localServerClient } from '../api/local-server-client';
import { getConnectionState, subscribeConnection } from '../network/connection-manager';
import { subscribeLiveSyncEvents } from '../network/live-sync-events';
import { runSyncNow } from '../sync/sync-engine';
import { getAllRecords, putRecord } from '../db/indexed-db';

const SOURCE_RANK = {
  device: 1,
  local_server: 2,
  cloud: 3,
};
const LOCAL_REFRESH_MS = 15000;
const CLOUD_REFRESH_MS = 30000;
const autoUploadingPcrKeys = new Set();

function statusRank(status = '') {
  return {
    Draft: 1,
    'In Progress': 2,
    Submitted: 3,
    'Submitted Locally': 3,
    Verified: 5,
  }[status] || 0;
}

function displayStatus(record) {
  if (record.recordSource === 'cloud') return record.status || 'Draft';
  return record.localStatus || record.status || 'Draft';
}

function needsCloudUpload(record = {}) {
  const statusText = String(record.status || '').toLowerCase();
  const localStatusText = String(record.localStatus || '').toLowerCase();
  const displayText = String(displayStatus(record) || '').toLowerCase();
  const syncText = String(record.syncLabel || record.sync_status || '').toLowerCase();
  const cloudSynced = record.synced_to_cloud === true || syncText.includes('cloud synced');
  if (statusText.includes('verified') || statusText.includes('rejected') || displayText.includes('verified') || displayText.includes('rejected')) return false;
  if (cloudSynced && !syncText.includes('pending')) return false;
  const visiblyLocalOrPending = syncText.includes('pending')
    || syncText.includes('saved on local server')
    || localStatusText.includes('locally')
    || displayText.includes('locally');
  if (visiblyLocalOrPending) return true;
  return true;
}

function normalizeKeyPart(value) {
  return String(value || '').trim().toLowerCase();
}

function patientIncidentKey(record = {}) {
  return [
    normalizeKeyPart(record.patientName),
    normalizeKeyPart(record.dateOfIncident),
    normalizeKeyPart(record.timeOfIncident),
    normalizeKeyPart(record.latitude || '').slice(0, 8),
    normalizeKeyPart(record.longitude || '').slice(0, 8),
  ].filter(Boolean).join('|');
}

function logicalRecordKeys(record = {}) {
  return [
    record.responseNumber,
    record.responseClientId,
    record.responseId,
    record.dispatchClientId,
    record.dispatchId,
    record.pcrClientId,
    record.pcrId,
    record.id,
    patientIncidentKey(record),
  ].filter(Boolean).map(String);
}

function logicalRecordKey(record) {
  return logicalRecordKeys(record)[0] || '';
}

function preferFilled(next, current, key) {
  if (next?.[key] && !['Unnamed patient', 'Not specified'].includes(next[key])) return next[key];
  return current?.[key] || next?.[key];
}

function mergeById(records) {
  const byId = new Map();
  const aliases = new Map();
  for (const record of records) {
    const keys = logicalRecordKeys(record);
    const id = keys.map(key => aliases.get(key)).find(Boolean) || keys[0];
    if (!id) continue;
    const current = byId.get(id);
    const recordStatusRank = statusRank(record.status);
    const currentStatusRank = statusRank(current?.status);
    const recordSourceRank = SOURCE_RANK[record.recordSource] || 0;
    const currentSourceRank = SOURCE_RANK[current?.recordSource] || 0;
    const winningRecord = recordStatusRank > currentStatusRank || (recordStatusRank === currentStatusRank && recordSourceRank >= currentSourceRank)
      ? record
      : current;
    const cloudWinner = winningRecord?.recordSource === 'cloud';
    const hasPendingLocal = [record, current].some(item => item && item.recordSource === 'device' && item.synced_to_cloud !== true);
    const next = {
      ...(current || {}),
      ...winningRecord,
      localStatus: cloudWinner && !hasPendingLocal ? null : winningRecord?.localStatus || current?.localStatus,
      syncLabel: hasPendingLocal ? 'Pending cloud synchronization' : cloudWinner ? 'Cloud synced' : winningRecord?.syncLabel || current?.syncLabel,
      responseNumber: preferFilled(record, current, 'responseNumber'),
      patientName: preferFilled(record, current, 'patientName'),
      age: preferFilled(record, current, 'age'),
      gender: preferFilled(record, current, 'gender'),
      chiefComplaint: preferFilled(record, current, 'chiefComplaint'),
      id: winningRecord?.id || current?.id || record.id,
      pcrId: winningRecord?.pcrId || winningRecord?.id || current?.pcrId || record.pcrId,
      updatedAt: record.updatedAt || record.updated_at_device || record.updated_at || record.createdAt || record.created_at_device || new Date().toISOString(),
    };
    byId.set(id, next);
    logicalRecordKeys(next).forEach(key => aliases.set(key, id));
    keys.forEach(key => aliases.set(key, id));
  }
  return [...byId.values()];
}

function hasCloudTwin(record, cloudRecords) {
  const directKeys = new Set([
    record.pcrClientId,
    record.pcrId,
    record.id,
  ].filter(Boolean).map(String));
  const responseKeys = new Set([
    record.responseClientId,
    record.responseId,
  ].filter(Boolean).map(String));
  const patientKey = patientIncidentKey(record);
  return cloudRecords.some(cloud => {
    const cloudDirectKeys = [cloud.pcrClientId, cloud.pcrId, cloud.id].filter(Boolean).map(String);
    if (cloudDirectKeys.some(key => directKeys.has(key))) return true;
    const cloudResponseKeys = [cloud.responseClientId, cloud.responseId].filter(Boolean).map(String);
    if (cloudResponseKeys.some(key => responseKeys.has(key))) return true;
    return patientKey && patientKey === patientIncidentKey(cloud);
  });
}

function hasCloudEquivalent(record, cloudRecords) {
  if (hasCloudTwin(record, cloudRecords)) return true;
  const responseNumber = normalizeKeyPart(record.responseNumber);
  if (!responseNumber) return false;
  const patientKey = patientIncidentKey(record);
  return cloudRecords.some(cloud => {
    if (normalizeKeyPart(cloud.responseNumber) !== responseNumber) return false;
    const cloudPatientKey = patientIncidentKey(cloud);
    return !patientKey || !cloudPatientKey || patientKey === cloudPatientKey;
  });
}

async function markPcrSyncedLocally(localRecord, cloudRecord) {
  const syncedAt = new Date().toISOString();
  await putRecord('local_pcr_reports', {
    ...localRecord,
    ...cloudRecord,
    id: localRecord.id || cloudRecord.id,
    pcrId: cloudRecord.pcrId || cloudRecord.id || localRecord.pcrId,
    responseId: cloudRecord.responseId || localRecord.responseId,
    responseNumber: cloudRecord.responseNumber || localRecord.responseNumber,
    localStatus: null,
    syncLabel: 'Cloud synced',
    sync_status: 'synced',
    synced_to_cloud: true,
    cloud_synced_at: syncedAt,
    updatedAt: cloudRecord.updatedAt || syncedAt,
  });
}

async function markPcrUploadFailedLocally(localRecord, error) {
  const updatedAt = new Date().toISOString();
  await putRecord('local_pcr_reports', {
    ...localRecord,
    localStatus: localRecord.localStatus || 'Submitted Locally',
    syncLabel: 'Pending cloud synchronization',
    sync_status: 'retry_scheduled',
    synced_to_cloud: false,
    last_sync_error: error?.message || String(error || 'Cloud upload failed.'),
    updatedAt,
  });
}

async function confirmCloudPcrUpload(savedRecord, fallbackRecord) {
  const responseId = savedRecord?.responseId || fallbackRecord?.responseId;
  if (!responseId) throw new Error('Cloud upload did not return a response ID.');
  const confirmed = await getPCRReportByResponse(responseId);
  if (!confirmed?.id && !confirmed?.pcrId) {
    throw new Error('PCR upload was attempted, but Supabase did not return the PCR record.');
  }
  return {
    ...fallbackRecord,
    ...savedRecord,
    ...confirmed,
    responseId: confirmed.responseId || savedRecord.responseId || fallbackRecord.responseId,
    pcrId: confirmed.pcrId || confirmed.id || savedRecord.pcrId || savedRecord.id || fallbackRecord.pcrId,
  };
}

async function autoUploadLocalServerPcrReports(localServerRecords, cloudRecords) {
  const candidates = localServerRecords.filter(record =>
    needsCloudUpload({ ...record, recordSource: 'local_server', syncLabel: 'Saved on local server' })
    && !hasCloudTwin(record, cloudRecords)
  );
  if (!candidates.length) return { uploaded: 0, cloudRecords };

  let uploaded = 0;
  for (const record of candidates) {
    const key = logicalRecordKey(record);
    if (!key || autoUploadingPcrKeys.has(key)) continue;
    autoUploadingPcrKeys.add(key);
    try {
      const cloudRecord = await cloudClient.submitPcrHeader({
        ...record,
        status: 'Submitted',
        localStatus: record.localStatus || 'Submitted Locally',
        source: record.source || 'local_server',
      });
      const confirmedCloudRecord = await confirmCloudPcrUpload(cloudRecord, record);
      await markPcrSyncedLocally(record, confirmedCloudRecord);
      uploaded += 1;
    } catch (error) {
      await markPcrUploadFailedLocally(record, error).catch(() => undefined);
    } finally {
      autoUploadingPcrKeys.delete(key);
    }
  }

  if (!uploaded) return { uploaded, cloudRecords };
  const refreshedCloudRecords = await listPCRReports({ limit: 100 }).catch(() => cloudRecords);
  return { uploaded, cloudRecords: refreshedCloudRecords };
}

export default function PCRReports() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [archiveView, setArchiveView] = useState('Active');
  const [selected, setSelected] = useState(null);
  const [exportingRecord, setExportingRecord] = useState(null);
  const [rejectingRecord, setRejectingRecord] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [page, setPage] = useState(1);
  const [connection, setConnection] = useState(getConnectionState());
  const pageSize = 10;
  const canCreate = can(PERMISSIONS.CREATE_PCR);
  const canReview = user?.role === ROLES.ADMINISTRATOR && can(PERMISSIONS.REVIEW_PCR);
  const isReviewable = record => {
    const statusText = String(record.status || '').toLowerCase();
    const localStatusText = String(record.localStatus || '').toLowerCase();
    return ['submitted', 'submitted locally', 'completed', 'pcr completed', 'pcr completed locally'].includes(statusText)
      || ['submitted locally', 'completed', 'pcr completed', 'pcr completed locally'].includes(localStatusText);
  };

  const loadReports = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const currentConnection = getConnectionState();
      let cloudRecords = await listPCRReports({ limit: 100 }).catch(error => {
        if (currentConnection.mode === 'cloud') throw error;
        return [];
      });
      const localDeviceRecords = await hybridRepository.getLocalPcrReports().catch(() => []);
      const localServerRecords = currentConnection.localOnline
        ? await localServerClient.listPcrReports().catch(() => [])
        : [];
      if (currentConnection.cloudOnline && localServerRecords.length) {
        const autoUploadResult = await autoUploadLocalServerPcrReports(localServerRecords, cloudRecords);
        cloudRecords = autoUploadResult.cloudRecords;
      }
      if (cloudRecords.length) {
        await hybridRepository.reconcileCloudPcrReports(cloudRecords).catch(() => 0);
      }
      const visibleLocalServerRecords = currentConnection.cloudOnline
        ? localServerRecords.filter(record => !hasCloudEquivalent(record, cloudRecords))
        : localServerRecords;
      const reconciledLocalRecords = cloudRecords.length
        ? await hybridRepository.getLocalPcrReports().catch(() => localDeviceRecords)
        : localDeviceRecords;
      const allRecords = mergeById([
        ...reconciledLocalRecords.map(record => ({ ...record, recordSource: 'device', syncLabel: record.synced_to_cloud ? 'Cloud synced' : 'Pending cloud synchronization' })),
        ...visibleLocalServerRecords.map(record => ({ ...record, recordSource: 'local_server', syncLabel: 'Saved on local server' })),
        ...cloudRecords.map(record => ({ ...record, recordSource: 'cloud', syncLabel: 'Cloud synced' })),
      ]);
      setRecords(allRecords.map(record => ({ ...record, archived: false })));
    } catch (error) {
      toast.error(error.message || 'Unable to load Patient Care Records.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => subscribeConnection(setConnection), []);

  useEffect(() => {
    let timer;
    const unsubscribe = subscribeLiveSyncEvents(event => {
      if (!['pcr_changed', 'dispatch_changed', 'response_changed'].includes(event.type)) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => loadReports({ silent: true }), 250);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (connection.mode === 'offline') return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadReports({ silent: true });
    }, connection.mode === 'cloud' ? CLOUD_REFRESH_MS : LOCAL_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [connection.mode]);

  const filtered = useMemo(() => records.filter(record =>
    (archiveView === 'Archived' ? record.archived : !record.archived)
    && (status === 'All' || record.status === status || record.localStatus === status)
    && [record.responseNumber, record.patientName, record.placeOfIncident, record.hospitalName, record.respondingTeam].join(' ').toLowerCase().includes(query.toLowerCase())
  ), [records, query, status, archiveView]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRecords = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [query, status, archiveView]);

  useEffect(() => {
    if (!selected) return undefined;
    const closeOnEscape = event => event.key === 'Escape' && setSelected(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const freshRecord = records.find(record => record.id === selected.id || record.pcrId === selected.pcrId || logicalRecordKey(record) === logicalRecordKey(selected));
    if (freshRecord && freshRecord !== selected) setSelected(freshRecord);
  }, [records, selected]);

  const edit = record => {
    sessionStorage.setItem(PCR_EDIT_KEY, record.id);
    navigate(`/admin/pcr/new?edit=${record.id}`);
  };
  const archive = async record => {
    try {
      await archivePCRReport(record.id);
      setRecords(current => current.filter(item => item.id !== record.id));
      setSelected(null);
      toast.success('Patient Care Record archived.');
    } catch (error) {
      toast.error(error.message || 'Unable to archive Patient Care Record.');
    }
  };
  const doPdf = async record => {
    setExportingRecord(record);
    try {
      await exportPCRToPdf(record);
      toast.success('Patient Care Report PDF downloaded.');
    } catch {
      toast.error('Unable to generate the PDF. Please try again.');
    } finally {
      setExportingRecord(null);
    }
  };
  const updateStatus = async (record, nextStatus, reason = '') => {
    try {
      const nextRecord = await savePCRReport(record.id, {
        ...record,
        status: nextStatus,
        rejectionReason: reason,
        reviewedAt: new Date().toISOString(),
        verifiedAt: nextStatus === 'Verified' ? new Date().toISOString() : record.verifiedAt,
        updatedAt: new Date().toISOString(),
      });
      setRecords(current => current.map(item => item.id === record.id ? nextRecord : item));
      setSelected(current => current?.id === record.id ? { ...current, ...nextRecord, status: nextStatus, localStatus: null, syncLabel: 'Cloud synced' } : current);
      toast.success(nextStatus === 'Verified' ? 'Patient Care Record verified.' : 'Patient Care Record returned for correction.');
    } catch (error) {
      toast.error(error.message || 'Unable to update Patient Care Record.');
    }
  };
  const rejectRecord = () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection.');
      return;
    }
    updateStatus(rejectingRecord, 'Rejected', rejectionReason.trim());
    setRejectingRecord(null);
    setRejectionReason('');
  };
  const syncToCloud = async () => {
    try {
      toast.info('Syncing queued PCR records to cloud...');
      await runSyncNow({ includeNotDue: true });
      await loadReports({ silent: true });
      toast.success('Cloud sync attempted. Records refreshed.');
    } catch (error) {
      toast.error(error.message || 'Unable to sync to cloud.');
    }
  };
  const uploadRecordToCloud = async record => {
    try {
      const ids = new Set([record.id, record.pcrId, record.pcrClientId, record.responseId, record.responseClientId].filter(Boolean));
      const rows = await getAllRecords('sync_queue');
      const matching = rows.filter(row => {
        const payload = row.payload || {};
        return row.entity_type === 'pcr'
          && row.destination === 'cloud'
          && (
            ids.has(row.entity_id)
            || ids.has(payload.id)
            || ids.has(payload.pcrId)
            || ids.has(payload.pcrClientId)
            || ids.has(payload.responseId)
            || ids.has(payload.responseClientId)
          );
      });
      const now = new Date().toISOString();
      await Promise.all(matching.map(row => putRecord('sync_queue', {
        ...row,
        attempts: 0,
        sync_status: 'pending',
        error_category: null,
        blocked_reason: null,
        last_sync_error: null,
        next_attempt_at: now,
        updated_at_device: now,
      })));
      toast.info(matching.length ? 'Uploading this PCR to cloud...' : 'No queued upload was found. Uploading PCR header directly...');
      const saved = await cloudClient.submitPcrHeader({
        ...record,
        status: 'Submitted',
        localStatus: record.localStatus || 'Submitted Locally',
        source: record.source || 'local_server',
      });
      const confirmed = await confirmCloudPcrUpload(saved, record);
      const syncedAt = new Date().toISOString();
      await putRecord('local_pcr_reports', {
        ...record,
        ...confirmed,
        id: record.id || confirmed.id,
        pcrId: confirmed.pcrId || confirmed.id || record.pcrId,
        localStatus: null,
        syncLabel: 'Cloud synced',
        sync_status: 'synced',
        synced_to_cloud: true,
        cloud_synced_at: syncedAt,
        updatedAt: confirmed.updatedAt || syncedAt,
      });
      await Promise.all(matching.map(row => putRecord('sync_queue', {
        ...row,
        sync_status: 'synced',
        synced_to_cloud: true,
        cloud_synced_at: syncedAt,
        last_sync_error: null,
        blocked_reason: null,
        next_attempt_at: null,
        updated_at_device: syncedAt,
      })));
      await loadReports({ silent: true });
      toast.success('PCR header uploaded to cloud. Records refreshed.');
    } catch (error) {
      toast.error(error.message || 'Unable to upload this PCR to cloud.');
    }
  };
  const statusCounts = {
    submitted: records.filter(record => !record.archived && isReviewable(record)).length,
    verified: records.filter(record => !record.archived && record.status === 'Verified').length,
    rejected: records.filter(record => !record.archived && record.status === 'Rejected').length,
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-foreground">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold flex gap-2 items-center"><FileText className="text-blue-500" />Patient Care Records</h1>
          <p className="text-xs text-muted-foreground">Unified records, review, verification, exports, and archival for Patient Care Reports.</p>
        </div>
        {canCreate && <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/admin/pcr/new')} className="px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold flex gap-2 items-center"><FilePlus2 size={16} />Create Manual PCR</button>
          <button onClick={() => navigate('/admin/dispatch/received')} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex gap-2 items-center"><FilePlus2 size={16} />Accept Dispatch for PCR</button>
        </div>}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
          <div className="text-xs text-muted-foreground">Pending Admin Review</div>
          <div className="mt-1 text-2xl font-bold text-blue-400">{statusCounts.submitted}</div>
        </div>
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4">
          <div className="text-xs text-muted-foreground">Verified</div>
          <div className="mt-1 text-2xl font-bold text-green-400">{statusCounts.verified}</div>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
          <div className="text-xs text-muted-foreground">Returned / Rejected</div>
          <div className="mt-1 text-2xl font-bold text-red-400">{statusCounts.rejected}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 mb-4 grid md:grid-cols-[1fr_auto_auto] gap-3">
        <label className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search response no., patient, place, hospital, or team" className="w-full pl-9 pr-3 py-2.5 bg-input-background border border-border rounded-lg text-sm" /></label>
        <label className="flex items-center gap-2"><Filter size={15} /><select value={status} onChange={event => setStatus(event.target.value)} className="bg-input-background border border-border rounded-lg px-3 py-2.5 text-sm">{['All', 'Draft', 'Sent to Field Officer', 'Submitted', 'Submitted Locally', 'Verified', 'Rejected', 'Dispatch Received Locally', 'PCR Draft Locally'].map(item => <option key={item}>{item}</option>)}</select></label>
        <div className="flex rounded-lg border border-border overflow-hidden">{['Active', 'Archived'].map(item => <button key={item} onClick={() => setArchiveView(item)} className={`px-4 py-2 text-xs font-semibold ${archiveView === item ? 'bg-blue-600 text-white' : 'bg-secondary'}`}>{item}</button>)}</div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? <div className="text-center py-16 text-sm text-muted-foreground">Loading Patient Care Records...</div> : <>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-xs uppercase"><tr>{['Response No.', 'Patient', 'Incident', 'Location', 'Dispatch', 'Status', 'Updated', 'Actions'].map(item => <th key={item} className="text-left px-4 py-3">{item}</th>)}</tr></thead>
            <tbody>{visibleRecords.map(record => <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer border-t border-border hover:bg-secondary/40">
              <td className="px-4 py-3 font-mono text-blue-400">{record.responseNumber}</td>
              <td className="px-4 py-3"><div className="font-semibold">{record.patientName || 'Unnamed patient'}</div><div className="text-xs text-muted-foreground">{record.age && `${record.age} yrs`} {record.gender}</div></td>
              <td className="px-4 py-3">{record.dateOfIncident}<div className="text-xs text-muted-foreground">{record.timeOfIncident}</div></td>
              <td className="px-4 py-3 max-w-52 truncate">{record.placeOfIncident || '-'}</td>
              <td className="px-4 py-3 text-xs">{record.dispatchId ? <span className="rounded-full bg-blue-500/15 px-2 py-1 font-semibold text-blue-400">Linked</span> : <span className="text-muted-foreground">Manual PCR</span>}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${isReviewable(record) ? 'bg-amber-500/15 text-amber-500' : record.status === 'Verified' ? 'bg-green-500/15 text-green-500' : record.status === 'Rejected' ? 'bg-red-500/15 text-red-500' : 'bg-slate-500/15 text-slate-400'}`}>{displayStatus(record)}</span>
                {record.syncLabel && <div className="mt-1 text-[10px] text-muted-foreground">{record.syncLabel}</div>}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(record.updatedAt).toLocaleString()}</td>
              <td className="px-4 py-3"><div className="flex gap-1" onClick={event => event.stopPropagation()}>
                <button onClick={() => setSelected(record)} title="View" className="p-2 hover:bg-blue-500/10 text-blue-400 rounded"><Eye size={15} /></button>
                {canCreate && <button onClick={() => edit(record)} title="Edit" className="p-2 hover:bg-amber-500/10 text-amber-400 rounded"><Edit3 size={15} /></button>}
                <button onClick={() => doPdf(record)} title="Download PDF" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><Download size={15} /></button>
                {needsCloudUpload(record) && <button onClick={() => uploadRecordToCloud(record)} title="Sync this PCR to cloud" aria-label="Sync this PCR to cloud" className="grid h-8 w-8 place-items-center rounded text-cyan-500 hover:bg-cyan-500/10"><RefreshCw size={15} /></button>}
                {canReview && isReviewable(record) && <button onClick={() => updateStatus(record, 'Verified')} title="Verify PCR" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><CheckCircle2 size={15} /></button>}
                {canReview && isReviewable(record) && <button onClick={() => setRejectingRecord(record)} title="Return for correction" className="p-2 hover:bg-red-500/10 text-red-400 rounded"><XCircle size={15} /></button>}
                {canCreate && <button onClick={() => archive(record)} title="Archive" className="p-2 hover:bg-red-500/10 text-red-400 rounded"><Archive size={15} /></button>}
              </div></td>
            </tr>)}</tbody>
          </table></div>
          {!filtered.length && <div className="text-center py-16"><FileText size={36} className="mx-auto text-muted-foreground/30 mb-3" /><p className="font-semibold">No Patient Care Records found</p><p className="text-xs text-muted-foreground mt-1">Adjust the current filters to broaden the results.</p></div>}
          {filtered.length > 0 && <div className="border-t border-border px-4 py-3 flex justify-between items-center text-xs text-muted-foreground"><span>Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="p-2 bg-secondary rounded disabled:opacity-40"><ChevronLeft size={14} /></button><span className="px-2 py-2">Page {page} of {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(value => value + 1)} className="p-2 bg-secondary rounded disabled:opacity-40"><ChevronRight size={14} /></button></div></div>}
        </>}
      </div>

      {selected && createPortal((
        <div className="fixed inset-0 z-[5000] flex items-start justify-center overflow-y-auto bg-black/70 p-3 md:p-5" role="dialog" aria-modal="true" onMouseDown={() => setSelected(null)}>
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card p-3">
              <div>
                <h2 className="font-bold">{selected.responseNumber}</h2>
                <p className="text-xs text-muted-foreground">{selected.patientName || 'Unnamed patient'}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {canReview && isReviewable(selected) && <button onClick={() => updateStatus(selected, 'Verified')} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs text-white"><CheckCircle2 size={14} />Verify</button>}
                {canReview && isReviewable(selected) && <button onClick={() => setRejectingRecord(selected)} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs text-white"><XCircle size={14} />Return</button>}
                {canCreate && <button onClick={() => edit(selected)} className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs"><Edit3 size={14} />Edit</button>}
                <button onClick={() => doPdf(selected)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white"><Download size={14} />PDF</button>
                <button onClick={() => setSelected(null)} aria-label="Close PCR preview" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground hover:bg-secondary/80"><X size={18} /></button>
              </div>
            </div>
            <div className="overflow-auto bg-slate-300 p-4">
              <div className="mx-auto max-w-[210mm] shadow-xl"><PrintablePCR record={selected} /></div>
            </div>
          </div>
        </div>
      ), document.body)}
      {rejectingRecord && (
        <div className="fixed inset-0 z-[5010] flex items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4">
              <h2 className="text-base font-bold text-foreground">Reject Patient Care Record</h2>
              <p className="mt-1 text-xs text-muted-foreground">{rejectingRecord.responseNumber}</p>
            </div>
            <label className="mb-2 block text-xs font-semibold text-muted-foreground">Reason for rejection</label>
            <textarea value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} rows={4} className="w-full resize-none rounded-lg border border-border bg-input-background p-3 text-sm text-foreground outline-none focus:border-red-500" placeholder="Explain what needs correction..." />
            <div className="mt-4 flex gap-2">
              <button onClick={() => { setRejectingRecord(null); setRejectionReason(''); }} className="flex-1 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground">Cancel</button>
              <button onClick={rejectRecord} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}
      {exportingRecord && <PrintablePCR record={exportingRecord} printOnly />}
    </div>
  );
}
