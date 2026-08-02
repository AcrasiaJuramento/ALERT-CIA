import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FileText, Filter, MapPin, Radio, Search } from "lucide-react";
import { toast } from "sonner";
import {
  DISPATCH_STATUSES,
} from "../utils/dispatchWorkflow";
import {
  acceptDispatchByResponse,
  listPCRReportsByDispatches,
  listPCRReportsByResponses,
  listReceivedDispatchRecords,
  markResponseBackToBase,
} from "../services/supabase";
import { localServerClient } from "../api/local-server-client";
import { hybridRepository } from "../api/hybrid-client";
import { getConnectionState, subscribeConnection } from "../network/connection-manager";
import { subscribeLiveSyncEvents } from "../network/live-sync-events";
import SyncStatusPanel from "../components/SyncStatusPanel";

const inputClass = "w-full rounded-lg border border-border bg-input-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-blue-500";
const LOCAL_REFRESH_MS = 15000;
const CLOUD_REFRESH_MS = 30000;
const RECEIVED_STATUSES = [
  DISPATCH_STATUSES.SENT,
  DISPATCH_STATUSES.ACCEPTED,
  DISPATCH_STATUSES.PCR_IN_PROGRESS,
  DISPATCH_STATUSES.PCR_COMPLETED,
  "Sent to Field Officer",
  "Sent to Responding Team Locally",
  "Submitted",
  "Submitted Locally",
  "Verified",
];

function hasReceivedStatus(record = {}) {
  return RECEIVED_STATUSES.includes(record.status) || RECEIVED_STATUSES.includes(record.localStatus);
}

function joinValues(value) {
  if (Array.isArray(value)) return value.join(" ");
  if (value && typeof value === "object") return Object.values(value).join(" ");
  return value || "";
}

function isResolvedDispatch(record = {}, pcr = null) {
  const terminalStatuses = new Set([
    DISPATCH_STATUSES.PCR_COMPLETED,
    "Submitted",
    "Submitted Locally",
    "Verified",
    "Completed",
  ]);

  return Boolean(
    record.resolvedAt
    || pcr?.resolvedAt
    || record.resolved_at
    || pcr?.resolved_at
    || record.backToBase
    || pcr?.backToBase
    || pcr?.backToBaseTime
    || record.completedAt
    || pcr?.completedAt
    || record.completed_at
    || pcr?.completed_at
    || terminalStatuses.has(record.status)
    || terminalStatuses.has(record.localStatus)
    || terminalStatuses.has(pcr?.status)
    || terminalStatuses.has(pcr?.localStatus)
  );
}

function canAcceptDispatch(record = {}, pcr = null) {
  return !pcr
    && !isResolvedDispatch(record, pcr)
    && [DISPATCH_STATUSES.SENT, DISPATCH_STATUSES.ACCEPTED, "Sent to Field Officer"].includes(record.status);
}

function linkedPcrLabel(record = {}, pcr = null) {
  if (pcr) return pcr.responseNumber || pcr.pcrId || pcr.id || record.linkedPcrId || record.responseNumber || "Linked";
  if (record.linkedPcrId) return record.linkedPcrId;
  if (isResolvedDispatch(record, pcr)) return record.responseNumber ? `${record.responseNumber} PCR` : "Created";
  return "Not created";
}

