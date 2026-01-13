// PWA utilities for service worker registration
import { Platform } from 'react-native';

const BASE_PATH = '/';
const SW_PATH = `${BASE_PATH}sw.js`;

// Register service worker for PWA functionality
export function registerServiceWorker(): void {
  if (Platform.OS !== 'web') {
    return; // Service workers only work on web
  }

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[PWA] Service workers not supported');
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_PATH)
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);

        // Check for updates periodically
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New service worker available. Refresh to update.');
              }
            });
          }
        });
      })
      .catch((error) => {
        console.warn('[PWA] Service Worker registration failed:', error);
      });
  });

  // Listen for service worker updates
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('[PWA] New service worker activated. Reloading...');
      window.location.reload();
    }
  });
}
