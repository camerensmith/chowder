// Minimal Dropbox client for the web/PWA build.
//
// Auth: OAuth 2 authorization-code flow with PKCE (no client secret, so it's
// safe in a public web app) and `token_access_type=offline` for a long-lived
// refresh token. We use a full-page redirect rather than a popup because
// popups are unreliable in an iPhone home-screen app.
//
// Access: an "App folder" Dropbox app, so Chowder can only see /Apps/<app name>/.

export const DROPBOX_APP_KEY_DEFAULT = ''; // set once the Dropbox app is registered (public value)

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

const TOKEN_KEY = 'chowder_dropbox_auth';
const PKCE_KEY = 'chowder_dropbox_pkce';
const APP_KEY_KEY = 'chowder_dropbox_app_key';

interface StoredAuth {
  appKey: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
}

function ls(): Storage | null {
  try {
    return (globalThis as any).localStorage ?? null;
  } catch {
    return null;
  }
}

export function getAppKey(): string {
  return DROPBOX_APP_KEY_DEFAULT || ls()?.getItem(APP_KEY_KEY) || '';
}

export function setAppKey(key: string) {
  ls()?.setItem(APP_KEY_KEY, key.trim());
}

function loadAuth(): StoredAuth | null {
  try {
    const raw = ls()?.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function saveAuth(auth: StoredAuth | null) {
  if (auth) ls()?.setItem(TOKEN_KEY, JSON.stringify(auth));
  else ls()?.removeItem(TOKEN_KEY);
}

export function isConnected(): boolean {
  return !!loadAuth()?.refreshToken;
}

export function disconnect() {
  const auth = loadAuth();
  saveAuth(null);
  if (auth) {
    // Best effort: revoke the token so it can't be used again.
    fetch(`${API}/auth/token/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken}` } }).catch(() => {});
  }
}

/** The page we come back to after signing in (must be registered in the Dropbox app console). */
export function redirectUri(): string {
  return window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
}

function base64Url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach(b => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return base64Url(bytes).slice(0, len);
}

/** Navigate to Dropbox to sign in. The app reloads at redirectUri() afterwards. */
export async function startSignIn(): Promise<void> {
  const appKey = getAppKey();
  if (!appKey) throw new Error('Dropbox is not set up yet (missing app key).');
  const verifier = randomString(64);
  const state = randomString(16);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  ls()?.setItem(PKCE_KEY, JSON.stringify({ verifier, state, appKey }));
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', appKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('token_access_type', 'offline');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  window.location.assign(url.toString());
}

/**
 * If this page load is the return from Dropbox sign-in, finish it.
 * Returns true if we just connected, false if there was nothing to do.
 * Throws with a readable message if sign-in failed or was cancelled.
 */
export async function completeSignInFromUrl(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  const state = params.get('state');
  if (!code && !error) return false;

  const clean = () => history.replaceState(null, '', window.location.pathname + window.location.hash);
  const pending = (() => {
    try {
      return JSON.parse(ls()?.getItem(PKCE_KEY) || 'null');
    } catch {
      return null;
    }
  })();
  ls()?.removeItem(PKCE_KEY);
  clean();

  if (error) {
    throw new Error(error === 'access_denied' ? 'Dropbox access was not allowed.' : `Dropbox sign-in failed (${error}).`);
  }
  if (!pending || pending.state !== state) throw new Error('Dropbox sign-in expired. Please try connecting again.');

  const body = new URLSearchParams({
    code: code!,
    grant_type: 'authorization_code',
    client_id: pending.appKey,
    code_verifier: pending.verifier,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(TOKEN_URL, { method: 'POST', body });
  if (!res.ok) throw new Error(`Dropbox sign-in failed (${res.status}).`);
  const data = await res.json();
  saveAuth({
    appKey: pending.appKey,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000 - 60_000,
    accountId: data.account_id,
  });
  return true;
}

async function accessToken(forceRefresh = false): Promise<string> {
  const auth = loadAuth();
  if (!auth) throw new DropboxError('not_connected', 'Not connected to Dropbox.');
  if (!forceRefresh && Date.now() < auth.expiresAt) return auth.accessToken;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken, client_id: auth.appKey }),
  });
  if (res.status === 400 || res.status === 401) {
    saveAuth(null);
    throw new DropboxError('reauth', 'Dropbox access expired. Please connect again.');
  }
  if (!res.ok) throw new DropboxError('network', `Couldn't reach Dropbox (${res.status}).`);
  const data = await res.json();
  saveAuth({ ...auth, accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000 - 60_000 });
  return data.access_token;
}

export class DropboxError extends Error {
  constructor(public code: 'not_connected' | 'reauth' | 'conflict' | 'not_found' | 'network' | 'other', message: string) {
    super(message);
  }
}

/** Dropbox-API-Arg must be ASCII; escape anything else. */
function apiArg(obj: object): string {
  return JSON.stringify(obj).replace(/[\u007f-￿]/g, c => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4));
}

async function call(url: string, init: RequestInit, retried = false): Promise<Response> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers as any), Authorization: `Bearer ${token}` } });
  } catch {
    throw new DropboxError('network', "Couldn't reach Dropbox. Are you online?");
  }
  if (res.status === 401 && !retried) {
    await accessToken(true);
    return call(url, init, true);
  }
  if (res.status === 409) {
    const text = await res.text();
    if (text.includes('not_found')) throw new DropboxError('not_found', 'Not found in Dropbox.');
    if (text.includes('conflict')) throw new DropboxError('conflict', 'Changed in Dropbox by another device.');
    throw new DropboxError('other', `Dropbox error: ${text.slice(0, 200)}`);
  }
  if (res.status === 429) throw new DropboxError('network', 'Dropbox is busy; will retry shortly.');
  if (!res.ok) throw new DropboxError('other', `Dropbox error (${res.status}).`);
  return res;
}

export interface FileMeta {
  rev: string;
  serverModified: string;
  size: number;
}

export async function getMetadata(path: string): Promise<FileMeta | null> {
  try {
    const res = await call(`${API}/files/get_metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const m = await res.json();
    return { rev: m.rev, serverModified: m.server_modified, size: m.size };
  } catch (e) {
    if (e instanceof DropboxError && e.code === 'not_found') return null;
    throw e;
  }
}

/**
 * Upload a file. With `expectRev`, the upload only succeeds if the file is
 * still at that revision (throws DropboxError 'conflict' otherwise); with
 * `expectRev: null` it must not exist yet; omit it to overwrite.
 */
export async function upload(path: string, data: Blob | string, expectRev?: string | null): Promise<FileMeta> {
  const mode = expectRev === undefined ? 'overwrite' : expectRev === null ? 'add' : { '.tag': 'update', update: expectRev };
  const res = await call(`${CONTENT}/files/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': apiArg({ path, mode, autorename: false, mute: true }),
    },
    body: data,
  });
  const m = await res.json();
  return { rev: m.rev, serverModified: m.server_modified, size: m.size };
}

export async function download(path: string): Promise<Blob> {
  const res = await call(`${CONTENT}/files/download`, {
    method: 'POST',
    headers: { 'Dropbox-API-Arg': apiArg({ path }) },
  });
  return res.blob();
}
