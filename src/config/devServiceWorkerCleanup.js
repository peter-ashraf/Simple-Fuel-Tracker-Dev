const DEV_SW_CLEANUP_FLAG = "__sft_dev_sw_cleanup_reloaded__";

const isLocalDevHost = () =>
  typeof window !== "undefined" &&
  import.meta.env.DEV &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const clearDevCaches = async () => {
  if (!("caches" in window)) return;

  const cacheNames = await window.caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.includes("simple-fuel-tracker") || name.includes("sft-dev"))
      .map((name) => window.caches.delete(name)),
  );
};

const unregisterDevServiceWorkers = async () => {
  if (!("serviceWorker" in navigator) || !isLocalDevHost()) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (!registrations.length) {
      await clearDevCaches();
      return;
    }

    await Promise.all(registrations.map((registration) => registration.unregister()));
    await clearDevCaches();

    if (navigator.serviceWorker.controller && !sessionStorage.getItem(DEV_SW_CLEANUP_FLAG)) {
      sessionStorage.setItem(DEV_SW_CLEANUP_FLAG, "1");
      window.location.reload();
    }
  } catch (error) {
    console.warn("[DevSW] Failed to clean local service worker cache.", error);
  }
};

unregisterDevServiceWorkers();
