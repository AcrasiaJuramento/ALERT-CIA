const listeners = new Set();
let deferredPrompt = null;

function emit(event) {
  for (const listener of listeners) listener(event);
}

export function subscribePwaInstall(listener) {
  listeners.add(listener);
  listener({ canInstall: Boolean(deferredPrompt) });
  return () => listeners.delete(listener);
}

export function registerInstallPrompt() {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    emit({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit({ canInstall: false, installed: true });
  });
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
  emit({ canInstall: false });
  return result.outcome === "accepted";
}
