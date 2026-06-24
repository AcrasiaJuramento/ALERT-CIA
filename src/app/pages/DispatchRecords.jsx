import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FilePlus2,
  FileText,
  Filter,
  Radio,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PERMISSIONS } from "../access/rbac";
import { useAuth } from "../contexts/AuthContext";
import {
  DISPATCH_EDIT_KEY,
  DISPATCH_STATUSES,
  findLinkedPCR,
  loadDispatchRecords,
  sendDispatchToRespondingTeam,
} from "../utils/dispatchWorkflow";

const statusClass = (status = "Draft") => {
  if (status.includes("PCR")) return "bg-green-500/15 text-green-500";
  if (status.includes("Accepted")) return "bg-emerald-500/15 text-emerald-400";
  if (status.includes("Sent") || status.includes("Progress")) return "bg-blue-500/15 text-blue-400";
  return "bg-slate-500/15 text-slate-400";
};

const formatDate = value => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export default function DispatchRecords() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const canCreate = can(PERMISSIONS.CREATE_DISPATCH);

  const refresh = () => setRecords(loadDispatchRecords());

  useEffect(() => {
    try {
      refresh();
    } catch {
      toast.error("Unable to load Dispatch Form Records.");
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = useMemo(() => records.filter(record => {
    const text = [
      record.responseNumber,
      record.callerName,
      record.placeOfIncident,
      record.team,
      record.vehicle,
      record.groupLeader,
      record.patients?.[0]?.name,
    ].join(" ").toLowerCase();
    return (status === "All" || record.status === status) && text.includes(query.toLowerCase());
  }), [records, query, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRecords = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [query, status]);

  const edit = record => {
    sessionStorage.setItem(DISPATCH_EDIT_KEY, record.id);
    navigate(`/admin/dispatch/new?edit=${record.id}`);
  };

  const openPCR = record => {
    const pcr = findLinkedPCR(record);
    if (!pcr) {
      toast.error("No linked PCR found. The responding team must accept this dispatch first.");
      return;
    }
    navigate(`/admin/pcr/new?edit=${pcr.id}`);
  };

  const send = record => {
    if (!record.team) {
      toast.error("Please select a responding team before sending this dispatch.");
      return;
    }
    const { dispatch } = sendDispatchToRespondingTeam(record);
    setRecords(current => current.map(item => item.id === dispatch.id ? dispatch : item));
    setSelected(current => current?.id === dispatch.id ? dispatch : current);
    toast.success("Dispatch sent to responding team.");
  };

  const counts = {
    draft: records.filter(record => record.status === "Draft").length,
    sent: records.filter(record => record.status?.includes("Sent") || record.status?.includes("Accepted") || record.status?.includes("Progress")).length,
    linked: records.filter(record => findLinkedPCR(record)).length,
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-foreground">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Radio className="text-blue-500" />Dispatch Form Records</h1>
          <p className="text-xs text-muted-foreground">Dispatcher incident intake, field handoff, and linked Patient Care Record tracking.</p>
        </div>
        {canCreate && (
          <button onClick={() => navigate("/admin/dispatch/new")} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">
            <FilePlus2 size={16} />Create Dispatch Form
          </button>
        )}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-500/20 bg-slate-500/10 p-4"><div className="text-xs text-muted-foreground">Draft Dispatches</div><div className="mt-1 text-2xl font-bold text-slate-300">{counts.draft}</div></div>
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4"><div className="text-xs text-muted-foreground">Sent / In Progress</div><div className="mt-1 text-2xl font-bold text-blue-400">{counts.sent}</div></div>
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4"><div className="text-xs text-muted-foreground">Linked PCRs</div><div className="mt-1 text-2xl font-bold text-green-400">{counts.linked}</div></div>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-[1fr_auto]">
        <label className="relative">
          <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search response no., caller, place, responding team, unit, or patient" className="w-full rounded-lg border border-border bg-input-background py-2.5 pl-9 pr-3 text-sm" />
        </label>
        <label className="flex items-center gap-2">
          <Filter size={15} />
          <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-border bg-input-background px-3 py-2.5 text-sm">
            {["All", ...Object.values(DISPATCH_STATUSES)].map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading Dispatch Form Records...</div> : <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                <tr>{["Response No.", "Incident", "Location / Barangay", "Responding Team / Unit", "Status", "Linked PCR", "Updated", "Actions"].map(item => <th key={item} className="px-4 py-3 text-left">{item}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRecords.map(record => {
                  const pcr = findLinkedPCR(record);
                  return (
                    <tr key={record.id} onClick={() => setSelected(record)} className="cursor-pointer border-t border-border hover:bg-secondary/40">
                      <td className="px-4 py-3 font-mono text-blue-400">{record.responseNumber || "Unnumbered"}</td>
                      <td className="px-4 py-3"><div className="font-semibold">{[...(record.natureTypes || []), record.otherMedical, record.otherTrauma].filter(Boolean).join(", ") || "Not specified"}</div><div className="text-xs text-muted-foreground">{record.dateOfIncident || "-"} {record.timeOfIncident || ""}</div></td>
                      <td className="max-w-56 px-4 py-3"><div className="truncate">{record.placeOfIncident || record.callerAddress || "-"}</div><div className="text-xs text-muted-foreground">{record.barangay || "No barangay"}</div></td>
                      <td className="px-4 py-3">{record.team || "-"}<div className="text-xs text-muted-foreground">{record.vehicle || "No unit"}</div></td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(record.status)}`}>{record.status || "Draft"}</span></td>
                      <td className="px-4 py-3 text-xs">{pcr ? <span className="font-semibold text-green-400">{pcr.responseNumber || pcr.id}</span> : <span className="text-muted-foreground">Not created</span>}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(record.updatedAt || record.createdAt)}</td>
                      <td className="px-4 py-3"><div className="flex gap-1" onClick={event => event.stopPropagation()}>
                        <button onClick={() => setSelected(record)} title="View dispatch" className="rounded p-2 text-blue-400 hover:bg-blue-500/10"><Eye size={15} /></button>
                        {canCreate && <button onClick={() => edit(record)} title="Edit dispatch" className="rounded p-2 text-amber-400 hover:bg-amber-500/10"><Edit3 size={15} /></button>}
                        <button onClick={() => openPCR(record)} title="Open linked PCR" className="rounded p-2 text-green-400 hover:bg-green-500/10"><FileText size={15} /></button>
                        {canCreate && record.status !== DISPATCH_STATUSES.SENT && !pcr && <button onClick={() => send(record)} title="Send to responding team" className="rounded p-2 text-cyan-400 hover:bg-cyan-500/10"><Send size={15} /></button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length && <div className="py-16 text-center"><Radio size={36} className="mx-auto mb-3 text-muted-foreground/30" /><p className="font-semibold">No Dispatch Form Records found</p><p className="mt-1 text-xs text-muted-foreground">Create a dispatch form or adjust the current filters.</p></div>}
          {filtered.length > 0 && <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground"><span>Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="rounded bg-secondary p-2 disabled:opacity-40"><ChevronLeft size={14} /></button><span className="px-2 py-2">Page {page} of {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(value => value + 1)} className="rounded bg-secondary p-2 disabled:opacity-40"><ChevronRight size={14} /></button></div></div>}
        </>}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="font-bold">{selected.responseNumber || "Dispatch Form"}</h2>
                <p className="text-xs text-muted-foreground">{selected.status || "Draft"} · {selected.placeOfIncident || "No location entered"}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-secondary"><X size={18} /></button>
            </div>
            <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
              {[
                ["Caller", selected.callerName || "-"],
                ["Contact", selected.callerContact || "-"],
                ["Patient", selected.patients?.[0]?.name || "-"],
                ["Incident Type", [...(selected.natureTypes || []), selected.otherMedical, selected.otherTrauma].filter(Boolean).join(", ") || "-"],
                ["Barangay", selected.barangay || "-"],
                ["Incident Date / Time", `${selected.dateOfIncident || "-"} ${selected.timeOfIncident || ""}`],
                ["Location", selected.placeOfIncident || selected.callerAddress || "-"],
                ["Responding Team / Unit", `${selected.team || "-"} / ${selected.vehicle || "-"}`],
                ["Group Leader", selected.groupLeader || "-"],
                ["Linked PCR", findLinkedPCR(selected)?.responseNumber || "Not created"],
              ].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-secondary/30 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-semibold text-foreground">{value}</div></div>)}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
              {canCreate && <button onClick={() => edit(selected)} className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2 text-xs"><Edit3 size={14} />Edit Dispatch</button>}
              <button onClick={() => openPCR(selected)} className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs text-white"><FileText size={14} />Open Linked PCR</button>
              {canCreate && selected.status !== DISPATCH_STATUSES.SENT && !findLinkedPCR(selected) && <button onClick={() => send(selected)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white"><Send size={14} />Send to Responding Team</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
