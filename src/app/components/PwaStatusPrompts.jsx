import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { promptInstall, subscribePwaInstall } from "../pwa/install-manager";
import { activateWaitingServiceWorker, subscribePwaUpdates } from "../pwa/update-manager";

export default function PwaStatusPrompts() {
  const [installState, setInstallState] = useState({ canInstall: false });
  const [updateState, setUpdateState] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribePwaInstall(setInstallState), []);
  useEffect(() => subscribePwaUpdates(setUpdateState), []);

  if (dismissed) return null;
  if (updateState?.updateAvailable) {
    return (
      <div className="fixed bottom-4 left-4 z-[2200] flex max-w-sm items-center gap-3 rounded-xl border border-blue-500/30 bg-card p-3 text-sm shadow-2xl">
        <RefreshCw className="h-4 w-4 text-blue-500" />
        <span className="flex-1 text-foreground">An ALERT-CIA update is ready.</span>
        <button onClick={() => activateWaitingServiceWorker(updateState.registration)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Update</button>
      </div>
    );
  }
  if (!installState.canInstall) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[2200] flex max-w-sm items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm shadow-2xl">
      <Download className="h-4 w-4 text-blue-500" />
      <span className="flex-1 text-foreground">Install ALERT-CIA on this device for faster field access.</span>
      <button onClick={promptInstall} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">Install</button>
      <button onClick={() => setDismissed(true)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary" aria-label="Dismiss install prompt"><X className="h-4 w-4" /></button>
    </div>
  );
}
