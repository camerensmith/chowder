// Continuous cloud backup to Dropbox (web/PWA).
//
// Layout inside the Dropbox app folder:
//   /chowder-data.json        everything except photo bytes (same shape as a backup file)
//   /photos/<sha256>.jpg      each photo, uploaded once (content-addressed)
//
// Every local write marks the data dirty; we upload a few seconds after the
// last change, and immediately when the app goes to the background. Uploads
// use the last-known Dropbox revision, so if another device changed the cloud
// copy we stop and ask instead of overwriting it.
//
// Restoring replaces this device's data with the cloud copy (photos included).
// Friends' lists are part of your data and sync like everything else; importing
// a friend's share code stays additive.

import { Alert, Platform } from 'react-native';
import { BackupData, exportBackup, importBackup, getAuthor, getAllPlaces } from '../db';
import { onDataChange } from '../indexeddb';
import * as dbx from './dropbox';

const DATA_PATH = '/chowder-data.json';
const PHOTO_DIR = '/photos';
const PHOTO_REF = 'dropbox-photo:';
const STATE_KEY = 'chowder_cloud_state';
const DEBOUNCE_MS = 4000;

export type CloudStatus = 'unsupported' | 'disconnected' | 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict';

export interface CloudState {
  status: CloudStatus;
  provider: 'dropbox';
  configured: boolean; // an app key is available
  lastSynced?: number;
  error?: string;
  dirty: boolean;
}

interface Persisted {
  rev?: string;
  lastSynced?: number;
  dirty?: boolean;
  photos?: string[]; // hashes already in Dropbox
}

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

function loadPersisted(): Persisted {
  try {
    return JSON.parse((globalThis as any).localStorage?.getItem(STATE_KEY) || '{}');
  } catch {
    return {};
  }
}
function savePersisted(p: Persisted) {
  try {
    (globalThis as any).localStorage?.setItem(STATE_KEY, JSON.stringify(p));
  } catch { /* storage full or blocked */ }
}

let persisted: Persisted = isWeb ? loadPersisted() : {};
let state: CloudState = {
  status: !isWeb ? 'unsupported' : dbx.isConnected() ? 'idle' : 'disconnected',
  provider: 'dropbox',
  configured: isWeb && !!dbx.getAppKey(),
  lastSynced: persisted.lastSynced,
  dirty: !!persisted.dirty,
};
const listeners = new Set<(s: CloudState) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let suppress = 0; // >0 while we're writing data ourselves (restore)
let running: Promise<void> | null = null;

function setState(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l(state));
}
function persist(patch: Partial<Persisted>) {
  persisted = { ...persisted, ...patch };
  savePersisted(persisted);
  if ('dirty' in patch) setState({ dirty: !!patch.dirty });
  if ('lastSynced' in patch) setState({ lastSynced: patch.lastSynced });
}

