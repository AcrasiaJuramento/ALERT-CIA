import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FileText, Filter, MapPin, Navigation, Radio, Search } from "lucide-react";
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
import { hybridRepository } from "../api/hybrid-client";
import { getConnectionState, subscribeConnection } from "../network/connection-manager";
import { subscribeLiveSyncEvents } from "../network/live-sync-events";
import SyncStatusPanel from "../components/SyncStatusPanel";
import { formatDateAndTime } from "../utils/dateFormat";

const inputClass = "w-full rounded-lg border border-border bg-input-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-blue-500";
const CLOUD_REFRESH_MS = 30000;
const RECEIVED_STATUSES = [
  DISPATCH_STATUSES.SENT,
  DISPATCH_STATUSES.ACCEPTED,
  DISPATCH_STATUSES.PCR_IN_PROGRESS,
  DISPATCH_STATUSES.PCR_COMPLETED,
  "Sent to Field Officer",
  "Submitted",
  "Pending Admin Verification",
  "Returned for Correction",
  "Verified",
];
const ACTIVE_STATUS_KEYS = new Set([
  "sent_to_responding_team",
  "sent_to_field_officer",
  "accepted_by_responding_team",
  "pcr_in_progress",
  "submitted",
  "pending_admin_verification",
  "returned_for_correction",
]);
const BACK_TO_BASE_STATUS_KEYS = new Set(["back_to_base", "returned_to_base"]);
const RESOLVED_STATUS_KEYS = new Set(["pcr_completed", "verified", "completed", "resolved", "closed"]);
const RECEIVED_STATUS_KEYS = new Set([
  "sent_to_responding_team",
  "sent_to_field_officer",
  "assigned_locally",
  "accepted_by_responding_team",
  "pcr_in_progress",
  "pcr_completed",
  "submitted",
  "submitted_locally",
  "pending_admin_verification",
  "returned_for_correction",
  "verified",
  "completed",
  "resolved",
  "closed",
  "back_to_base",
  "returned_to_base",
  "dispatch_received_locally",
]);

