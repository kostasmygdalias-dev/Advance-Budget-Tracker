// The service worker (vite-plugin-pwa, see vite.config.js) precaches the
// build by content hash — correct, but with skipWaiting/clientsClaim it
// activates a new version in the background without telling the page
// that's already open. Without this listener, a tab left open across a
// deploy keeps running the old JS indefinitely (nothing errors — it's not
// the stale-*chunk* 404 case ChunkErrorBoundary catches, it's a fully
// self-consistent old bundle silently missing whatever shipped after it
// loaded). controllerchange fires the moment a new worker takes over;
// reloading once picks up the current version. Standard Workbox recipe —
// also fires on a page's very first-ever visit (clientsClaim() immediately
// claims it too), a one-time, effectively invisible extra reload.
export function registerServiceWorkerUpdateReload() {
  if (!('serviceWorker' in navigator)) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
