import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Archive, CheckCircle2, ChevronLeft, ChevronRight, Download, Edit3, Eye,
  FilePlus2, FileText, Filter, Search, X, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS } from '../access/rbac';
import { PrintablePCR } from '../components/PCRWidgets';
import { useAuth } from '../contexts/AuthContext';
import { exportPCRToPdf, PCR_EDIT_KEY } from '../utils/pcrStorage';
import { formatDateAndTime, formatLongDateTime } from '../utils/dateFormat';
import { archivePCRReport, createStandalonePCRShell, listPCRReports, listPCRWorkflowHistory, reviewReverseWorkflowAsAdmin, reviewStandalonePCR, savePCRReport, supabase } from '../services/supabase';

const PCR_WORKFLOW_FILTERS = ['All', 'Draft', 'In Progress', 'Pending Dispatcher Review', 'Accepted by Dispatcher', 'Pending Admin Verification', 'Returned to Field Officer', 'Returned for Correction', 'Submitted', 'Verified', 'Rejected', 'Completed'];
const displayStatus = record => record?.status || 'Draft';
const formatDateTime = value => formatLongDateTime(value);
const isReviewable = record => displayStatus(record) === 'Submitted';
const logicalRecordKey = record => record?.pcrId || record?.id || record?.responseId || record?.responseNumber;

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
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const refreshTimer = useRef(null);
  const pageSize = 20;
  const canCreate = can(PERMISSIONS.CREATE_PCR);
  const canReview = can(PERMISSIONS.REVIEW_PCR);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const cloudRecords = await listPCRReports({
        limit: pageSize,
        from: (page - 1) * pageSize,
        status: status === 'All' ? undefined : status,
      });
      setRecords(cloudRecords.map(record => ({ ...record, archived: false, recordSource: 'cloud', syncLabel: 'Cloud synced' })));
      setTotalCount(cloudRecords.totalCount ?? cloudRecords.length);
    } catch (error) {
      toast.error(error.message || 'Unable to load Patient Care Records.');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    loadReports();
    const refresh = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => loadReports(), 300);
    };
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    const channel = supabase?.channel('web-pcr-records-live').on('postgres_changes', { event: '*', schema: 'public', table: 'pcr_reports' }, refresh).subscribe();
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      clearTimeout(refreshTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadReports]);

  const filtered = useMemo(() => records.filter(record =>
    (archiveView === 'Archived' ? record.archived : !record.archived)
    && [record.responseNumber, record.patientName, record.placeOfIncident, record.hospitalName, record.respondingTeam].join(' ').toLowerCase().includes(query.toLowerCase())
  ), [records, query, archiveView]);
  const pageCount = Math.max(1, Math.ceil((query ? filtered.length : totalCount) / pageSize));
  const visibleRecords = filtered;

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
  useEffect(() => {
    if (!selected?.id || selected.workflowOrigin !== 'reverse') { setWorkflowHistory([]); return; }
    listPCRWorkflowHistory(selected.id).then(setWorkflowHistory).catch(() => setWorkflowHistory([]));
  }, [selected?.id, selected?.workflowOrigin]);

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
  const refreshAfter = async (operation, success) => {
    try {
      await operation();
      await loadReports();
      setSelected(null);
      toast.success(success);
    } catch (error) {
      toast.error(error.message || 'Unable to update Patient Care Record.');
    }
  };
  const createManual = async () => {
    try {
      const pcrId = await createStandalonePCRShell({ dateOfIncident: new Date().toISOString().slice(0, 10) });
      sessionStorage.setItem(PCR_EDIT_KEY, pcrId);
      navigate(`/admin/pcr/new?edit=${pcrId}`);
    } catch (error) { toast.error(error.message || 'Unable to create standalone PCR.'); }
  };
  const dispatcherDecision = (record, decision, remarks = '') => refreshAfter(
    () => reviewStandalonePCR(record.id, decision, remarks),
    decision === 'accept' ? 'PCR accepted. Create its connected Dispatch Form next.' : 'PCR returned to the Field Officer.',
  );
  const adminDecision = (record, decision, remarks = '') => refreshAfter(
    () => reviewReverseWorkflowAsAdmin(record.id, decision, remarks),
    decision === 'approve' ? 'PCR and Dispatch Form verified.' : 'Records returned for correction.',
  );
  const normalDecision = (record, decision, remarks = '') => refreshAfter(
    () => savePCRReport(record.id, { ...record, status: decision === 'approve' ? 'Verified' : 'Rejected', rejectionReason: remarks }),
    decision === 'approve' ? 'Patient Care Record verified.' : 'Patient Care Record returned for correction.',
  );
  const rejectRecord = () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection.');
      return;
    }
    if (rejectingRecord.workflowOrigin === 'reverse') {
      if (user?.role === 'dispatcher') dispatcherDecision(rejectingRecord, 'return', rejectionReason.trim());
      else adminDecision(rejectingRecord, 'return', rejectionReason.trim());
    } else normalDecision(rejectingRecord, 'return', rejectionReason.trim());
    setRejectingRecord(null);
    setRejectionReason('');
  };
  const statusCounts = {
    submitted: records.filter(record => !record.archived && ['Submitted', 'Pending Dispatcher Review', 'Pending Admin Verification'].includes(record.status)).length,
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
          <button onClick={createManual} className="px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-semibold flex gap-2 items-center"><FilePlus2 size={16} />Standalone / Manual PCR</button>
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
        <label className="flex items-center gap-2"><Filter size={15} /><select value={status} onChange={event => setStatus(event.target.value)} className="bg-input-background border border-border rounded-lg px-3 py-2.5 text-sm">{PCR_WORKFLOW_FILTERS.map(item => <option key={item}>{item}</option>)}</select></label>
        <div className="flex rounded-lg border border-border overflow-hidden">{['Active', 'Archived'].map(item => <button key={item} onClick={() => setArchiveView(item)} className={`px-4 py-2 text-xs font-semibold ${archiveView === item ? 'bg-blue-600 text-white' : 'bg-secondary'}`}>{item}</button>)}</div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? <div className="text-center py-16 text-sm text-muted-foreground">Loading Patient Care Records...</div> : <>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-xs uppercase"><tr>{['Response No.', 'Patient', 'Incident', 'Location', 'Dispatch', 'Status', 'Updated', 'Actions'].map(item => <th key={item} className="text-left px-4 py-3">{item}</th>)}</tr></thead>
            <tbody>{visibleRecords.map(record => <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer border-t border-border hover:bg-secondary/40">
              <td className="px-4 py-3 font-mono text-blue-400">{record.responseNumber}</td>
              <td className="px-4 py-3"><div className="font-semibold">{record.patientName || 'Unnamed patient'}</div><div className="text-xs text-muted-foreground">{record.age && `${record.age} yrs`} {record.gender}</div></td>
              <td className="px-4 py-3">{formatDateAndTime(record.dateOfIncident, record.timeOfIncident)}</td>
              <td className="px-4 py-3 max-w-52 truncate">{record.placeOfIncident || '-'}</td>
              <td className="px-4 py-3 text-xs"><div>{record.dispatchId ? <span className="rounded-full bg-blue-500/15 px-2 py-1 font-semibold text-blue-400">Linked</span> : <span className="text-muted-foreground">Unlinked</span>}</div><div className="mt-1 text-[10px] text-muted-foreground">{record.workflowLabel}</div></td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${isReviewable(record) ? 'bg-amber-500/15 text-amber-500' : record.status === 'Verified' ? 'bg-green-500/15 text-green-500' : record.status === 'Rejected' ? 'bg-red-500/15 text-red-500' : 'bg-slate-500/15 text-slate-400'}`}>{displayStatus(record)}</span>
                {record.syncLabel && <div className="mt-1 text-[10px] text-muted-foreground">{record.syncLabel}</div>}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(record.updatedAt)}</td>
              <td className="px-4 py-3"><div className="flex gap-1" onClick={event => event.stopPropagation()}>
                <button onClick={() => setSelected(record)} title="View" className="p-2 hover:bg-blue-500/10 text-blue-400 rounded"><Eye size={15} /></button>
                {canCreate && <button onClick={() => edit(record)} title="Edit" className="p-2 hover:bg-amber-500/10 text-amber-400 rounded"><Edit3 size={15} /></button>}
                <button onClick={() => doPdf(record)} title="Download PDF" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><Download size={15} /></button>
                {user?.role === 'dispatcher' && record.status === 'Pending Dispatcher Review' && <button onClick={() => dispatcherDecision(record, 'accept')} title="Accept PCR" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><CheckCircle2 size={15} /></button>}
                {user?.role === 'dispatcher' && record.status === 'Pending Dispatcher Review' && <button onClick={() => setRejectingRecord(record)} title="Return for correction" className="p-2 hover:bg-red-500/10 text-red-400 rounded"><XCircle size={15} /></button>}
                {user?.role === 'dispatcher' && record.status === 'Accepted by Dispatcher' && <button onClick={() => navigate(`/admin/dispatch/new?sourcePcr=${record.id}`)} title="Create connected Dispatch Form" className="p-2 hover:bg-blue-500/10 text-blue-400 rounded"><FilePlus2 size={15} /></button>}
                {user?.role === 'administrator' && record.status === 'Pending Admin Verification' && <button onClick={() => adminDecision(record, 'approve')} title="Verify connected records" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><CheckCircle2 size={15} /></button>}
                {user?.role === 'administrator' && record.status === 'Pending Admin Verification' && <button onClick={() => setRejectingRecord(record)} title="Return for correction" className="p-2 hover:bg-red-500/10 text-red-400 rounded"><XCircle size={15} /></button>}
                {canReview && record.workflowOrigin !== 'reverse' && isReviewable(record) && <button onClick={() => normalDecision(record, 'approve')} title="Verify PCR" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><CheckCircle2 size={15} /></button>}
                {canReview && record.workflowOrigin !== 'reverse' && isReviewable(record) && <button onClick={() => setRejectingRecord(record)} title="Return for correction" className="p-2 hover:bg-red-500/10 text-red-400 rounded"><XCircle size={15} /></button>}
                {canCreate && <button onClick={() => archive(record)} title="Archive" className="p-2 hover:bg-red-500/10 text-red-400 rounded"><Archive size={15} /></button>}
              </div></td>
            </tr>)}</tbody>
          </table></div>
          {!filtered.length && <div className="text-center py-16"><FileText size={36} className="mx-auto text-muted-foreground/30 mb-3" /><p className="font-semibold">No Patient Care Records found</p><p className="text-xs text-muted-foreground mt-1">Adjust the current filters to broaden the results.</p></div>}
          {filtered.length > 0 && <div className="border-t border-border px-4 py-3 flex justify-between items-center text-xs text-muted-foreground"><span>Showing {(page - 1) * pageSize + 1}-{Math.min((page - 1) * pageSize + visibleRecords.length, query ? filtered.length : totalCount)} of {query ? filtered.length : totalCount}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="p-2 bg-secondary rounded disabled:opacity-40"><ChevronLeft size={14} /></button><span className="px-2 py-2">Page {page} of {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(value => value + 1)} className="p-2 bg-secondary rounded disabled:opacity-40"><ChevronRight size={14} /></button></div></div>}
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
                {user?.role === 'dispatcher' && selected.status === 'Pending Dispatcher Review' && <button onClick={() => dispatcherDecision(selected, 'accept')} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs text-white"><CheckCircle2 size={14} />Accept</button>}
                {user?.role === 'dispatcher' && selected.status === 'Accepted by Dispatcher' && <button onClick={() => navigate(`/admin/dispatch/new?sourcePcr=${selected.id}`)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white"><FilePlus2 size={14} />Create Dispatch</button>}
                {user?.role === 'administrator' && selected.status === 'Pending Admin Verification' && <button onClick={() => adminDecision(selected, 'approve')} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs text-white"><CheckCircle2 size={14} />Verify Both</button>}
                {canReview && ['Pending Dispatcher Review', 'Pending Admin Verification'].includes(selected.status) && <button onClick={() => setRejectingRecord(selected)} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs text-white"><XCircle size={14} />Return</button>}
                {canReview && selected.workflowOrigin !== 'reverse' && isReviewable(selected) && <button onClick={() => normalDecision(selected, 'approve')} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs text-white"><CheckCircle2 size={14} />Verify</button>}
                {canReview && selected.workflowOrigin !== 'reverse' && isReviewable(selected) && <button onClick={() => setRejectingRecord(selected)} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs text-white"><XCircle size={14} />Return</button>}
                {canCreate && <button onClick={() => edit(selected)} className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs"><Edit3 size={14} />Edit</button>}
                <button onClick={() => doPdf(selected)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white"><Download size={14} />PDF</button>
                <button onClick={() => setSelected(null)} aria-label="Close PCR preview" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground hover:bg-secondary/80"><X size={18} /></button>
              </div>
            </div>
            {selected.workflowOrigin === 'reverse' && <div className="border-b border-border bg-card px-4 py-3"><div className="mb-2 text-xs font-bold uppercase text-muted-foreground">Workflow History</div><div className="flex gap-2 overflow-x-auto">{workflowHistory.map(entry => <div key={entry.id} className="min-w-56 rounded-lg border border-border bg-secondary/50 p-3 text-xs"><div className="font-semibold text-foreground">{entry.newStatus?.replaceAll('_', ' ')}</div><div className="mt-1 text-muted-foreground">{entry.actor} · {formatDateTime(entry.timestamp)}</div>{entry.remarks && <div className="mt-1 text-amber-400">{entry.remarks}</div>}</div>)}</div></div>}
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