export function getCloudState(): CloudState {
  return state;
}
export function subscribeCloud(l: (s: CloudState) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---------- photos ----------

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

type PhotoField = { obj: any; key: string };
function photoFields(b: BackupData): PhotoField[] {
  const fields: PhotoField[] = [];
  if (b.author) fields.push({ obj: b.author, key: 'avatarUri' });
  b.places.forEach(o => fields.push({ obj: o, key: 'coverImageUri' }));
  b.visits.forEach(o => fields.push({ obj: o, key: 'photoUri' }));
  b.dishes.forEach(o => fields.push({ obj: o, key: 'photoUri' }));
  return fields;
}

/** Replace embedded photos with references, uploading any Dropbox doesn't have yet. */
async function extractPhotos(b: BackupData): Promise<BackupData> {
  const known = new Set(persisted.photos ?? []);
  for (const { obj, key } of photoFields(b)) {
    const v = obj[key];
    if (typeof v !== 'string' || !v.startsWith('data:')) continue;
    const hash = await sha256Hex(v);
    if (!known.has(hash)) {
      const blob = await (await fetch(v)).blob();
      await dbx.upload(`${PHOTO_DIR}/${hash}.jpg`, blob); // overwrite is fine: same content, same name
      known.add(hash);
      persist({ photos: [...known] });
    }
    obj[key] = `${PHOTO_REF}${hash}`;
  }
  return b;
}

/** Download referenced photos and embed them again. */
async function restorePhotos(b: BackupData): Promise<BackupData> {
  const cache = new Map<string, string>();
  const known = new Set<string>();
  for (const { obj, key } of photoFields(b)) {
    const v = obj[key];
    if (typeof v !== 'string' || !v.startsWith(PHOTO_REF)) continue;
    const hash = v.slice(PHOTO_REF.length);
    try {
      if (!cache.has(hash)) {
        // Dropbox serves files as application/octet-stream; label them as JPEG so they render.
        const raw = await dbx.download(`${PHOTO_DIR}/${hash}.jpg`);
        cache.set(hash, await blobToDataUrl(new Blob([raw], { type: 'image/jpeg' })));
      }
      obj[key] = cache.get(hash);
      known.add(hash);
    } catch {
      obj[key] = undefined; // photo missing in Dropbox: keep the record without it
    }
  }
  persist({ photos: [...known] });
  return b;
}

// ---------- sync ----------

function summarize(b: BackupData): string {
  const when = b.exportedAt ? new Date(b.exportedAt).toLocaleString() : 'an unknown time';
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return `${n(b.places.length, 'place')}, ${n(b.lists.length, 'list')}, saved ${when}`;
}

async function doPush(force = false) {
  setState({ status: 'syncing', error: undefined });
  try {
    const backup = await extractPhotos(await exportBackup());
    const json = JSON.stringify(backup);
    // Optimistic concurrency: only replace the revision we last saw.
    const expect = force ? undefined : persisted.rev ?? null;
    const meta = await dbx.upload(DATA_PATH, new Blob([json], { type: 'application/json' }), expect);
    persist({ rev: meta.rev, lastSynced: Date.now(), dirty: false });
    setState({ status: 'synced' });
  } catch (e: any) {
    if (e instanceof dbx.DropboxError && e.code === 'conflict') {
      setState({ status: 'conflict', error: 'Your Dropbox copy was changed on another device.' });
      promptConflict();
    } else if (e instanceof dbx.DropboxError && e.code === 'reauth') {
      setState({ status: 'disconnected', error: e.message });
    } else if (e instanceof dbx.DropboxError && e.code === 'network') {
      setState({ status: 'offline', error: e.message });
    } else {
      setState({ status: 'error', error: e?.message || 'Backup failed.' });
    }
  }
}

/** Upload now (if connected). Safe to call repeatedly. */
export function syncNow(force = false): Promise<void> {
  if (!isWeb || !dbx.isConnected()) return Promise.resolve();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (state.status === 'conflict' && !force) return Promise.resolve();
  if (running) return running.then(() => syncNow(force));
  running = doPush(force).finally(() => {
    running = null;
  });
  return running;
}

function schedule() {
  persist({ dirty: true });
  if (!dbx.isConnected() || state.status === 'conflict') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => syncNow(), DEBOUNCE_MS);
}

/** Replace this device's data with the Dropbox copy. */
export async function restoreFromCloud(): Promise<boolean> {
  setState({ status: 'syncing', error: undefined });
  try {
    const meta = await dbx.getMetadata(DATA_PATH);
    if (!meta) {
      setState({ status: 'idle' });
      Alert.alert('No backup in Dropbox', "There's no Chowder backup in your Dropbox yet.");
      return false;
    }
    const backup = JSON.parse(await (await dbx.download(DATA_PATH)).text()) as BackupData;
    await restorePhotos(backup);
    suppress++;
    try {
      await importBackup(backup);
    } finally {
      suppress--;
    }
    persist({ rev: meta.rev, lastSynced: Date.now(), dirty: false });
    setState({ status: 'synced' });
    return true;
  } catch (e: any) {
    setState({ status: 'error', error: e?.message || 'Restore failed.' });
    Alert.alert('Restore failed', e?.message || 'Could not restore from Dropbox.');
    return false;
  }
}

