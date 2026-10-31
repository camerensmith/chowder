// Share codes: the whole list is encoded inside the code itself, so it can be
// imported on any device without a server.
//
// Format: "chowder1:" + base64url(JSON with short keys)
// A share link is the web app URL with "#share=<code>".

import { Platform } from 'react-native';
import { SharePayload } from '../types';

const PREFIX = 'chowder1:';
/** Public web build, used for share links sent from native. */
export const WEB_APP_URL = 'https://camerensmith.github.io/chowder/';

// --- UTF-8 + base64url (no dependency on btoa/TextEncoder, which vary by JS engine) ---

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(str: string): number[] {
  const bytes: number[] = [];
  for (const ch of str) {
    let cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b < 0xf0) cp = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    out += String.fromCodePoint(cp);
  }
  return out;
}

function base64UrlEncode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

function base64UrlDecode(str: string): number[] {
  const clean = str.replace(/\+/g, '-').replace(/\//g, '_').replace(/[=\s]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const vals = [...chunk].map(c => {
      const v = B64.indexOf(c);
      if (v < 0) throw new Error('Invalid character in share code');
      return v;
    });
    const n = (vals[0] << 18) | (vals[1] << 12) | ((vals[2] ?? 0) << 6) | (vals[3] ?? 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return bytes;
}

// --- payload <-> code ---

const round = (n: number) => Math.round(n * 1e5) / 1e5; // ~1m precision keeps codes short

export function generateShareCode(payload: SharePayload): string {
  const compact = {
    t: payload.type,
    n: payload.title,
    a: payload.authorName,
    p: payload.places.map(p => [p.name, round(p.lat), round(p.lng), p.address ?? '', p.category ?? '']),
  };
  return PREFIX + base64UrlEncode(utf8Encode(JSON.stringify(compact)));
}

/** Accepts a bare code, a code with surrounding text/whitespace, or a full share link. */
export function parseShareCode(input: string): SharePayload {
  const match = input.match(/chowder1:([A-Za-z0-9\-_+/=]+)/);
  if (!match) throw new Error('That doesn\'t look like a Chowder share code.');
  let data: any;
  try {
    data = JSON.parse(utf8Decode(base64UrlDecode(match[1])));
  } catch {
    throw new Error('This share code is incomplete or corrupted. Ask your friend to send it again.');
  }
  if (!data || !Array.isArray(data.p)) throw new Error('This share code is missing its places.');
  return {
    type: data.t === 'map' ? 'map' : 'list',
    title: String(data.n || 'Shared list'),
    authorName: String(data.a || 'A friend'),
    places: data.p.map((p: any[], i: number) => ({
      id: String(i),
      name: String(p[0] || 'Unnamed place'),
      lat: Number(p[1]),
      lng: Number(p[2]),
      address: p[3] || undefined,
      category: p[4] || undefined,
    })).filter((p: { lat: number; lng: number }) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
  };
}

export function buildShareLink(code: string): string {
  let base = WEB_APP_URL;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    base = window.location.origin + window.location.pathname;
  }
  return `${base}#share=${encodeURIComponent(code)}`;
}

let pendingShareCode: string | null = null;

/** Also handle share links opened while the app is already running (hash change, no reload). */
export function listenForShareLinks(onShare: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  const handler = () => {
    captureShareCodeFromUrl();
    if (pendingShareCode) onShare();
  };
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}

/** On web, pick up a `#share=` code from the URL (once) and clear it from the address bar. */
export function captureShareCodeFromUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const match = window.location.hash.match(/share=([^&]+)/);
  if (!match) return;
  pendingShareCode = decodeURIComponent(match[1]);
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

export function takePendingShareCode(): string | null {
  const code = pendingShareCode;
  pendingShareCode = null;
  return code;
}
