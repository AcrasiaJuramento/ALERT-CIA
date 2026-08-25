const listeners = new Set();

function emit(event) {
  for (const listener of listeners) listener(event);
}

export function subscribePwaUpdates(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
  const registration = await navigator.serviceWorker.register("/sw.js");
  if (registration.waiting) emit({ updateAvailable: true, registration });
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        emit({ updateAvailable: true, registration });
      }
    });
  });
}

export function activateWaitingServiceWorker(registration) {
  registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
}
