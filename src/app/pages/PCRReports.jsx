import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Download, Edit3, Eye, FilePlus2, FileText, Filter, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, ROLES } from '../access/rbac';
import { PrintablePCR } from '../components/PCRWidgets';
import { useAuth } from '../contexts/AuthContext';
import { CURRENT_USER, exportPCRToDocx, exportPCRToPdf, loadAuditLogs, loadPCRs, PCR_EDIT_KEY, setPCRs } from '../utils/pcrStorage';

export default function PCRReports() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [archiveView, setArchiveView] = useState('Active');
  const [selected, setSelected] = useState(null);
  const [exportingRecord, setExportingRecord] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const canCreate = can(PERMISSIONS.CREATE_PCR);

  useEffect(() => {
    try {
      const allRecords = loadPCRs();
      setRecords(user.role === ROLES.FIELD_OFFICER ? allRecords.filter(record => record.createdBy === CURRENT_USER.id) : allRecords);
    } catch {
      toast.error('Unable to load Patient Care Records.');
    } finally {
      setLoading(false);
    }
  }, [user.role]);

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
  const archive = record => {
    const nextRecord = { ...record, archived: !record.archived, updatedAt: new Date().toISOString() };
    setRecords(current => current.map(item => item.id === record.id ? nextRecord : item));
    setPCRs(loadPCRs().map(item => item.id === record.id ? nextRecord : item));
    setSelected(null);
    toast.success(nextRecord.archived ? 'Patient Care Record archived.' : 'Patient Care Record restored.');
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
  const doWord = async record => {
    try {
      await exportPCRToDocx(record);
      toast.success('Word document downloaded.');
    } catch {
      toast.error('Word export failed.');
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-foreground">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold flex gap-2 items-center"><FileText className="text-blue-500" />Patient Care Records</h1>
          <p className="text-xs text-muted-foreground">{user.role === ROLES.FIELD_OFFICER ? `Reports submitted by ${CURRENT_USER.name}` : 'View, search, filter, print, and download submitted Patient Care Reports.'}</p>
        </div>
        {canCreate && <button onClick={() => navigate('/admin/pcr/new')} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex gap-2 items-center"><FilePlus2 size={16} />Create PCR Report</button>}
      </div>

      <div className="bg-card border border-border rounded-xl p-3 mb-4 grid md:grid-cols-[1fr_auto_auto] gap-3">
        <label className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search response no., patient, place, hospital, or team" className="w-full pl-9 pr-3 py-2.5 bg-input-background border border-border rounded-lg text-sm" /></label>
        <label className="flex items-center gap-2"><Filter size={15} /><select value={status} onChange={event => setStatus(event.target.value)} className="bg-input-background border border-border rounded-lg px-3 py-2.5 text-sm">{['All', 'Draft', 'Submitted', 'Verified', 'Rejected'].map(item => <option key={item}>{item}</option>)}</select></label>
        <div className="flex rounded-lg border border-border overflow-hidden">{['Active', 'Archived'].map(item => <button key={item} onClick={() => setArchiveView(item)} className={`px-4 py-2 text-xs font-semibold ${archiveView === item ? 'bg-blue-600 text-white' : 'bg-secondary'}`}>{item}</button>)}</div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? <div className="text-center py-16 text-sm text-muted-foreground">Loading Patient Care Records...</div> : <>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-xs uppercase"><tr>{['Response No.', 'Patient', 'Incident', 'Location', 'Status', 'Updated', 'Actions'].map(item => <th key={item} className="text-left px-4 py-3">{item}</th>)}</tr></thead>
            <tbody>{visibleRecords.map(record => <tr key={record.id} className="border-t border-border hover:bg-secondary/40">
              <td className="px-4 py-3 font-mono text-blue-400">{record.responseNumber}</td>
              <td className="px-4 py-3"><div className="font-semibold">{record.patientName || 'Unnamed patient'}</div><div className="text-xs text-muted-foreground">{record.age && `${record.age} yrs`} {record.gender}</div></td>
              <td className="px-4 py-3">{record.dateOfIncident}<div className="text-xs text-muted-foreground">{record.timeOfIncident}</div></td>
              <td className="px-4 py-3 max-w-52 truncate">{record.placeOfIncident || '-'}</td>
              <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${record.status === 'Submitted' ? 'bg-amber-500/15 text-amber-500' : record.status === 'Verified' ? 'bg-green-500/15 text-green-500' : record.status === 'Rejected' ? 'bg-red-500/15 text-red-500' : 'bg-slate-500/15 text-slate-400'}`}>{record.status}</span></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(record.updatedAt).toLocaleString()}</td>
              <td className="px-4 py-3"><div className="flex gap-1">
                <button onClick={() => setSelected(record)} title="View" className="p-2 hover:bg-blue-500/10 text-blue-400 rounded"><Eye size={15} /></button>
                {canCreate && <button onClick={() => edit(record)} title="Edit" className="p-2 hover:bg-amber-500/10 text-amber-400 rounded"><Edit3 size={15} /></button>}
                <button onClick={() => doPdf(record)} title="Download PDF" className="p-2 hover:bg-green-500/10 text-green-400 rounded"><Download size={15} /></button>
                <button onClick={() => doWord(record)} title="Export Word" className="p-2 hover:bg-violet-500/10 text-violet-400 rounded"><Download size={15} /></button>
                {canCreate && <button onClick={() => archive(record)} title={record.archived ? 'Restore' : 'Archive'} className="p-2 hover:bg-red-500/10 text-red-400 rounded">{record.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>}
              </div></td>
            </tr>)}</tbody>
          </table></div>
          {!filtered.length && <div className="text-center py-16"><FileText size={36} className="mx-auto text-muted-foreground/30 mb-3" /><p className="font-semibold">No Patient Care Records found</p><p className="text-xs text-muted-foreground mt-1">Adjust the current filters to broaden the results.</p></div>}
          {filtered.length > 0 && <div className="border-t border-border px-4 py-3 flex justify-between items-center text-xs text-muted-foreground"><span>Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="p-2 bg-secondary rounded disabled:opacity-40"><ChevronLeft size={14} /></button><span className="px-2 py-2">Page {page} of {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(value => value + 1)} className="p-2 bg-secondary rounded disabled:opacity-40"><ChevronRight size={14} /></button></div></div>}
        </>}
      </div>

      {selected && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"><div className="bg-card border border-border rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col"><div className="p-3 border-b border-border flex justify-between items-center"><div><h2 className="font-bold">{selected.responseNumber}</h2><p className="text-xs text-muted-foreground">{selected.patientName || 'Unnamed patient'} · {loadAuditLogs(selected.id).length} audit events</p></div><div className="flex gap-2">{canCreate && <button onClick={() => edit(selected)} className="px-3 py-2 bg-secondary rounded-lg text-xs flex gap-1 items-center"><Edit3 size={14} />Edit</button>}<button onClick={() => doWord(selected)} className="px-3 py-2 bg-violet-600 text-white rounded-lg text-xs flex gap-1 items-center"><Download size={14} />Word</button><button onClick={() => doPdf(selected)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs flex gap-1 items-center"><Download size={14} />PDF</button><button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-secondary"><X size={18} /></button></div></div><div className="overflow-auto bg-slate-300 p-4"><div className="max-w-[210mm] mx-auto shadow-xl"><PrintablePCR record={selected} /></div></div></div></div>}
      {exportingRecord && <PrintablePCR record={exportingRecord} printOnly />}
    </div>
  );
}
