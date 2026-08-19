import { useEffect, useState } from "react";
import { AlertTriangle, Bug, ChevronDown, ChevronUp, GitMerge, RefreshCw, Wrench } from "lucide-react";
import { getAllRecords, repairPoisonedSyncOperations, resolveSyncConflict, retryFailedSyncOperations } from "../db/indexed-db";
import { getConnectionState, subscribeConnection } from "../network/connection-manager";
import { runSyncNow } from "../sync/sync-engine";
import { formatLongDateTime } from "../utils/dateFormat";

const QUEUE_REFRESH_MS = 20000;

function diagnoseOperation(operation) {
  const error = String(operation.last_sync_error || "").toLowerCase();
  const payload = operation.payload || {};
  const checks = [];

  if (operation.sync_status === "waiting_dependency") {
    checks.push(operation.blocked_reason || "This operation is waiting for a required parent record to synchronize. No retry attempt is consumed while it waits.");
  }
  if (operation.sync_status === "authorization_required") {
    checks.push("Synchronization was stopped by authorization. Re-authenticate or ask an administrator to verify the user, device, and responding-team assignment.");
  }
  if (operation.sync_status === "permanent_failure") {
    checks.push("Automatic retries stopped because this operation needs a repair, relink, discard, or administrator review.");
  }
  if (operation.entity_type === "pcr" && !payload.responseId) {
    checks.push("PCR is missing linked responseId. Reopen the accepted dispatch and save the PCR again.");
  }
  if (operation.entity_type === "pcr" && !payload.id && !payload.pcrId) {
    checks.push("PCR is missing its UUID. Reopen the PCR and save again so the device can regenerate the queue payload.");
  }
  if (operation.entity_type === "dispatch" && (!payload.id && !payload.dispatchId)) {
    checks.push("Dispatch is missing its UUID. Reopen and save the dispatch again.");
  }
  if (error.includes("sync_offline_pcr_report") || error.includes("pgrst202") || error.includes("could not find the function")) {
    checks.push("Cloud RPC is not deployed. Run Supabase migrations, especially 43_sync_offline_pcr_report_rpc.sql and 45_sync_lan_dispatch_parent_rpc.sql.");
  }
  if (error.includes("linked response") || error.includes("foreign key") || error.includes("response_id")) {
    checks.push("PCR submission is waiting for its response/dispatch record to synchronize. Sync dispatcher operations first, then retry.");
  }
  if (error.includes("pcr_reports_dispatch_form_id_fkey")) {
    checks.push("The PCR still references a local dispatch ID. The updated sync will resolve the cloud dispatch by response ID after the dispatcher record exists.");
  }
  if (error.includes("duplicate key") || error.includes("unique constraint") || error.includes("already exists")) {
    checks.push("A matching cloud record may already exist. The sync will try to reconcile by response ID and update the existing PCR.");
  }
  if (error.includes("row-level security") || error.includes("not authorized") || error.includes("permission denied")) {
    checks.push("Authorization failed. Confirm the field officer belongs to the assigned responding team and the Supabase account is active.");
  }
  if (error.includes("local server") || error.includes("failed (404)") || error.includes("endpoint not found")) {
    checks.push("Local server endpoint is missing or old. Restart npm run dev:local-server and retry.");
  }
  if (error.includes("current transaction is aborted")) {
    checks.push("PostgreSQL rejected an earlier statement in the same request. Run the latest migrations, then use Repair Queue so the original error can be retried cleanly.");
  }
  if (operation.next_attempt_at && Date.parse(operation.next_attempt_at) > Date.now()) {
    checks.push("Operation is waiting for retry backoff. Use Retry / Resume and Sync Now after fixing the cause.");
  }
  if (!checks.length) {
    checks.push(operation.last_sync_error || "No detailed error was recorded. Press Sync Now and check this panel again.");
  }
  return checks;
}

