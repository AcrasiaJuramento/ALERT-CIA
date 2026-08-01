import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, DatabaseZap, RefreshCw, WifiOff } from "lucide-react";
import { getAllRecords } from "../db/indexed-db";
import { checkConnection, getConnectionState, subscribeConnection } from "../network/connection-manager";
import { runSyncNow } from "../sync/sync-engine";

const QUEUE_REFRESH_MS = 20000;

function fmt(value) {
  return value ? new Date(value).toLocaleString("en-PH", { hour12: false }) : "Never";
}

export default function ConnectionIndicator() {
  const [connection, setConnection] = useState(getConnectionState());
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => subscribeConnection(setConnection), []);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      if (document.visibilityState !== "visible") return Promise.resolve();
      return getAllRecords("sync_queue").then(rows => {
      if (!mounted) return;
      setCounts({
        pending: rows.filter(row => ["pending", "partially_synced", "uploading"].includes(row.sync_status)).length,
        failed: rows.filter(row => row.sync_status === "failed").length,
      });
    }).catch(() => undefined);
    };
    load();
    const interval = setInterval(load, QUEUE_REFRESH_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const modeLabel = useMemo(() => {
    if (connection.mode === "cloud") return "Cloud";
    if (connection.mode === "local") return "Local network";
    return "Offline";
  }, [connection.mode]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await checkConnection({ force: true });
      await runSyncNow({ includeNotDue: true });
    } finally {
      setSyncing(false);
    }
  };

  const Icon = connection.mode === "cloud" ? Cloud : connection.mode === "local" ? DatabaseZap : WifiOff;
  const color = connection.mode === "cloud" ? "text-green-400 border-green-500/30 bg-green-500/10" : connection.mode === "local" ? "text-blue-400 border-blue-500/30 bg-blue-500/10" : "text-amber-400 border-amber-500/30 bg-amber-500/10";

  return (
    <div className={`hidden xl:flex items-center gap-2 rounded-lg border px-3 py-1.5 ${color}`} title={`Cloud last online: ${fmt(connection.lastCloudOnlineAt)}\nLocal last connected: ${fmt(connection.lastLocalOnlineAt)}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold">Mode: {modeLabel}</span>
      <span className="text-xs opacity-80">Cloud {connection.cloudOnline ? "Online" : "Offline"}</span>
      <span className="text-xs opacity-80">Local {connection.localOnline ? "Connected" : "Unreachable"}</span>
      {(counts.pending > 0 || counts.failed > 0) && <span className="text-xs font-semibold">Queue {counts.pending}/{counts.failed}</span>}
      <button onClick={syncNow} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/10" title="Sync now" disabled={syncing}>
        {connection.cloudOnline ? <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> : <CloudOff className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
