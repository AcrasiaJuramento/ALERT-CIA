import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import DispatchPreviewModal from "../components/DispatchWidgets";
import { PrintablePCR } from "../components/PCRWidgets";
import { toast } from "sonner";
import { PERMISSIONS } from "../access/rbac";
import { useAuth } from "../contexts/AuthContext";
import {
  DISPATCH_EDIT_KEY,
  DISPATCH_STATUSES,
} from "../utils/dispatchWorkflow";
import { hybridRepository } from "../api/hybrid-client";
import { cloudClient } from "../api/cloud-client";
import { localServerClient } from "../api/local-server-client";
import { getConnectionState, subscribeConnection } from "../network/connection-manager";
import { subscribeLiveSyncEvents } from "../network/live-sync-events";
import { getPCRReportByResponse, listDispatchRecords, listPCRReportsByResponses } from "../services/supabase";
import { getAllRecords, putRecord } from "../db/indexed-db";
import { formatDateAndTime, formatLongDateTime } from "../utils/dateFormat";

const statusClass = (status = "Draft") => {
  if (status.includes("PCR")) return "bg-green-500/15 text-green-500";
  if (status.includes("Submitted")) return "bg-amber-500/15 text-amber-500";
  if (status.includes("Verified")) return "bg-green-500/15 text-green-500";
  if (status.includes("Accepted")) return "bg-emerald-500/15 text-emerald-400";
  if (status.includes("Sent") || status.includes("Progress")) return "bg-blue-500/15 text-blue-400";
  return "bg-slate-500/15 text-slate-400";
};

const formatDate = value => {
  if (!value) return "-";
  const normalized = typeof value === "object"
    ? value.toDate?.() || value.toISOString?.() || value.updated_at || value.created_at
    : value;
  return formatLongDateTime(normalized);
};

const SOURCE_RANK = {
  device: 1,
  local_server: 2,
  cloud: 3,
};
const LOCAL_REFRESH_MS = 15000;
const CLOUD_REFRESH_MS = 30000;
const DISPATCH_FILTER_STATUSES = [
  "All",
  "Draft",
  "Sent to Field Officer",
  "Sent to Responding Team",
  "Sent to Responding Team Locally",
  "Accepted by Responding Team",
  "PCR In Progress",
  "PCR Completed",
  "Submitted",
  "Submitted Locally",
  "Pending Admin Verification",
  "Returned for Correction",
  "Verified",
  "Cancelled",
];

function displayStatus(record, linkedPcr = null) {
  const pcrStatus = linkedPcr?.recordSource === "cloud"
    ? linkedPcr?.status
    : linkedPcr?.localStatus || linkedPcr?.status;
  if (["Submitted", "Submitted Locally", "Verified"].includes(pcrStatus)) return pcrStatus;
  return record.localStatus || record.status || "Draft";
}

function needsCloudUpload(record = {}, linkedPcr = null) {
  const statusText = String(record.status || "").toLowerCase();
  const localStatusText = String(record.localStatus || "").toLowerCase();
  const syncText = String(record.syncLabel || record.sync_status || "").toLowerCase();
  const displayText = String(displayStatus(record, linkedPcr) || "").toLowerCase();
  const hasLinkedPcr = Boolean(linkedPcr || record.linkedPcrId || record.pcr);
  const linkedPcrSource = String(linkedPcr?.recordSource || linkedPcr?.source || "").toLowerCase();
  const linkedPcrSyncText = String(linkedPcr?.syncLabel || linkedPcr?.sync_status || "").toLowerCase();
  const linkedPcrNeedsCloud = Boolean(linkedPcr)
    && linkedPcrSource !== "cloud"
    && (
      !linkedPcr?.synced_to_cloud
      || linkedPcrSyncText.includes("pending")
      || linkedPcrSyncText.includes("saved on local server")
      || String(linkedPcr.localStatus || "").toLowerCase().includes("locally")
    );
  if (linkedPcrNeedsCloud) return true;
  const cloudSynced = record.synced_to_cloud === true || syncText.includes("cloud synced");
  if (cloudSynced && !syncText.includes("pending")) return false;
  return (
      syncText.includes("pending")
      || syncText.includes("saved on local server")
      || localStatusText.includes("submitted locally")
      || localStatusText.includes("pcr completed locally")
      || statusText.includes("submitted locally")
      || statusText.includes("pcr completed")
      || displayText.includes("submitted locally")
      || displayText.includes("pcr completed")
      || (hasLinkedPcr && record.recordSource === "local_server")
    );
}

