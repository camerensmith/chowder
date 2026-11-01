// Optional Google rating footnote for "known" restaurants.
//
// Uses Google Places API (New) directly from the app (it allows browser calls
// from our origin). Looked up only when you open a place's card or page:
//   1. Text Search biased to the place's coordinates (first time only),
//      accepted only if the result is close by and the name matches — so we
//      never show some other restaurant's rating.
//   2. The Google place ID is remembered (allowed by Google's terms); the rating
//      itself is kept in memory for this session only.
// Requires a Google Maps Platform API key (Settings), restricted to this site.

import * as storage from './storage';
import { Place } from '../types';

/** Bake in a key here once registered (restrict it to https://camerensmith.github.io/* in Google Cloud). */
export const GOOGLE_PLACES_KEY_DEFAULT = '';

const KEY_KEY = 'chowder_google_places_key';
const ENABLED_KEY = 'chowder_show_google_ratings';
const IDS_KEY = 'chowder_google_place_ids'; // { [chowderPlaceId]: googlePlaceId | '' (no match) }
const API = 'https://places.googleapis.com/v1';
const MATCH_RADIUS_M = 200;

export interface GoogleRating {
  rating: number;
  count: number;
  url?: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();
const session = new Map<string, GoogleRating | null>(); // keyed by chowder place id
const inflight = new Map<string, Promise<GoogleRating | null>>();

export function onGoogleSettingsChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
const emit = () => listeners.forEach(l => l());

export async function getGoogleKey(): Promise<string> {
  return GOOGLE_PLACES_KEY_DEFAULT || (await storage.getItem(KEY_KEY)) || '';
}
export async function setGoogleKey(key: string) {
  await storage.setItem(KEY_KEY, key.trim());
  session.clear();
  emit();
}
/** On by default (shows only once a key is set). */
export async function getShowGoogleRatings(): Promise<boolean> {
  return (await storage.getItem(ENABLED_KEY)) !== '0';
}
export async function setShowGoogleRatings(on: boolean) {
  await storage.setItem(ENABLED_KEY, on ? '1' : '0');
  emit();
}

async function loadIds(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await storage.getItem(IDS_KEY)) || '{}');
  } catch {
    return {};
  }
}
async function saveId(placeId: string, googleId: string) {
  const ids = await loadIds();
  ids[placeId] = googleId;
  await storage.setItem(IDS_KEY, JSON.stringify(ids));
}

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const STOP = new Set(['the', 'and', 'restaurant', 'cafe', 'bar', 'nyc', 'new', 'york', 'of', 'a']);
function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`]s\b/g, '').replace(/[^a-z0-9]+/g, ' ')
      .split(' ').filter(t => t.length > 1 && !STOP.has(t))
  );
}
/** Share of the shorter name's words found in the other (handles "Joe's" vs "Joe's Pizza - Carmine St"). */
export function nameMatch(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hit = 0;
  small.forEach(t => { if (big.has(t)) hit++; });
  return hit / small.size;
}

async function api(path: string, key: string, fieldMask: string, body?: object): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Google Places error ${res.status}`);
  return res.json();
}

function toRating(p: any): GoogleRating | null {
  if (typeof p?.rating !== 'number') return null;
  return { rating: p.rating, count: p.userRatingCount ?? 0, url: p.googleMapsUri };
}

async function lookup(place: Place, key: string): Promise<GoogleRating | null> {
  const ids = await loadIds();
  const known = ids[place.id];
  if (known === '') return null; // looked before, not a known Google place
  if (known) {
    const p = await api(`/places/${encodeURIComponent(known)}`, key, 'rating,userRatingCount,googleMapsUri');
    return toRating(p);
  }
  const data = await api('/places:searchText', key, 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.googleMapsUri', {
    textQuery: place.name,
    maxResultCount: 5,
    locationBias: { circle: { center: { latitude: place.latitude, longitude: place.longitude }, radius: MATCH_RADIUS_M } },
  });
  const best = (data.places ?? [])
    .map((p: any) => ({
      p,
      dist: p.location ? distanceM(place.latitude, place.longitude, p.location.latitude, p.location.longitude) : Infinity,
      score: nameMatch(place.name, p.displayName?.text ?? ''),
    }))
    .filter((c: any) => c.dist <= MATCH_RADIUS_M && c.score >= 0.6)
    .sort((a: any, b: any) => b.score - a.score || a.dist - b.dist)[0];
  await saveId(place.id, best ? best.p.id : '');
  return best ? toRating(best.p) : null;
}

/** Rating for a saved place, or null if disabled, not configured, not a known Google place, or offline. */
export async function getGoogleRating(place: Place): Promise<GoogleRating | null> {
  if (!(await getShowGoogleRatings())) return null;
  const key = await getGoogleKey();
  if (!key) return null;
  if (session.has(place.id)) return session.get(place.id)!;
  if (!inflight.has(place.id)) {
    inflight.set(place.id, lookup(place, key)
      .then(r => { session.set(place.id, r); return r; })
      .catch(() => null) // network/quota errors: just show nothing
      .finally(() => inflight.delete(place.id)));
  }
  return inflight.get(place.id)!;
}

/** Forget a cached match (e.g. the place was renamed or moved). */
export async function forgetGoogleMatch(placeId: string) {
  session.delete(placeId);
  const ids = await loadIds();
  delete ids[placeId];
  await storage.setItem(IDS_KEY, JSON.stringify(ids));
}

/**
 * Google text search near a point (only when a key is configured). Handles
 * fuzzy dish/cuisine queries like "pho" very well. Requests only basic fields.
 */
export async function searchGoogleText(
  query: string,
  near: { latitude: number; longitude: number },
  signal?: AbortSignal
): Promise<import('./maps').PlaceSearchResult[]> {
  const key = await getGoogleKey();
  if (!key) return [];
  const res = await fetch(`${API}/places:searchText`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.primaryType',
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 15,
      locationBias: { circle: { center: { latitude: near.latitude, longitude: near.longitude }, radius: 3000 } },
    }),
  });
  if (!res.ok) throw new Error(`Google search ${res.status}`);
  const data = await res.json();
  return (data.places ?? [])
    .filter((p: any) => p.location && p.displayName?.text)
    .map((p: any) => ({
      id: `g-${p.id}`,
      name: p.displayName.text,
      address: p.shortFormattedAddress || p.formattedAddress,
      latitude: p.location.latitude,
      longitude: p.location.longitude,
      kind: 'place' as const,
      type: 'restaurant',
    }));
}
