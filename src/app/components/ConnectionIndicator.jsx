import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { getAllRecords } from "../db/indexed-db";
import { checkConnection, getConnectionState, subscribeConnection } from "../network/connection-manager";
import { runSyncNow } from "../sync/sync-engine";
import { formatLongDateTime } from "../utils/dateFormat";

const QUEUE_REFRESH_MS = 20000;

function fmt(value) {
  return value ? formatLongDateTime(value) : "Never";
}

export default function ConnectionIndicator() {
  const [connection, setConnection] = useState(getConnectionState());
  const [pendingPcr, setPendingPcr] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => subscribeConnection(setConnection), []);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      if (document.visibilityState !== "visible") return Promise.resolve();
      return getAllRecords("sync_queue").then(rows => {
        if (!mounted) return;
        setPendingPcr(rows.filter(row =>
          row.entity_type === "pcr"
          && ["pending", "partially_synced", "uploading", "retry_scheduled", "waiting_dependency"].includes(row.sync_status)
        ).length);
      }).catch(() => undefined);
    };
    load();
    const interval = setInterval(load, QUEUE_REFRESH_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const modeLabel = useMemo(() => connection.cloudOnline ? "Online" : "Offline", [connection.cloudOnline]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await checkConnection({ force: true });
      await runSyncNow({ includeNotDue: true });
    } finally {
      setSyncing(false);
    }
  };

  const Icon = connection.cloudOnline ? Cloud : CloudOff;
  const color = connection.cloudOnline
    ? "text-green-400 border-green-500/30 bg-green-500/10"
    : "text-amber-400 border-amber-500/30 bg-amber-500/10";

  return (
    <div className={`hidden md:flex items-center gap-2 rounded-lg border px-2 py-1.5 xl:px-3 ${color}`} title={`Cloud last online: ${fmt(connection.lastCloudOnlineAt)}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold">{modeLabel}</span>
      {pendingPcr > 0 && <span className="text-xs font-semibold">Pending PCR {pendingPcr}</span>}
      <button onClick={syncNow} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/10" title="Sync pending PCR drafts" disabled={syncing || !pendingPcr}>
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
