// Service worker registration + app updates for the web/PWA build.
//
// How updates work:
// - Every deploy publishes version.json ({ build, builtAt }) and stamps the same
//   build id into index.html as <meta name="chowder-build"> (see fix-paths.js).
// - The app compares its own build with version.json on launch, whenever it
//   comes back to the foreground, and when you tap "Check for Updates".
// - Applying an update activates the new service worker (if one is waiting) and
//   reloads. Only the app's code changes; your data lives in IndexedDB and is
//   never touched by an update.

import { Platform } from 'react-native';

function readBuildMeta(): { build: string; builtAt: string } {
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="chowder-build"]') : null;
  return {
    build: meta?.getAttribute('content') || 'dev',
    builtAt: meta?.getAttribute('data-built-at') || '',
  };
}
const BUILD_META = Platform.OS === 'web' ? readBuildMeta() : { build: 'native', builtAt: '' };
export const APP_BUILD = BUILD_META.build;
export const APP_BUILD_TIME = BUILD_META.builtAt;

export type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'updating' | 'error' | 'unsupported';

export interface UpdateState {
  status: UpdateStatus;
  currentBuild: string;
  currentBuiltAt?: string;
  latestBuild?: string;
  latestBuiltAt?: string;
  lastChecked?: number;
  /** User tapped "Later" on the banner for this build. */
  dismissedBuild?: string;
}

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

let state: UpdateState = {
  // Local dev servers have no version stamp; updates only apply to deployed builds.
  status: isWeb && !isDev && APP_BUILD !== 'dev' ? 'idle' : 'unsupported',
  currentBuild: APP_BUILD,
  currentBuiltAt: APP_BUILD_TIME || undefined,
};
const listeners = new Set<(s: UpdateState) => void>();
let registration: ServiceWorkerRegistration | null = null;

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l(state));
}

export function getUpdateState(): UpdateState {
  return state;
}

export function subscribeToUpdates(listener: (s: UpdateState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function baseUrl(): string {
  return window.location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
}

/** Ask the server what the latest deployed version is. */
export async function checkForUpdates(): Promise<UpdateState> {
  if (state.status === 'unsupported' || state.status === 'updating') return state;
  setState({ status: 'checking' });
  try {
    registration?.update().catch(() => {});
    const res = await fetch(`${baseUrl()}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const latest = (await res.json()) as { build?: string; builtAt?: string };
    const newer = !!latest.build && latest.build !== APP_BUILD;
    setState({
      status: newer ? 'available' : 'up-to-date',
      latestBuild: latest.build,
      latestBuiltAt: latest.builtAt,
      lastChecked: Date.now(),
    });
  } catch {
    // Offline or blocked: not an error worth shouting about; keep current version.
    setState({ status: 'error', lastChecked: Date.now() });
  }
  return state;
}

/** Switch to the latest version. Data is untouched; only the app reloads. */
export function applyUpdate(): void {
  if (!isWeb) return;
  setState({ status: 'updating' });
  const waiting = registration?.waiting;
  if (waiting) {
    // Reload once the new worker takes control (see controllerchange below),
    // with a fallback in case that event never arrives.
    waiting.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => window.location.reload(), 3000);
  } else {
    window.location.reload();
  }
}

export function dismissUpdate(): void {
  setState({ dismissedBuild: state.latestBuild });
}

export function registerServiceWorker(): void {
  if (!isWeb || isDev) return;

  // Check on launch and whenever the app returns to the foreground (at most every 10 minutes).
  const maybeCheck = () => {
    if (state.lastChecked && Date.now() - state.lastChecked < 10 * 60 * 1000) return;
    checkForUpdates();
  };
  setTimeout(maybeCheck, 3000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeCheck();
  });

  if (!('serviceWorker' in navigator)) return;

  // Relative URL so it works both at the domain root and under /chowder/ on GitHub Pages.
  const swUrl = new URL('sw.js', baseUrl());
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload when the user asked for the update; never yank the app mid-use.
    if (state.status !== 'updating' || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const register = () => {
    navigator.serviceWorker
      .register(swUrl.href, { scope: './' })
      .then(reg => {
        registration = reg;
        // A new worker finished installing while an old one controls the page.
        const watch = (worker: ServiceWorker | null) => {
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller && state.status !== 'updating') {
              checkForUpdates();
            }
          });
        };
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
      })
      .catch(error => console.warn('[PWA] Service worker registration failed:', error));
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