async function cloudSummary(): Promise<string | null> {
  try {
    const backup = JSON.parse(await (await dbx.download(DATA_PATH)).text()) as BackupData;
    return summarize(backup);
  } catch {
    return null;
  }
}

function promptConflict() {
  cloudSummary().then(summary => {
    Alert.alert(
      'Dropbox copy changed elsewhere',
      `Another device updated your Chowder backup${summary ? ` (${summary})` : ''}. Which copy do you want to keep?`,
      [
        { text: 'Decide later', style: 'cancel' },
        { text: 'Keep this phone’s', onPress: () => syncNow(true) },
        { text: 'Use Dropbox copy', style: 'destructive', onPress: () => { restoreFromCloud(); } },
      ]
    );
  });
}

/** Start connecting. The page navigates to Dropbox and comes back. */
export async function connectDropbox(): Promise<void> {
  try {
    await dbx.startSignIn();
  } catch (e: any) {
    Alert.alert('Can’t connect to Dropbox', e?.message || 'Please try again.');
  }
}

export function disconnectDropbox() {
  dbx.disconnect();
  if (timer) clearTimeout(timer);
  persist({ rev: undefined, photos: [] });
  setState({ status: 'disconnected', error: undefined });
}

/**
 * Call once at startup after the database is ready. Finishes a Dropbox sign-in
 * if we're returning from one, and decides what to do with an existing cloud copy.
 * Resolves to true if data was restored from Dropbox.
 */
export async function initCloudSync(): Promise<boolean> {
  if (!isWeb) return false;

  onDataChange(() => {
    if (suppress === 0) schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.dirty) syncNow();
    if (document.visibilityState === 'visible' && state.dirty && state.status !== 'conflict') schedule();
  });
  window.addEventListener('online', () => {
    if (state.dirty) syncNow();
  });

  let justConnected = false;
  try {
    justConnected = await dbx.completeSignInFromUrl();
  } catch (e: any) {
    Alert.alert('Dropbox', e?.message || 'Sign-in failed.');
  }

  if (!dbx.isConnected()) {
    setState({ status: 'disconnected' });
    return false;
  }
  setState({ status: 'idle' });

  if (justConnected) {
    persist({ rev: undefined });
    let meta: dbx.FileMeta | null = null;
    try {
      meta = await dbx.getMetadata(DATA_PATH);
    } catch (e: any) {
      setState({ status: 'error', error: e?.message });
      return false;
    }
    const hasLocal = !!(await getAuthor()) || (await getAllPlaces()).length > 0;
    if (!meta) {
      // Nothing in Dropbox yet: start backing up this device.
      if (hasLocal) await syncNow();
      Alert.alert('Dropbox connected', hasLocal ? 'Your data is now backed up to Dropbox and will stay in sync.' : 'Dropbox is connected. Your data will be backed up as you add places.');
      return false;
    }
    if (!hasLocal) {
      // New phone: just bring everything back.
      return restoreFromCloud();
    }
    const summary = await cloudSummary();
    return new Promise(resolve => {
      Alert.alert(
        'Dropbox already has a backup',
        `Found a Chowder backup in Dropbox${summary ? ` (${summary})` : ''}. Restore it to this phone, or replace it with this phone's data?`,
        [
          { text: 'Decide later', style: 'cancel', onPress: () => { setState({ status: 'conflict' }); resolve(false); } },
          { text: 'Replace Dropbox copy', onPress: () => { syncNow(true).then(() => resolve(false)); } },
          { text: 'Restore to this phone', style: 'destructive', onPress: () => { restoreFromCloud().then(resolve); } },
        ]
      );
    });
  }

  // Normal launch: push anything left unsynced from last time.
  if (state.dirty) schedule();
  return false;
}