function dispatchStatusRank(record = {}) {
  const status = record.localStatus || record.status || "";
  if (status.includes("Verified")) return 8;
  if (status.includes("Pending Admin Verification")) return 7;
  if (status.includes("Returned for Correction")) return 6;
  if (status.includes("PCR Completed")) return 5;
  if (status.includes("Submitted")) return 5;
  if (status.includes("PCR In Progress")) return 4;
  if (status.includes("Accepted")) return 3;
  if (status.includes("Sent")) return 2;
  if (status.includes("Dispatched")) return 1;
  return 0;
}

function logicalDispatchKey(record = {}) {
  // A response can have more than one dispatch form. Keep each dispatch form
  // distinct so a verified record is not hidden by a draft for the response.
  return record.dispatchId
    || record.id
    || record.dispatchClientId
    || record.responseClientId
    || record.responseId;
}

function normalizeKeyPart(value) {
  return String(value || "").trim().toLowerCase();
}

function pcrPatientKey(record = {}) {
  return [
    normalizeKeyPart(record.patientName),
    normalizeKeyPart(record.dateOfIncident),
    normalizeKeyPart(record.timeOfIncident),
    normalizeKeyPart(record.latitude || "").slice(0, 8),
    normalizeKeyPart(record.longitude || "").slice(0, 8),
  ].filter(Boolean).join("|");
}

function dispatchPreviewRecord(record = {}, pcr = null) {
  if (!pcr) return { ...record, linkedPcr: null, pcr: null };
  const pcrPatient = {
    name: pcr.patientName || "",
    age: pcr.age || "",
    birthdate: pcr.birthday || pcr.birthdate || "",
    gender: pcr.gender || "",
    address: pcr.address || "",
    assessmentFindings: pcr.chiefComplaint || "",
  };
  const patients = record.patients?.length
    ? record.patients.map((patient, index) => index ? patient : Object.fromEntries(
      [...new Set([...Object.keys(pcrPatient), ...Object.keys(patient)])]
        .map(key => [key, patient[key] || pcrPatient[key] || ""]),
    ))
    : [pcrPatient];
  return {
    ...pcr,
    ...record,
    team: record.team || pcr.team || pcr.respondingTeam || "",
    vehicle: record.vehicle || pcr.vehicle || "",
    driver: record.driver || pcr.driver || "",
    mainAider: record.mainAider || pcr.mainAider || "",
    groupLeader: record.groupLeader || pcr.groupLeader || "",
    assistantAider: record.assistantAider || pcr.assistantAider || "",
    callerName: record.callerName || pcr.callerName || pcr.contactPerson || "",
    callerAddress: record.callerAddress || pcr.callerAddress || pcr.contactAddress || "",
    callerContact: record.callerContact || pcr.callerContact || pcr.contactNumber || "",
    placeOfIncident: record.placeOfIncident || pcr.placeOfIncident || pcr.locationText || "",
    locationText: record.locationText || pcr.locationText || pcr.placeOfIncident || "",
    barangay: record.barangay || pcr.barangay || "",
    barangayId: record.barangayId || pcr.barangayId || null,
    latitude: record.latitude || pcr.latitude || "",
    longitude: record.longitude || pcr.longitude || "",
    locationGeography: record.locationGeography || pcr.locationGeography || "",
    patients,
    linkedPcr: pcr,
    pcr,
  };
}