export default function SyncStatusPanel() {
  const [connection, setConnection] = useState(getConnectionState());
  const [operations, setOperations] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [checkerOpen, setCheckerOpen] = useState(false);
  const [repairing, setRepairing] = useState(false);

  useEffect(() => subscribeConnection(setConnection), []);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      if (document.visibilityState !== "visible") return Promise.resolve();
      return Promise.all([getAllRecords("sync_queue"), getAllRecords("conflict_records")])
        .then(([rows, conflictRows]) => {
          if (!mounted) return;
          setOperations(rows);
          setConflicts(conflictRows.filter(row => row.conflict_status !== "resolved"));
        })
        .catch(() => undefined);
    };
    load();
    const interval = setInterval(load, QUEUE_REFRESH_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const counts = {
    pending: operations.filter(row => ["pending", "uploading", "partially_synced", "retry_scheduled"].includes(row.sync_status)).length,
    waiting: operations.filter(row => row.sync_status === "waiting_dependency").length,
    failed: operations.filter(row => ["failed", "authorization_required", "permanent_failure", "conflict"].includes(row.sync_status)).length + conflicts.length,
  };
  const failedOperations = operations
    .filter(row => ["failed", "waiting_dependency", "retry_scheduled", "authorization_required", "permanent_failure"].includes(row.sync_status))
    .sort((a, b) => Date.parse(b.updated_at_device || b.created_at_device || 0) - Date.parse(a.updated_at_device || a.created_at_device || 0));

  const onSync = async () => {
    setSyncing(true);
    try {
      await runSyncNow({ includeNotDue: true });
      setOperations(await getAllRecords("sync_queue"));
      setConflicts((await getAllRecords("conflict_records")).filter(row => row.conflict_status !== "resolved"));
    } finally {
      setSyncing(false);
    }
  };

  const onRetryFailed = async () => {
    setRepairing(true);
    try {
      await retryFailedSyncOperations();
      await runSyncNow({ includeNotDue: true });
      setOperations(await getAllRecords("sync_queue"));
      setConflicts((await getAllRecords("conflict_records")).filter(row => row.conflict_status !== "resolved"));
    } finally {
      setRepairing(false);
    }
  };

  const onRepairQueue = async () => {
    setRepairing(true);
    try {
      await repairPoisonedSyncOperations();
      await runSyncNow({ includeNotDue: true });
      setOperations(await getAllRecords("sync_queue"));
      setConflicts((await getAllRecords("conflict_records")).filter(row => row.conflict_status !== "resolved"));
    } finally {
      setRepairing(false);
    }
  };

  const onResolveConflict = async (conflictId, resolution) => {
    setRepairing(true);
    try {
      await resolveSyncConflict(conflictId, resolution);
      if (resolution === "local") await runSyncNow({ includeNotDue: true });
      setOperations(await getAllRecords("sync_queue"));
      setConflicts((await getAllRecords("conflict_records")).filter(row => row.conflict_status !== "resolved"));
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Hybrid Operations</div>
          <div className="mt-1 text-sm text-foreground">
            Cloud: {connection.cloudOnline ? "Online" : "Offline"} · Local: {connection.localOnline ? "Connected" : "Unreachable"} · Mode: {connection.mode}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCheckerOpen(value => !value)} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-foreground">
            <Bug className="h-3.5 w-3.5" /> Check Failures {checkerOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onSync} disabled={syncing} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync Now
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-secondary p-3"><div className="text-[10px] uppercase text-muted-foreground">Pending cloud uploads</div><div className="text-lg font-bold">{counts.pending}</div></div>
        <div className="rounded-lg bg-secondary p-3"><div className="text-[10px] uppercase text-muted-foreground">Waiting dependencies</div><div className="text-lg font-bold">{counts.waiting}</div></div>
        <div className="rounded-lg bg-secondary p-3"><div className="text-[10px] uppercase text-muted-foreground">Needs attention</div><div className="text-lg font-bold">{counts.failed}</div></div>
      </div>
      {conflicts.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-500">
            <GitMerge className="h-3.5 w-3.5" /> Conflict Review
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Cloud and local records both changed. Choose which version should be kept.</div>
          <div className="mt-3 space-y-2">
            {conflicts.slice(0, 5).map(conflict => (
              <div key={conflict.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-foreground">{conflict.entity_type} conflict / {conflict.severity}</div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">{conflict.entity_id}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button disabled={repairing} onClick={() => onResolveConflict(conflict.id, "cloud")} className="rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-semibold">
                      Use Cloud
                    </button>
                    <button disabled={repairing} onClick={() => onResolveConflict(conflict.id, "local")} className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white">
                      Keep Local
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
                  {(conflict.changed_fields || []).slice(0, 4).map(change => (
                    <div key={change.key} className="rounded-md bg-secondary/60 px-2 py-1">
                      <span className="font-semibold text-foreground">{change.label}:</span> local "{String(change.localValue ?? "-").slice(0, 40)}" / cloud "{String(change.cloudValue ?? "-").slice(0, 40)}"
                    </div>
                  ))}
                  {(conflict.changed_fields || []).length > 4 && <div>+{conflict.changed_fields.length - 4} more changed fields</div>}
                </div>
              </div>
            ))}
            {conflicts.length > 5 && <div className="text-xs text-muted-foreground">Showing 5 of {conflicts.length} conflicts.</div>}
          </div>
        </div>
      )}
      {checkerOpen && (
        <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Failed Operation Checker
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Shows why dispatcher or field-officer sync items are failing on this device.</div>
            </div>
            <button onClick={onRetryFailed} disabled={!failedOperations.length || repairing} className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">
              <Wrench className="h-3.5 w-3.5" /> Retry Failed
            </button>
            <button onClick={onRepairQueue} disabled={repairing} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              <Wrench className="h-3.5 w-3.5" /> Repair Queue
            </button>
          </div>

          {!failedOperations.length ? (
            <div className="mt-3 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-500">
              No failed, blocked, or waiting operations on this device.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {failedOperations.slice(0, 8).map(operation => (
                <div key={operation.id || operation.operation_id} className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-red-400">
                      {operation.entity_type || "operation"} / {operation.operation_type || "sync"} / {operation.sync_status}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Attempts {operation.attempts || 0} · Next {operation.next_attempt_at ? formatLongDateTime(operation.next_attempt_at) : "now"}
                    </div>
                  </div>
                  <div className="mt-1 break-words font-mono text-[10px] text-muted-foreground">
                    ID {operation.entity_id || operation.payload?.id || operation.payload?.pcrId || operation.payload?.dispatchId || operation.operation_id}
                  </div>
                  <div className="mt-2 rounded-md bg-background/70 p-2 text-xs text-red-300">
                    {operation.last_sync_error || "No error message recorded."}
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-foreground">
                    {diagnoseOperation(operation).map(item => <li key={item}>- {item}</li>)}
                  </ul>
                </div>
              ))}
              {failedOperations.length > 8 && (
                <div className="text-xs text-muted-foreground">Showing 8 of {failedOperations.length} failed operations.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
