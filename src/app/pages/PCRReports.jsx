import { useEffect, useMemo, useState } from 'react';
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
import { archivePCRReport, listPCRReports, savePCRReport } from '../services/supabase';

export default function PCRReports() {
  const { can } = useAuth();
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
  const pageSize = 10;
  const canCreate = can(PERMISSIONS.CREATE_PCR);
  const canReview = can(PERMISSIONS.REVIEW_PCR);

  const loadReports = async () => {
    setLoading(true);
    try {
      const allRecords = await listPCRReports({ limit: 300 });
      setRecords(allRecords.map(record => ({ ...record, archived: false })));
    } catch (error) {
      toast.error(error.message || 'Unable to load Patient Care Records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const filtered = useMemo(() => records.filter(record =>
    (archiveView === 'Archived' ? record.archived : !record.archived)
    && (status === 'All' || record.status === status)
    && [record.responseNumber, record.patientName, record.placeOfIncident, record.hospitalName, record.respondingTeam].join(' ').toLowerCase().includes(query.toLowerCase())
  ), [records, query, status, archiveView]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRecords = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [query, status, archiveView]);

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
        updatedAt: new Date().toISOString(),
      });
      setRecords(current => current.map(item => item.id === record.id ? nextRecord : item));
      setSelected(current => current?.id === record.id ? nextRecord : current);
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
  const statusCounts = {
    submitted: records.filter(record => !record.archived && record.status === 'Submitted').length,
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
        {canCreate && <button onClick={() => navigate('/admin/dispatch/received')} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex gap-2 items-center"><FilePlus2 size={16} />Accept Dispatch for PCR</button>}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
          <div className="text-xs text-muted-foreground">Pending Review</div>
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
        <label className="flex items-center gap-2"><Filter size={15} /><select value={status} onChange={event => setStatus(event.target.value)} className="bg-input-background border border-border rounded-lg px-3 py-2.5 text-sm">{['All', 'Draft', 'Submitted', 'Verified', 'Rejected'].map(item => <option key={item}>{item}</option>)}</select></label>
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
              <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${record.status === 'Submitted' ? 'bg-amber-500/15 text-amber-500' : record.status === 'Verified' ? 'bg-green-500/15 text-green-500' : record.status === 'Rejected' ? 'bg-red-500/15 text-red-500' : 'bg-slate-500/15 text-slate-400'}`}>{record.status}</span></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(record.updatedAt).toLocaleString()}</td>
              <td className="px-4 py-3"><div className="flex gap-1" onClick={event => event.stopPropagation()}>
                <button onClick={() => setSelected(record)} title="View" className="p-2 hover:bg-blue-500/10 text-blue-400 rounded"><Eye size={15} /></button>
                {canCreate && <button onClick={() => edit(record)} title="Edit" className="p-2 hover:bg-amber-500/10 text-amber-400 rounded"><Edit3 size={15} /></button>}
                <button onClick={() => doPdf(record)} title="Download PDF" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><Download size={15} /></button>
                {canReview && record.status === 'Submitted' && <button onClick={() => updateStatus(record, 'Verified')} title="Accept" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><CheckCircle2 size={15} /></button>}
                {canReview && record.status === 'Submitted' && <button onClick={() => setRejectingRecord(record)} title="Reject" className="p-2 hover:bg-red-500/10 text-red-400 rounded"><XCircle size={15} /></button>}
                {canCreate && <button onClick={() => archive(record)} title="Archive" className="p-2 hover:bg-red-500/10 text-red-400 rounded"><Archive size={15} /></button>}
              </div></td>
            </tr>)}</tbody>
          </table></div>
          {!filtered.length && <div className="text-center py-16"><FileText size={36} className="mx-auto text-muted-foreground/30 mb-3" /><p className="font-semibold">No Patient Care Records found</p><p className="text-xs text-muted-foreground mt-1">Adjust the current filters to broaden the results.</p></div>}
          {filtered.length > 0 && <div className="border-t border-border px-4 py-3 flex justify-between items-center text-xs text-muted-foreground"><span>Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="p-2 bg-secondary rounded disabled:opacity-40"><ChevronLeft size={14} /></button><span className="px-2 py-2">Page {page} of {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(value => value + 1)} className="p-2 bg-secondary rounded disabled:opacity-40"><ChevronRight size={14} /></button></div></div>}
        </>}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
          <div className="flex max-h-[95vh] w-full max-w-6xl flex-col rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border p-3">
              <div>
                <h2 className="font-bold">{selected.responseNumber}</h2>
                <p className="text-xs text-muted-foreground">{selected.patientName || 'Unnamed patient'}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {canReview && selected.status === 'Submitted' && <button onClick={() => updateStatus(selected, 'Verified')} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs text-white"><CheckCircle2 size={14} />Accept</button>}
                {canReview && selected.status === 'Submitted' && <button onClick={() => setRejectingRecord(selected)} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs text-white"><XCircle size={14} />Reject</button>}
                {canCreate && <button onClick={() => edit(selected)} className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs"><Edit3 size={14} />Edit</button>}
                <button onClick={() => doPdf(selected)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white"><Download size={14} />PDF</button>
                <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-secondary"><X size={18} /></button>
              </div>
            </div>
            <div className="overflow-auto bg-slate-300 p-4">
              <div className="mx-auto max-w-[210mm] shadow-xl"><PrintablePCR record={selected} /></div>
            </div>
          </div>
        </div>
      )}
      {rejectingRecord && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3">
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