function samePcrRecord(local = {}, cloud = {}) {
  const localKeys = [
    local.id,
    local.pcrId,
    local.pcrClientId,
    local.responseId,
    local.responseClientId,
  ].filter(Boolean).map(String);
  const cloudKeys = [
    cloud.id,
    cloud.pcrId,
    cloud.pcrClientId,
    cloud.responseId,
    cloud.responseClientId,
  ].filter(Boolean).map(String);
  if (localKeys.some(key => cloudKeys.includes(key))) return true;
  const responseNumber = normalizeKeyPart(local.responseNumber);
  if (responseNumber && responseNumber === normalizeKeyPart(cloud.responseNumber)) {
    const localPatientKey = pcrPatientKey(local);
    const cloudPatientKey = pcrPatientKey(cloud);
    return !localPatientKey || !cloudPatientKey || localPatientKey === cloudPatientKey;
  }
  return false;
}

async function confirmCloudPcrUpload(savedRecord, fallbackRecord) {
  const responseId = savedRecord?.responseId || fallbackRecord?.responseId;
  if (!responseId) throw new Error("Cloud upload did not return a response ID.");
  const confirmed = await getPCRReportByResponse(responseId);
  if (!confirmed?.id && !confirmed?.pcrId) {
    throw new Error("PCR upload was attempted, but Supabase did not return the PCR record.");
  }
  return {
    ...fallbackRecord,
    ...savedRecord,
    ...confirmed,
    responseId: confirmed.responseId || savedRecord.responseId || fallbackRecord.responseId,
    pcrId: confirmed.pcrId || confirmed.id || savedRecord.pcrId || savedRecord.id || fallbackRecord.pcrId,
  };
}

