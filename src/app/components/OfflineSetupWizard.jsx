import { useEffect, useState } from "react";
import { Radio, Save, WifiOff } from "lucide-react";
import { checkLocalHealth } from "../network/health-checks";
import { checkConnection, getConnectionState, subscribeConnection } from "../network/connection-manager";
import { readOfflineSettings } from "../pwa/offline-settings";
import { saveLocalServerConfig } from "../services/device-service";

const defaultConfig = {
  protocol: "http",
  host: "192.168.100.8",
  port: "4000",
  timeoutMs: 2500,
  discoveryEnabled: false,
  lastSuccessfulConnection: null,
};

export default function OfflineSetupWizard() {
  const [connection, setConnection] = useState(getConnectionState());
  const [hasSavedServer, setHasSavedServer] = useState(Boolean(readOfflineSettings().localServerOrigin));
  const [config, setConfig] = useState(defaultConfig);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeConnection(setConnection), []);
  useEffect(() => {
    const onStorage = () => setHasSavedServer(Boolean(readOfflineSettings().localServerOrigin));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (connection.checking || connection.mode !== "offline" || hasSavedServer) return null;

  const update = (key, value) => setConfig(current => ({ ...current, [key]: value }));

  const saveAndRetry = async () => {
    setSaving(true);
    setStatus("Checking local ALERT-CIA server...");
    try {
      const ok = await checkLocalHealth(config);
      if (!ok) {
        setStatus("Local ALERT-CIA Server not found. Connect to the ALERT-CIA Wi-Fi or contact your system administrator.");
        return;
      }
      await saveLocalServerConfig({ ...config, lastSuccessfulConnection: new Date().toISOString() });
      setHasSavedServer(true);
      setStatus("Local server saved.");
      await checkConnection({ force: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2300] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/10 text-amber-400">
            <WifiOff className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Local ALERT-CIA Setup</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Local ALERT-CIA Server not found. Connect to the ALERT-CIA Wi-Fi or contact your system administrator.
            </p>
          </div>
        </div>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-muted-foreground">
              Protocol
              <select value={config.protocol} onChange={event => update("protocol", event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Port
              <input value={config.port} onChange={event => update("port", event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </label>
          </div>
          <label className="text-xs font-semibold text-muted-foreground">
            Local server IP or hostname
            <input value={config.host} onChange={event => update("host", event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
          {status && <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">{status}</div>}
          <button onClick={saveAndRetry} disabled={saving} className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-70">
            {saving ? <Radio className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
            Save Local Server
          </button>
        </div>
      </div>
    </div>
  );
}
