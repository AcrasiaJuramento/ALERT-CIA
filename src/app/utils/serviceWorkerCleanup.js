export async function unregisterLegacyServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));

  if (!window.caches) return;
  const cacheNames = await window.caches.keys();
  await Promise.all(
    cacheNames
      .filter(name => name.startsWith("alert-cia-shell-"))
      .map(name => window.caches.delete(name)),
  );
}