function mergeDispatchRecords(records) {
  const byId = new Map();
  for (const record of records) {
    const id = logicalDispatchKey(record);
    if (!id) continue;
    const current = byId.get(id);
    const recordStatusRank = dispatchStatusRank(record);
    const currentStatusRank = dispatchStatusRank(current);
    const recordSourceRank = SOURCE_RANK[record.recordSource] || 0;
    const currentSourceRank = SOURCE_RANK[current?.recordSource] || 0;
    if (!current || recordStatusRank > currentStatusRank || (recordStatusRank === currentStatusRank && recordSourceRank >= currentSourceRank)) {
      const cloudWinner = record.recordSource === "cloud";
      const hasPendingLocal = [record, current].some(item => item && item.recordSource === "device" && item.synced_to_cloud !== true);
      byId.set(id, {
        ...current,
        ...record,
        localStatus: cloudWinner && !hasPendingLocal ? null : recordStatusRank >= currentStatusRank ? record.localStatus : current?.localStatus,
        status: recordStatusRank >= currentStatusRank ? record.status : current?.status,
        syncLabel: hasPendingLocal ? "Pending cloud synchronization" : cloudWinner ? "Cloud synced" : record.syncLabel || current?.syncLabel,
        id: record.id || current?.id || id,
        dispatchId: record.dispatchId || current?.dispatchId || record.id || id,
        updatedAt: record.updatedAt || record.updated_at_device || record.updated_at || current?.updatedAt || new Date().toISOString(),
      });
    }
  }
  return [...byId.values()].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

export default function DispatchRecords() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [records, setRecords] = useState([]);
  const [linkedPCRs, setLinkedPCRs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [archiveView, setArchiveView] = useState("Active");
  const [selected, setSelected] = useState(null);
  const [selectedPcr, setSelectedPcr] = useState(null);
  const [connection, setConnection] = useState(getConnectionState());
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const canCreate = can(PERMISSIONS.CREATE_DISPATCH);

  const refresh = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const mode = getConnectionState().mode;
      const cloudRows = await listDispatchRecords({ limit: 50 }).catch(error => {
        if (mode === "cloud") throw error;
        return [];
      });
      const localDeviceRows = await hybridRepository.getLocalDispatchRecords().catch(() => []);
      const localServerRows = getConnectionState().localOnline
        ? await localServerClient.listDispatches().catch(() => [])
        : [];
      if (cloudRows.length) {
        await hybridRepository.reconcileCloudDispatches(cloudRows).catch(() => 0);
      }
      const reconciledLocalRows = cloudRows.length
        ? await hybridRepository.getLocalDispatchRecords().catch(() => localDeviceRows)
        : localDeviceRows;
      const localDeviceById = new Map(reconciledLocalRows.map(record => [record.id || record.dispatchId, record]));
      await Promise.all(localServerRows
        .filter(record => record.status === DISPATCH_STATUSES.PCR_COMPLETED || record.localStatus === "PCR Completed Locally" || record.status === "Submitted Locally" || record.localStatus === "Submitted Locally")
        .filter(record => {
          const cached = localDeviceById.get(record.id || record.dispatchId);
          return !cached
            || !["PCR Completed Locally", "Submitted Locally"].includes(displayStatus(cached))
            || String(cached.updatedAt || "") !== String(record.updatedAt || "");
        })
        .map(record => hybridRepository.cacheCompletedDispatch(record).catch(() => null)));
      const localPcrRows = await hybridRepository.getLocalPcrReports().catch(() => []);
      const localServerPcrRows = getConnectionState().localOnline
        ? await localServerClient.listPcrReports().catch(() => [])
        : [];
      const rows = mergeDispatchRecords([
        ...reconciledLocalRows.map(record => ({ ...record, recordSource: "device" })),
        ...localServerRows.map(record => ({ ...record, recordSource: "local_server" })),
        ...cloudRows.map(record => ({ ...record, recordSource: "cloud" })),
      ]);
      setRecords(rows);
      const cloudPcrByResponse = new Map();
      if (mode === "cloud") {
        const responseIds = rows.map(record => record.responseId).filter(Boolean);
        const cloudPcrRows = await listPCRReportsByResponses(responseIds).catch(() => []);
        cloudPcrRows.forEach(pcr => cloudPcrByResponse.set(pcr.responseId, { ...pcr, recordSource: "cloud", syncLabel: "Cloud synced" }));
      }
      const pairs = await Promise.all(rows.map(async record => {
        if (cloudPcrByResponse.has(record.responseId)) return [record.responseId, cloudPcrByResponse.get(record.responseId)];
        const localPcr = [...localServerPcrRows, ...localPcrRows]
          .find(pcr => pcr.responseId === record.responseId || pcr.response_id === record.responseId);
        if (localPcr) {
          const cloudEquivalent = localPcrRows.find(pcr =>
            (pcr.synced_to_cloud || String(pcr.syncLabel || pcr.sync_status || "").toLowerCase().includes("cloud synced"))
            && samePcrRecord(localPcr, pcr)
          );
          if (cloudEquivalent) return [record.responseId, { ...cloudEquivalent, recordSource: "cloud", syncLabel: "Cloud synced" }];
        }
        return [record.responseId, localPcr ? {
          ...localPcr,
          recordSource: localPcr.recordSource || localPcr.source || "local_server",
          syncLabel: localPcr.syncLabel || "Saved on local server",
        } : null];
      }));
      setLinkedPCRs(Object.fromEntries(pairs));
    } catch (requestError) {
      setError(requestError.message || "Unable to load Dispatch Form Records.");
      toast.error(requestError.message || "Unable to load Dispatch Form Records.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => subscribeConnection(setConnection), []);

  useEffect(() => {
    let timer;
    const unsubscribe = subscribeLiveSyncEvents(event => {
      if (!["dispatch_changed", "pcr_changed", "response_changed"].includes(event.type)) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => refresh({ silent: true }), 250);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    refresh();
    if (connection.mode === "offline") return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh({ silent: true });
    }, connection.mode === "cloud" ? CLOUD_REFRESH_MS : LOCAL_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [connection.mode]);

  const filtered = useMemo(() => records.filter(record => {
    const derivedStatus = displayStatus(record, linkedPCRs[record.responseId]);
    const archived = Boolean(record.archived || record.deleted_at || record.deletedAt);
    const text = [
      record.responseNumber,
      record.callerName,
      record.placeOfIncident,
      record.team,
      record.vehicle,
      record.groupLeader,
      record.patients?.[0]?.name,
    ].join(" ").toLowerCase();
    return (archiveView === "Archived" ? archived : !archived)
      && (status === "All" || record.status === status || record.localStatus === status || derivedStatus === status)
      && text.includes(query.toLowerCase());
  }), [records, linkedPCRs, query, status, archiveView]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRecords = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [query, status, archiveView]);

  const edit = record => {
    sessionStorage.setItem(DISPATCH_EDIT_KEY, record.id);
    navigate(`/admin/dispatch/new?edit=${record.id}`);
  };

  const resolveLinkedPcr = async record => {
    const cached = linkedPCRs[record.responseId];
    if (cached) return cached;
    if (record.responseId) {
      const cloudPcr = await getPCRReportByResponse(record.responseId).catch(() => null);
      if (cloudPcr) return { ...cloudPcr, recordSource: "cloud", syncLabel: "Cloud synced" };
      const localPcr = await localServerClient.getPcrByResponse(record.responseId).catch(() => null);
      if (localPcr) return localPcr;
    }
    const localPcrRows = await hybridRepository.getLocalPcrReports().catch(() => []);
    return localPcrRows.find(pcr =>
      pcr.responseId === record.responseId
      || pcr.responseClientId === record.responseClientId
      || pcr.dispatchId === record.dispatchId
      || pcr.dispatchId === record.id
      || pcr.id === record.linkedPcrId
      || pcr.pcrId === record.linkedPcrId
    ) || null;
  };

  const openPCR = async record => {
    const pcr = await resolveLinkedPcr(record);
    if (!pcr) {
      toast.error("No linked PCR found. The responding team must accept this dispatch first.");
      return;
    }
    setSelectedPcr(pcr);
  };

  const counts = {
    draft: records.filter(record => !record.archived && !record.deleted_at && !record.deletedAt && record.status === "Draft").length,
    sent: records.filter(record => {
      if (record.archived || record.deleted_at || record.deletedAt) return false;
      const derivedStatus = displayStatus(record, linkedPCRs[record.responseId]);
      return derivedStatus.includes("Sent") || derivedStatus.includes("Accepted") || derivedStatus.includes("Progress");
    }).length,
    linked: records.filter(record => !record.archived && !record.deleted_at && !record.deletedAt && linkedPCRs[record.responseId]).length,
  };

  const uploadRecordToCloud = async (record, linkedPcr = null) => {
    try {
      const localPcrRows = await hybridRepository.getLocalPcrReports().catch(() => []);
      const localPcr = linkedPcr
        || (record.responseId ? await localServerClient.getPcrByResponse(record.responseId).catch(() => null) : null)
        || localPcrRows.find(pcr =>
          pcr.responseId === record.responseId
          || pcr.responseClientId === record.responseClientId
          || pcr.dispatchId === record.dispatchId
          || pcr.dispatchId === record.id
        );
      const dispatchIds = new Set([record.id, record.dispatchId, record.dispatchClientId, record.responseId, record.responseClientId].filter(Boolean));
      const pcrIds = new Set([localPcr?.id, localPcr?.pcrId, localPcr?.pcrClientId, localPcr?.responseId, localPcr?.responseClientId, record.linkedPcrId, record.responseId, record.responseClientId].filter(Boolean));
      const rows = await getAllRecords("sync_queue");
      const matching = rows.filter(row => {
        const payload = row.payload || {};
        if (row.destination !== "cloud") return false;
        if (row.entity_type === "dispatch") {
          return dispatchIds.has(row.entity_id)
            || dispatchIds.has(payload.id)
            || dispatchIds.has(payload.dispatchId)
            || dispatchIds.has(payload.dispatchClientId)
            || dispatchIds.has(payload.responseId)
            || dispatchIds.has(payload.responseClientId);
        }
        if (row.entity_type === "pcr") {
          return pcrIds.has(row.entity_id)
            || pcrIds.has(payload.id)
            || pcrIds.has(payload.pcrId)
            || pcrIds.has(payload.pcrClientId)
            || pcrIds.has(payload.responseId)
            || pcrIds.has(payload.responseClientId);
        }
        return false;
      });
      const now = new Date().toISOString();
      if (matching.length) {
        await Promise.all(matching.map(row => putRecord("sync_queue", {
          ...row,
          attempts: 0,
          dependency_keys: [],
          sync_status: "pending",
          error_category: null,
          blocked_reason: null,
          last_sync_error: null,
          next_attempt_at: now,
          updated_at_device: now,
        })));
      }
      toast.info("Uploading this dispatch and linked PCR to cloud...");
      await hybridRepository.updateDispatch(record.dispatchId || record.id, {
        ...record,
        id: record.dispatchId || record.id,
        dispatchId: record.dispatchId || record.id,
        status: displayStatus(record, localPcr) === "Submitted Locally" ? "PCR Completed" : record.status,
      });
      if (localPcr) {
        const savedPcr = await cloudClient.submitPcrHeader({
          ...record,
          ...localPcr,
          id: localPcr.id || localPcr.pcrId,
          pcrId: localPcr.pcrId || localPcr.id,
          dispatchId: record.dispatchId || record.id || localPcr.dispatchId,
          dispatchClientId: record.dispatchClientId || record.dispatchId || localPcr.dispatchClientId,
          responseId: record.responseId || localPcr.responseId,
          responseClientId: record.responseClientId || localPcr.responseClientId || record.responseId,
          responseNumber: record.responseNumber || localPcr.responseNumber,
          respondingTeamId: record.respondingTeamId || localPcr.respondingTeamId,
          team: record.team || localPcr.team || localPcr.respondingTeam,
          status: "Submitted",
          localStatus: "Submitted Locally",
          source: localPcr.source || record.source || "local_server",
        });
        const confirmedPcr = await confirmCloudPcrUpload(savedPcr, { ...record, ...localPcr });
        const syncedAt = new Date().toISOString();
        await putRecord("local_pcr_reports", {
          ...localPcr,
          ...confirmedPcr,
          id: localPcr.id || confirmedPcr.id,
          pcrId: confirmedPcr.pcrId || confirmedPcr.id || localPcr.pcrId,
          responseId: confirmedPcr.responseId || record.responseId || localPcr.responseId,
          responseClientId: confirmedPcr.responseClientId || record.responseClientId || localPcr.responseClientId,
          dispatchId: confirmedPcr.dispatchId || record.dispatchId || record.id || localPcr.dispatchId,
          dispatchClientId: confirmedPcr.dispatchClientId || record.dispatchClientId || localPcr.dispatchClientId,
          localStatus: null,
          syncLabel: "Cloud synced",
          sync_status: "synced",
          synced_to_cloud: true,
          cloud_synced_at: syncedAt,
          updatedAt: confirmedPcr.updatedAt || syncedAt,
        });
      }
      await refresh({ silent: true });
      toast.success("Dispatch and linked PCR header uploaded. Records refreshed.");
    } catch (error) {
      toast.error(error.message || "Unable to upload this dispatch to cloud.");
    }
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

      <div className="mb-4 grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-[1fr_auto_auto]">
        <label className="relative">
          <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search response no., caller, place, responding team, unit, or patient" className="w-full rounded-lg border border-border bg-input-background py-2.5 pl-9 pr-3 text-sm" />
        </label>
        <label className="flex items-center gap-2">
          <Filter size={15} />
          <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-lg border border-border bg-input-background px-3 py-2.5 text-sm">
            {DISPATCH_FILTER_STATUSES.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className="flex overflow-hidden rounded-lg border border-border">
          {["Active", "Archived"].map(item => (
            <button
              key={item}
              onClick={() => setArchiveView(item)}
              className={`px-4 py-2 text-xs font-semibold ${archiveView === item ? "bg-blue-600 text-white" : "bg-secondary"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {loading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading Dispatch Form Records...</div> : error ? <div className="py-16 text-center text-sm text-red-400">{error}</div> : <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase text-muted-foreground">
                <tr>{["Response No.", "Incident", "Location / Barangay", "Responding Team / Unit", "Status", "Linked PCR", "Updated", "Actions"].map(item => <th key={item} className="px-4 py-3 text-left">{item}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRecords.map(record => {
                  const pcr = linkedPCRs[record.responseId];
                  return (
                    <tr key={record.id} onClick={() => setSelected(dispatchPreviewRecord(record, pcr))} className="cursor-pointer border-t border-border hover:bg-secondary/40">
                      <td className="px-4 py-3 font-mono text-blue-400">{record.responseNumber || "Unnumbered"}</td>
                      <td className="px-4 py-3"><div className="font-semibold">{[...(record.natureTypes || []), record.otherMedical, record.otherTrauma].filter(Boolean).join(", ") || "Not specified"}</div><div className="text-xs text-muted-foreground">{formatDateAndTime(record.dateOfIncident, record.timeOfIncident)}</div></td>
                      <td className="max-w-56 px-4 py-3"><div className="truncate">{record.placeOfIncident || pcr?.placeOfIncident || pcr?.locationText || record.callerAddress || "-"}</div><div className="text-xs text-muted-foreground">{record.barangay || pcr?.barangay || "No barangay"}</div></td>
                      <td className="px-4 py-3">{record.team || "-"}<div className="text-xs text-muted-foreground">{record.vehicle || "No unit"}</div></td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(displayStatus(record, pcr))}`}>{displayStatus(record, pcr)}</span>{record.syncLabel && <div className="mt-1 text-[10px] text-muted-foreground">{record.syncLabel}</div>}</td>
                      <td className="px-4 py-3 text-xs">{pcr ? <span className="font-semibold text-green-400">{pcr.responseNumber || pcr.id}</span> : <span className="text-muted-foreground">Not created</span>}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(record.updatedAt || record.createdAt)}</td>
                      <td className="px-4 py-3"><div className="flex gap-1" onClick={event => event.stopPropagation()}>
                        <button onClick={() => setSelected(dispatchPreviewRecord(record, pcr))} title="View dispatch" className="rounded p-2 text-blue-400 hover:bg-blue-500/10"><Eye size={15} /></button>
                        {canCreate && <button onClick={() => edit(record)} title="Edit dispatch" className="rounded p-2 text-amber-400 hover:bg-amber-500/10"><Edit3 size={15} /></button>}
                        <button onClick={() => openPCR(record)} title="Open linked PCR" className="rounded p-2 text-green-400 hover:bg-green-500/10"><FileText size={15} /></button>
                        {needsCloudUpload(record, pcr) && <button onClick={() => uploadRecordToCloud(record, pcr)} title="Sync this dispatch and linked PCR to cloud" aria-label="Sync this dispatch and linked PCR to cloud" className="grid h-8 w-8 place-items-center rounded text-cyan-400 hover:bg-cyan-500/10"><RefreshCw size={15} /></button>}
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

      <DispatchPreviewModal
      selected={selected}
      setSelected={setSelected}
      canCreate={canCreate}
      edit={edit}
      openPCR={openPCR}
      send={null}
      findLinkedPCR={record => linkedPCRs[record.responseId]}
    />
      {selectedPcr && createPortal((
        <div className="fixed inset-0 z-[11000] flex items-start justify-center overflow-y-auto bg-black/70 p-3 md:p-5" role="dialog" aria-modal="true" onMouseDown={() => setSelectedPcr(null)}>
          <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card p-3">
              <div>
                <h2 className="font-bold">{selectedPcr.responseNumber || "Linked PCR"}</h2>
                <p className="text-xs text-muted-foreground">{selectedPcr.patientName || "Unnamed patient"}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigate(`/admin/pcr/new?edit=${selectedPcr.id || selectedPcr.pcrId}`)} className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold">Edit PCR</button>
                <button onClick={() => setSelectedPcr(null)} aria-label="Close linked PCR preview" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground hover:bg-secondary/80"><X size={18} /></button>
              </div>
            </div>
            <div className="overflow-auto bg-slate-300 p-4">
              <div className="mx-auto max-w-[210mm] shadow-xl"><PrintablePCR record={selectedPcr} /></div>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
