// Service worker registration for the web/PWA build.
import { Platform } from 'react-native';

export function registerServiceWorker(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // Skip in development: the dev server's bundle isn't hashed and caching it is confusing.
  if (typeof __DEV__ !== 'undefined' && __DEV__) return;

  // Relative URL so it works both at the domain root and under /chowder/ on GitHub Pages.
  const swUrl = new URL('sw.js', window.location.href.replace(/[^/]*$/, ''));
  const hadController = !!navigator.serviceWorker.controller;

  const register = () => {
    navigator.serviceWorker
      .register(swUrl.href, { scope: './' })
      .then(registration => {
        // Look for a new deploy whenever the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      })
      .catch(error => console.warn('[PWA] Service worker registration failed:', error));
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);

  // When a new deploy's worker takes over, reload once so the new bundle runs.
  // Skip on the very first install (no previous controller) to avoid a pointless reload.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