function normalizeStatus(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasReceivedStatus(record = {}) {
  return RECEIVED_STATUSES.includes(record.status)
    || RECEIVED_STATUSES.includes(record.localStatus)
    || [record.status, record.localStatus].map(normalizeStatus).some(status => RECEIVED_STATUS_KEYS.has(status));
}

function joinValues(value) {
  if (Array.isArray(value)) return value.join(" ");
  if (value && typeof value === "object") return Object.values(value).join(" ");
  return value || "";
}

function isResolvedDispatch(record = {}, pcr = null) {
  return Boolean(
    record.resolvedAt
    || pcr?.resolvedAt
    || record.resolved_at
    || pcr?.resolved_at
    || [record.status, record.localStatus, pcr?.status, pcr?.localStatus]
      .map(normalizeStatus)
      .some(status => RESOLVED_STATUS_KEYS.has(status))
  );
}

function hasBackToBase(record = {}, pcr = null) {
  return Boolean(
    record.backToBase
    || pcr?.backToBase
    || pcr?.backToBaseTime
    || record.completedAt
    || pcr?.completedAt
    || record.completed_at
    || pcr?.completed_at
    || [record.status, record.localStatus, pcr?.status, pcr?.localStatus]
      .map(normalizeStatus)
      .some(status => BACK_TO_BASE_STATUS_KEYS.has(status))
  );
}

function workflowStage(record = {}, pcr = null) {
  if (isResolvedDispatch(record, pcr)) return "Resolved";
  if (hasBackToBase(record, pcr)) return "Back to Base";
  const active = [record.status, record.localStatus, pcr?.status, pcr?.localStatus]
    .map(normalizeStatus)
    .some(status => ACTIVE_STATUS_KEYS.has(status));
  return active ? "Active" : "All";
}

function canAcceptDispatch(record = {}, pcr = null) {
  return !pcr
    && !record.linkedPcrId
    && !isResolvedDispatch(record, pcr)
    && [DISPATCH_STATUSES.SENT, DISPATCH_STATUSES.ACCEPTED, "Sent to Field Officer"].includes(record.status);
}

function linkedPcrLabel(record = {}, pcr = null) {
  if (pcr) return pcr.responseNumber || pcr.pcrId || pcr.id || record.linkedPcrId || record.responseNumber || "Linked";
  if (record.linkedPcrId) return record.linkedPcrId;
  if (isResolvedDispatch(record, pcr)) return record.responseNumber ? `${record.responseNumber} PCR` : "Created";
  return "Not created";
}

function dispatchCoordinates(record = {}) {
  const latitude = Number(record.latitude ?? record.lat ?? record.location?.lat ?? record.location?.latitude);
  const longitude = Number(record.longitude ?? record.lng ?? record.lon ?? record.location?.lng ?? record.location?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
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
  const loadInFlightRef = useRef(false);
  const loadQueuedRef = useRef(false);
  const loadQueuedTimerRef = useRef(null);
  const intervalEffectStartedRef = useRef(false);
  const mountedRef = useRef(false);

  const loadRecords = useCallback(async ({ silent = false } = {}) => {
    if (loadInFlightRef.current) {
      loadQueuedRef.current = true;
      return;
    }
    loadInFlightRef.current = true;
    if (!silent) setLoading(true);
    setError("");
    try {
      const state = getConnectionState();
      const cloudRows = state.cloudOnline
        ? await listReceivedDispatchRecords({ limit: 100 }).catch(() => [])
        : [];
      const byDispatch = new Map();
      cloudRows.forEach(record => {
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
      if (!mountedRef.current) return;
      setRecords(rows);
      const cloudPairs = state.cloudOnline
        ? await (() => {
          const byResponse = new Map();
          const byDispatch = new Map();
          return listPCRReportsByResponses(rows.map(record => record.responseId))
            .then(async responsePcrRows => {
              responsePcrRows.forEach(pcr => byResponse.set(pcr.responseId, pcr));
              const missingDispatchIds = rows
                .filter(record => !byResponse.has(record.responseId))
                .map(record => record.dispatchId || record.id);
              const dispatchPcrRows = missingDispatchIds.length
                ? await listPCRReportsByDispatches(missingDispatchIds)
                : [];
              dispatchPcrRows.forEach(pcr => byDispatch.set(pcr.dispatchId, pcr));
              return rows.map(record => [
                record.responseId,
                byResponse.get(record.responseId) || byDispatch.get(record.dispatchId || record.id) || null,
              ]);
            })
            .catch(() => rows.map(record => [record.responseId, null]));
        })()
        : [];
      const pcrByResponse = new Map();
      cloudPairs.forEach(([responseId, pcr]) => {
        if (responseId && pcr) pcrByResponse.set(responseId, pcr);
      });
      const pairs = rows.map(record => [record.responseId, pcrByResponse.get(record.responseId) || null]);
      if (state.cloudOnline) {
        await hybridRepository.reconcileCloudPcrReports(pairs.map(([, pcr]) => pcr).filter(Boolean)).catch(() => 0);
      }
      if (!mountedRef.current) return;
      setLinkedPCRs(Object.fromEntries(pairs));
    } catch (requestError) {
      if (!mountedRef.current) return;
      setError(requestError.message || "Unable to load received dispatches.");
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
      loadInFlightRef.current = false;
      if (mountedRef.current && loadQueuedRef.current) {
        loadQueuedRef.current = false;
        window.clearTimeout(loadQueuedTimerRef.current);
        loadQueuedTimerRef.current = window.setTimeout(() => loadRecords({ silent: true }), 150);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadRecords();
    return () => {
      mountedRef.current = false;
      window.clearTimeout(loadQueuedTimerRef.current);
    };
  }, [loadRecords]);

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
  }, [loadRecords]);

  useEffect(() => {
    if (connection.mode === "offline") return undefined;
    if (intervalEffectStartedRef.current) loadRecords({ silent: true });
    intervalEffectStartedRef.current = true;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadRecords({ silent: true });
    }, CLOUD_REFRESH_MS);
    return () => clearInterval(interval);
  }, [connection.mode, loadRecords]);

  const received = useMemo(() => records.filter(record => {
    const pcr = linkedPCRs[record.responseId];
    const stage = workflowStage(record, pcr);
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
      || stage === statusFilter;
    return isReceived && matchesFilter && text.includes(query.toLowerCase());
  }), [records, linkedPCRs, query, statusFilter]);

  const filterCounts = useMemo(() => {
    const receivedRows = records.filter(hasReceivedStatus);
    const resolved = receivedRows.filter(record => workflowStage(record, linkedPCRs[record.responseId]) === "Resolved").length;
    return {
      active: receivedRows.filter(record => workflowStage(record, linkedPCRs[record.responseId]) === "Active").length,
      resolved,
      all: receivedRows.length,
    };
  }, [records, linkedPCRs]);

  const accept = async record => {
    try {
      const pcrId = await acceptDispatchByResponse(record.responseId);
      if (!pcrId) throw new Error("The dispatch was accepted, but its linked PCR ID was not returned.");
      toast.success("Dispatch accepted. Opening linked PCR report.");
      await loadRecords();
      const query = new URLSearchParams({ edit: pcrId, dispatch: record.dispatchId || record.id });
      const linkedResponseId = record.responseId || record.responseClientId;
      if (linkedResponseId) query.set("response", linkedResponseId);
      navigate(`/admin/pcr/new?${query.toString()}`);
    } catch (requestError) {
      toast.error(requestError.message || "Unable to accept dispatch.");
    }
  };

  const openPCR = record => {
    const pcr = linkedPCRs[record.responseId];
    const linkedPcrId = pcr?.id || pcr?.pcrId || record.linkedPcrId;
    if (linkedPcrId) {
      const query = new URLSearchParams({ edit: linkedPcrId, dispatch: record.dispatchId || record.id });
      const linkedResponseId = record.responseId || record.responseClientId;
      if (linkedResponseId) query.set("response", linkedResponseId);
      navigate(`/admin/pcr/new?${query.toString()}`);
    }
    else navigate(`/admin/pcr/new?dispatch=${record.dispatchId || record.id}`);
  };

  const completeResponse = async record => {
    try {
      await markResponseBackToBase(record.responseId);
      await loadRecords();
      toast.success("Back to base time recorded. Response is now resolved.");
    } catch (error) {
      toast.error(error.message || "Unable to mark this dispatch as resolved.");
    }
  };
  const openNavigation = record => {
    const coordinates = dispatchCoordinates(record);
    if (!coordinates) {
      toast.error("This dispatch does not have valid incident coordinates.");
      return;
    }
    sessionStorage.setItem('alert-cia-navigation-dispatch', JSON.stringify(record));
    const navigationId = record.dispatchId || record.id;
    navigate(navigationId ? `/admin/dispatch/navigation/${navigationId}` : '/admin/dispatch/navigation');
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
          const stage = workflowStage(record, pcr);
          const isResolved = stage === "Resolved";
          const hasPcrLink = Boolean(pcr || record.linkedPcrId);
          const displayStatus = stage === "All" ? record.status : stage;
          const visibleBackToBase = ["Back to Base", "Resolved"].includes(stage) ? (record.backToBase || pcr?.backToBase || pcr?.backToBaseTime || "-") : "-";
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
                  {!isResolved && <button onClick={() => openNavigation(record)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
                    <Navigation size={15} />Navigate
                  </button>}
                  {hasPcrLink || isResolved ? (
                    <>
                      <button onClick={() => openPCR(record)} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500">
                        <FileText size={15} />Open PCR
                      </button>
                      {stage === "Active" ? (
                        <button
                          onClick={() => completeResponse(record)}
                          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                        >
                          <CheckCircle2 size={15} />Back to Base
                        </button>
                      ) : (
                        <button disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-500 px-4 py-2 text-sm font-semibold text-white opacity-70">
                          <CheckCircle2 size={15} />{stage === "Back to Base" ? "Back to Base" : "Resolved"}
                        </button>
                      )}
                    </>
                  ) : canAcceptDispatch(record, pcr) ? (
                    <button onClick={() => accept(record)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
                      <CheckCircle2 size={15} />Accept Dispatch
                    </button>
                  ) : (
                    <button disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-500 px-4 py-2 text-sm font-semibold text-white opacity-70">
                      <CheckCircle2 size={15} />Awaiting PCR
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
                  ["Date / Time", formatDateAndTime(record.dateOfIncident, record.timeOfIncident)],
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