export default function ReceivedDispatches() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [linkedPCRs, setLinkedPCRs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [connection, setConnection] = useState(getConnectionState());

  const loadRecords = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const state = getConnectionState();
      const [localRows, cloudRows] = await Promise.all([
        localServerClient.listReceivedDispatches().catch(() => []),
        state.cloudOnline ? listReceivedDispatchRecords({ limit: 100 }).catch(() => []) : Promise.resolve([]),
      ]);
      const byDispatch = new Map();
      [...localRows, ...cloudRows].forEach(record => {
        const key = record.dispatchId || record.id || record.responseId;
        if (!key) return;
        const existing = byDispatch.get(key);
        byDispatch.set(key, {
          ...(existing || {}),
          ...record,
          source: record.source || existing?.source,
          localStatus: record.localStatus || existing?.localStatus,
        });
      });
      const rows = [...byDispatch.values()].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
      if (cloudRows.length) {
        await hybridRepository.reconcileCloudDispatches(rows).catch(() => 0);
      }
      setRecords(rows);
      const pairs = await (state.localOnline
        ? Promise.all(rows.map(async record => {
          try {
            const pcr = await localServerClient.getPcrByResponse(record.responseId);
            return [record.responseId, pcr];
          } catch {
            return [record.responseId, null];
          }
        }))
        : (() => {
          const byResponse = new Map();
          const byDispatch = new Map();
          return Promise.all([
            listPCRReportsByResponses(rows.map(record => record.responseId)),
            listPCRReportsByDispatches(rows.map(record => record.dispatchId || record.id)),
          ])
            .then(([responsePcrRows, dispatchPcrRows]) => {
              responsePcrRows.forEach(pcr => byResponse.set(pcr.responseId, pcr));
              dispatchPcrRows.forEach(pcr => byDispatch.set(pcr.dispatchId, pcr));
              return rows.map(record => [
                record.responseId,
                byResponse.get(record.responseId) || byDispatch.get(record.dispatchId || record.id) || null,
              ]);
            })
            .catch(() => rows.map(record => [record.responseId, null]));
        })());
      if (state.cloudOnline) {
        await hybridRepository.reconcileCloudPcrReports(pairs.map(([, pcr]) => pcr).filter(Boolean)).catch(() => 0);
      }
      setLinkedPCRs(Object.fromEntries(pairs));
    } catch (requestError) {
      setError(requestError.message || "Unable to load received dispatches.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  useEffect(() => subscribeConnection(setConnection), []);

  useEffect(() => {
    let timer;
    const unsubscribe = subscribeLiveSyncEvents(event => {
      if (!["dispatch_changed", "pcr_changed", "response_changed"].includes(event.type)) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => loadRecords({ silent: true }), 250);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (connection.mode === "offline") return undefined;
    loadRecords({ silent: true });
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadRecords({ silent: true });
    }, connection.mode === "cloud" ? CLOUD_REFRESH_MS : LOCAL_REFRESH_MS);
    return () => clearInterval(interval);
  }, [connection.mode]);

  const received = useMemo(() => records.filter(record => {
    const pcr = linkedPCRs[record.responseId];
    const isResolved = isResolvedDispatch(record, pcr);
    const isReceived = hasReceivedStatus(record);
    const text = [
      record.responseNumber,
      record.team,
      record.placeOfIncident,
      record.barangay,
      record.callerName,
      record.callerContact,
      joinValues(record.natureTypes),
    ].join(" ").toLowerCase();
    const matchesFilter = statusFilter === "All"
      || (statusFilter === "Active" && !isResolved)
      || (statusFilter === "Resolved" && isResolved);
    return isReceived && matchesFilter && text.includes(query.toLowerCase());
  }), [records, linkedPCRs, query, statusFilter]);

  const filterCounts = useMemo(() => {
    const receivedRows = records.filter(hasReceivedStatus);
    const resolved = receivedRows.filter(record => isResolvedDispatch(record, linkedPCRs[record.responseId])).length;
    return {
      active: receivedRows.length - resolved,
      resolved,
      all: receivedRows.length,
    };
  }, [records, linkedPCRs]);

  const accept = async record => {
    try {
      const localMode = getConnectionState().mode === "local";
      const result = localMode
        ? await localServerClient.acceptDispatchByResponse(record.responseId)
        : await acceptDispatchByResponse(record.responseId);
      const pcrId = localMode ? result.pcrId : result;
      if (localMode) {
        await hybridRepository.cacheAcceptedDispatch(
          { ...record, status: DISPATCH_STATUSES.PCR_IN_PROGRESS },
          result.pcr,
        );
      }
      toast.success(localMode ? "Dispatch accepted from local server. Opening offline-ready PCR." : "Dispatch accepted. Opening linked PCR report.");
      await loadRecords();
      navigate(localMode ? `/admin/pcr/new?dispatch=${record.id}` : `/admin/pcr/new?edit=${pcrId}`);
    } catch (requestError) {
      toast.error(requestError.message || "Unable to accept dispatch.");
    }
  };

  const openPCR = record => {
    const pcr = linkedPCRs[record.responseId];
    if (pcr?.id || pcr?.pcrId) navigate(`/admin/pcr/new?edit=${pcr.id || pcr.pcrId}`);
    else if (record.linkedPcrId) navigate(`/admin/pcr/new?edit=${record.linkedPcrId}`);
    else navigate(`/admin/pcr/new?dispatch=${record.dispatchId || record.id}`);
  };

  const completeResponse = async record => {
    try {
      const localMode = getConnectionState().mode === "local";
      if (localMode) {
        const result = await localServerClient.markResponseBackToBase(record.responseId);
        await hybridRepository.markPcrCompletedByResponse(record.responseId, result.pcr);
      } else {
        await markResponseBackToBase(record.responseId);
      }
      await loadRecords();
      toast.success(localMode ? "Back to base time recorded on the local server. Pending cloud synchronization." : "Back to base time recorded. Response is now resolved.");
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
          {filterCounts.active} active dispatches
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search response number, responding team, location, caller, or incident type" className={`${inputClass} pl-9`} />
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1">
          <Filter size={15} className="ml-2 text-muted-foreground" />
          {[
            ["Active", filterCounts.active],
            ["Resolved", filterCounts.resolved],
            ["All", filterCounts.all],
          ].map(([label, count]) => (
            <button
              key={label}
              onClick={() => setStatusFilter(label)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${statusFilter === label ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-secondary"}`}
            >
              {label} {count}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <SyncStatusPanel />
      </div>

      <div className="grid gap-4">
        {loading && <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">Loading received dispatches...</div>}
        {!loading && error && <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-red-400">{error}</div>}
        {!loading && !error && received.map(record => {
          const pcr = linkedPCRs[record.responseId];
          const isResolved = isResolvedDispatch(record, pcr);
          const displayStatus = isResolved ? "Resolved" : record.status;
          const visibleBackToBase = isResolved ? (record.backToBase || pcr?.backToBase || pcr?.backToBaseTime || "-") : "-";
          const incidentType = [...(record.natureTypes || []), record.otherMedical, record.otherTrauma].filter(Boolean).join(", ") || "Not specified";
          return (
            <article key={record.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-blue-400">{record.responseNumber}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${isResolved ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"}`}>{displayStatus}</span>
                    <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">{record.team || "No team"}</span>
                  </div>
                  <h2 className="text-base font-bold text-foreground">{incidentType}</h2>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={14} />{record.placeOfIncident || record.callerAddress || "No location entered"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pcr || isResolved ? (
                    <>
                      <button onClick={() => openPCR(record)} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
                        <FileText size={15} />Open PCR
                      </button>
                      {pcr ? (
                        <button
                          onClick={() => completeResponse(record)}
                          disabled={isResolved}
                          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${isResolved ? "cursor-not-allowed bg-slate-500 opacity-70" : "bg-blue-600 hover:bg-blue-500"}`}
                        >
                          <CheckCircle2 size={15} />{isResolved ? "Resolved" : "Back to Base"}
                        </button>
                      ) : (
                        <button disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-500 px-4 py-2 text-sm font-semibold text-white opacity-70">
                          <CheckCircle2 size={15} />Resolved
                        </button>
                      )}
                    </>
                  ) : canAcceptDispatch(record, pcr) ? (
                    <button onClick={() => accept(record)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
                      <CheckCircle2 size={15} />Accept Dispatch
                    </button>
                  ) : (
                    <button disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-500 px-4 py-2 text-sm font-semibold text-white opacity-70">
                      <CheckCircle2 size={15} />{isResolved ? "Resolved" : "Unavailable"}
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
                  ["Back to Base", visibleBackToBase],
                  ["Linked PCR", linkedPcrLabel(record, pcr)],
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
          <p className="mt-1 text-xs text-muted-foreground">Dispatches appear here after the dispatcher sends them to your assigned responding team.</p>
        </div>
      )}
    </div>
  );
}
