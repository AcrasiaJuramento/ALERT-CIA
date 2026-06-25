import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FileText, MapPin, Radio, Search } from "lucide-react";
import { toast } from "sonner";
import {
  DISPATCH_STATUSES,
} from "../utils/dispatchWorkflow";
import {
  acceptDispatchByResponse,
  getPCRReportByResponse,
  listDispatchRecords,
  markResponseBackToBase,
} from "../services/supabase";

const inputClass = "w-full rounded-lg border border-border bg-input-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-blue-500";

export default function ReceivedDispatches() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [linkedPCRs, setLinkedPCRs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const loadRecords = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listDispatchRecords({ limit: 200 });
      setRecords(rows);
      const pairs = await Promise.all(rows.map(async record => {
        try {
          const pcr = await getPCRReportByResponse(record.responseId);
          return [record.responseId, pcr];
        } catch {
          return [record.responseId, null];
        }
      }));
      setLinkedPCRs(Object.fromEntries(pairs));
    } catch (requestError) {
      setError(requestError.message || "Unable to load received dispatches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const received = useMemo(() => records.filter(record => {
    const isReceived = [
      DISPATCH_STATUSES.SENT,
      DISPATCH_STATUSES.ACCEPTED,
      DISPATCH_STATUSES.PCR_IN_PROGRESS,
      DISPATCH_STATUSES.PCR_COMPLETED,
    ].includes(record.status);
    const text = [
      record.responseNumber,
      record.team,
      record.placeOfIncident,
      record.barangay,
      record.callerName,
      record.callerContact,
      record.natureTypes?.join(" "),
    ].join(" ").toLowerCase();
    return isReceived && text.includes(query.toLowerCase());
  }), [records, query]);

  const accept = async record => {
    try {
      const pcrId = await acceptDispatchByResponse(record.responseId);
      toast.success("Dispatch accepted. Opening linked PCR report.");
      await loadRecords();
      navigate(`/admin/pcr/new?edit=${pcrId}`);
    } catch (requestError) {
      toast.error(requestError.message || "Unable to accept dispatch.");
    }
  };

  const openPCR = record => {
    const pcr = linkedPCRs[record.responseId];
    if (!pcr) {
      accept(record);
      return;
    }
    navigate(`/admin/pcr/new?edit=${pcr.id}`);
  };

  const completeResponse = async record => {
    try {
      await markResponseBackToBase(record.responseId);
      await loadRecords();
      toast.success("Response marked resolved. Back to base time was added to the PCR report.");
    } catch (error) {
      toast.error(error.message || "Unable to mark this dispatch as resolved.");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-foreground">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Radio className="text-blue-500" />Received Dispatches</h1>
          <p className="text-xs text-muted-foreground">Dispatches sent to responding teams. Accept a dispatch to generate and open its connected PCR Report.</p>
        </div>
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300">
          {received.length} active dispatches
        </div>
      </div>

      <label className="relative mb-4 block">
        <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search response number, responding team, location, caller, or incident type" className={`${inputClass} pl-9`} />
      </label>

      <div className="grid gap-4">
        {loading && <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">Loading received dispatches...</div>}
        {!loading && error && <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-red-400">{error}</div>}
        {!loading && !error && received.map(record => {
          const pcr = linkedPCRs[record.responseId];
          const isResolved = record.status === DISPATCH_STATUSES.PCR_COMPLETED || Boolean(record.resolvedAt);
          const incidentType = [...(record.natureTypes || []), record.otherMedical, record.otherTrauma].filter(Boolean).join(", ") || "Not specified";
          return (
            <article key={record.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-blue-400">{record.responseNumber}</span>
                    <span className="rounded-full bg-blue-500/15 px-2 py-1 text-[11px] font-semibold text-blue-400">{record.status}</span>
                    <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">{record.team || "No team"}</span>
                  </div>
                  <h2 className="text-base font-bold text-foreground">{incidentType}</h2>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={14} />{record.placeOfIncident || record.callerAddress || "No location entered"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pcr ? (
                    <>
                      <button onClick={() => openPCR(record)} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
                        <FileText size={15} />Open PCR
                      </button>
                      <button
                        onClick={() => completeResponse(record)}
                        disabled={isResolved}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${isResolved ? "cursor-not-allowed bg-slate-500 opacity-70" : "bg-blue-600 hover:bg-blue-500"}`}
                      >
                        <CheckCircle2 size={15} />{isResolved ? "Resolved" : "Back to Base"}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => accept(record)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
                      <CheckCircle2 size={15} />Accept Dispatch
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                {[
                  ["Barangay", record.barangay || "-"],
                  ["Dispatch Time", record.dispatchedTime || "-"],
                  ["Caller", record.callerName || "-"],
                  ["Caller Contact", record.callerContact || "-"],
                  ["Date / Time", `${record.dateOfIncident || "-"} ${record.timeOfIncident || ""}`],
                  ["Patient", record.patients?.[0]?.name || "-"],
                  ["Unit", record.vehicle || "-"],
                  ["Back to Base", record.backToBase || "-"],
                  ["Linked PCR", pcr?.responseNumber || "Not created"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                    <div className="mt-1 font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !error && !received.length && (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Radio size={36} className="mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-semibold">No dispatches received</p>
          <p className="mt-1 text-xs text-muted-foreground">Dispatches appear here after the dispatcher sends them to a responding team.</p>
        </div>
      )}
    </div>
  );
}
