// Fuzzy, food-aware search.
//
// - Your places: matches name, category, dishes, tags, address and notes;
//   accent-insensitive ("phở" = "pho") and tolerant of small typos ("raman").
// - New places: food words ("pho", "ramen", "tacos", "dim sum"…) become a
//   cuisine search on OpenStreetMap (Overpass) near the map, so "pho" finds
//   Vietnamese restaurants — not just businesses with "pho" in their name.

import { PlaceSearchResult } from './maps';

export function fold(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

interface FoodTerm {
  /** OSM cuisine values (matched case-insensitively, also inside "a;b" lists). */
  cuisines: string[];
  /** Words to look for in business names. */
  names?: string[];
  /** Words that mean the same thing for your own places (categories, dishes). */
  related?: string[];
  amenity?: string[];
  shop?: string[];
  diet?: string;
}

const T = (cuisines: string[], extra: Partial<FoodTerm> = {}): FoodTerm => ({ cuisines, ...extra });

// Keys are folded single words or short phrases.
const FOOD_TERMS: Record<string, FoodTerm> = {
  pho: T(['vietnamese', 'pho'], { names: ['pho'], related: ['vietnamese'] }),
  banh: T(['vietnamese'], { names: ['banh mi', 'banh'], related: ['vietnamese', 'sandwich'] }),
  'banh mi': T(['vietnamese'], { names: ['banh mi'], related: ['vietnamese', 'sandwich'] }),
  vietnamese: T(['vietnamese', 'pho'], { related: ['pho', 'banh mi'] }),
  ramen: T(['ramen', 'japanese'], { names: ['ramen'], related: ['japanese'] }),
  udon: T(['udon', 'japanese'], { names: ['udon'], related: ['japanese'] }),
  sushi: T(['sushi', 'japanese'], { names: ['sushi'], related: ['japanese'] }),
  japanese: T(['japanese', 'sushi', 'ramen']),
  pizza: T(['pizza'], { names: ['pizza', 'pizzeria'], related: ['italian'] }),
  italian: T(['italian', 'pizza', 'pasta']),
  pasta: T(['italian', 'pasta'], { names: ['pasta'], related: ['italian'] }),
  taco: T(['mexican', 'tacos', 'tex-mex'], { names: ['taco', 'taqueria'], related: ['mexican'] }),
  tacos: T(['mexican', 'tacos', 'tex-mex'], { names: ['taco', 'taqueria'], related: ['mexican'] }),
  burrito: T(['mexican', 'tex-mex'], { names: ['burrito'], related: ['mexican'] }),
  mexican: T(['mexican', 'tacos', 'tex-mex']),
  bagel: T(['bagel'], { names: ['bagel'], shop: ['bakery', 'deli'], related: ['bagels', 'breakfast'] }),
  bagels: T(['bagel'], { names: ['bagel'], shop: ['bakery', 'deli'], related: ['bagel', 'breakfast'] }),
  dumpling: T(['dumpling', 'chinese', 'dim_sum'], { names: ['dumpling'], related: ['chinese'] }),
  dumplings: T(['dumpling', 'chinese', 'dim_sum'], { names: ['dumpling'], related: ['chinese'] }),
  'dim sum': T(['dim_sum', 'cantonese', 'chinese'], { names: ['dim sum'], related: ['cantonese', 'chinese'] }),
  chinese: T(['chinese', 'cantonese', 'sichuan', 'dim_sum', 'dumpling']),
  cantonese: T(['cantonese', 'dim_sum', 'chinese']),
  sichuan: T(['sichuan', 'szechuan', 'chinese'], { related: ['szechuan'] }),
  szechuan: T(['sichuan', 'szechuan', 'chinese'], { related: ['sichuan'] }),
  noodle: T(['noodle', 'ramen', 'vietnamese', 'chinese'], { names: ['noodle'], related: ['ramen', 'pho', 'udon'] }),
  noodles: T(['noodle', 'ramen', 'vietnamese', 'chinese'], { names: ['noodle'], related: ['ramen', 'pho', 'udon'] }),
  thai: T(['thai'], { related: ['pad thai'] }),
  indian: T(['indian', 'bengali', 'pakistani', 'curry']),
  curry: T(['indian', 'curry', 'thai', 'japanese'], { names: ['curry'] }),
  korean: T(['korean'], { related: ['kbbq', 'bibimbap'] }),
  kbbq: T(['korean', 'barbecue'], { related: ['korean', 'bbq'] }),
  bbq: T(['barbecue', 'bbq'], { names: ['bbq', 'barbecue', 'smokehouse'], related: ['barbecue'] }),
  barbecue: T(['barbecue', 'bbq'], { names: ['bbq', 'barbecue', 'smokehouse'], related: ['bbq'] }),
  burger: T(['burger'], { names: ['burger'], related: ['burgers'] }),
  burgers: T(['burger'], { names: ['burger'], related: ['burger'] }),
  chicken: T(['chicken', 'fried_chicken'], { names: ['chicken'] }),
  wings: T(['chicken', 'wings'], { names: ['wings'], related: ['chicken'] }),
  sandwich: T(['sandwich', 'deli'], { names: ['sandwich', 'deli'], related: ['deli'] }),
  deli: T(['deli', 'sandwich', 'jewish'], { names: ['deli'], shop: ['deli'] }),
  halal: T(['halal', 'middle_eastern', 'kebab'], { diet: 'halal', related: ['halal'] }),
  kosher: T(['kosher', 'jewish'], { diet: 'kosher' }),
  vegan: T(['vegan'], { diet: 'vegan' }),
  vegetarian: T(['vegetarian'], { diet: 'vegetarian' }),
  falafel: T(['falafel', 'middle_eastern', 'lebanese'], { names: ['falafel'] }),
  kebab: T(['kebab', 'turkish', 'middle_eastern'], { names: ['kebab'] }),
  greek: T(['greek'], { related: ['gyro'] }),
  gyro: T(['greek', 'kebab'], { names: ['gyro'] }),
  french: T(['french']),
  steak: T(['steak_house', 'steak'], { names: ['steak'] }),
  seafood: T(['seafood', 'fish', 'oyster'], { names: ['seafood', 'oyster', 'fish'] }),
  oysters: T(['seafood', 'oyster'], { names: ['oyster'] }),
  brunch: T(['breakfast', 'brunch'], { names: ['brunch'] }),
  breakfast: T(['breakfast', 'brunch'], { names: ['breakfast'] }),
  coffee: T(['coffee_shop', 'coffee'], { amenity: ['cafe'], names: ['coffee'] }),
  cafe: T(['coffee_shop'], { amenity: ['cafe'] }),
  bakery: T(['bakery', 'pastry'], { shop: ['bakery', 'pastry'] }),
  boba: T(['bubble_tea'], { names: ['boba', 'bubble tea'], related: ['bubble tea'] }),
  'bubble tea': T(['bubble_tea'], { names: ['boba', 'bubble tea'], related: ['boba'] }),
  'ice cream': T(['ice_cream', 'gelato'], { amenity: ['ice_cream'], names: ['ice cream', 'gelato', 'creamery'] }),
  gelato: T(['ice_cream', 'gelato'], { amenity: ['ice_cream'], names: ['gelato'] }),
  dessert: T(['dessert', 'ice_cream', 'cake'], { amenity: ['ice_cream'], shop: ['pastry', 'confectionery'] }),
};

const FOOD_AMENITIES = ['restaurant', 'fast_food', 'cafe', 'food_court', 'ice_cream', 'bar', 'pub', 'biergarten'];

/** Food meaning of a query, if it has one (whole phrase first, then each word). */
export function foodTerm(query: string): FoodTerm | null {
  const q = fold(query);
  if (!q) return null;
  if (FOOD_TERMS[q]) return FOOD_TERMS[q];
  const words = q.split(' ');
  for (let i = 0; i < words.length - 1; i++) {
    const two = `${words[i]} ${words[i + 1]}`;
    if (FOOD_TERMS[two]) return FOOD_TERMS[two];
  }
  for (const w of words) if (FOOD_TERMS[w]) return FOOD_TERMS[w];
  // Typo tolerance for food words ("raman", "suhsi").
  for (const w of words) {
    if (w.length < 4) continue;
    const near = Object.keys(FOOD_TERMS).find(k => !k.includes(' ') && Math.abs(k.length - w.length) <= 1 && editDistance(k, w) <= 1);
    if (near) return FOOD_TERMS[near];
  }
  return null;
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

/** Does `text` contain the (folded) query as a word prefix, or a near-miss word? */
function fuzzyHit(text: string | undefined, q: string): 'exact' | 'fuzzy' | null {
  if (!text) return null;
  const t = fold(text);
  if (!t) return null;
  if (t.includes(q)) return 'exact';
  if (q.length >= 4) {
    for (const w of t.split(' ')) {
      if (Math.abs(w.length - q.length) <= 1 && editDistance(w, q) <= 1) return 'fuzzy';
    }
  }
  return null;
}

export interface SavedSearchContext {
  categoryName: (id?: string) => string | undefined;
  dishesFor: (placeId: string) => { name: string; categoryName?: string }[];
  tagNames: (tagIds?: string[]) => string[];
}

export interface SavedMatch<P> {
  place: P;
  score: number;
  /** Why it matched, shown under the name ("Dish: Pho tai", "Category: Vietnamese"). */
  reason?: string;
}

/** Rank your saved places for a free-text query. */
export function searchSaved<P extends { id: string; name: string; address?: string; notes?: string; categoryId?: string; tagIds?: string[] }>(
  query: string,
  places: P[],
  ctx: SavedSearchContext
): SavedMatch<P>[] {
  const q = fold(query);
  if (!q) return [];
  const term = foodTerm(q);
  const related = term ? [...new Set([...(term.related ?? []), ...term.cuisines.map(c => c.replace(/_/g, ' '))])] : [];
  const out: SavedMatch<P>[] = [];

  for (const p of places) {
    let score = 0;
    let reason: string | undefined;
    const bump = (s: number, why?: string) => {
      if (s > score) { score = s; reason = why; }
    };
    const name = fuzzyHit(p.name, q);
    if (name) bump(fold(p.name).startsWith(q) ? 100 : name === 'exact' ? 90 : 60);
    const cat = ctx.categoryName(p.categoryId);
    if (fuzzyHit(cat, q)) bump(70, `Category: ${cat}`);
    for (const d of ctx.dishesFor(p.id)) {
      if (fuzzyHit(d.name, q)) bump(65, `Dish: ${d.name}`);
      else if (fuzzyHit(d.categoryName, q)) bump(55, `Dish: ${d.name}`);
    }
    for (const t of ctx.tagNames(p.tagIds)) if (fuzzyHit(t, q)) bump(50, `Tag: ${t}`);
    if (fuzzyHit(p.notes, q)) bump(35, 'In your notes');
    if (fuzzyHit(p.address, q)) bump(30);
    // Food meaning: "pho" also finds places filed under "Vietnamese".
    if (score === 0 && related.length) {
      for (const r of related) {
        const rf = fold(r);
        if (cat && fold(cat).includes(rf)) { bump(45, `Category: ${cat}`); break; }
        const dish = ctx.dishesFor(p.id).find(d => fold(d.name).includes(rf) || (d.categoryName && fold(d.categoryName).includes(rf)));
        if (dish) { bump(40, `Dish: ${dish.name}`); break; }
      }
    }
    if (score > 0) out.push({ place: p, score, reason });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 12);
}

// ---------- New places by cuisine (OpenStreetMap via Overpass) ----------

const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

function esc(s: string) {
  return s.replace(/[\\"]/g, '\\$&').replace(/[.*+?^${}()|[\]]/g, '\\$&');
}

export function buildOverpassQuery(term: FoodTerm, near: { latitude: number; longitude: number }, radiusM: number): string {
  const around = `(around:${radiusM},${near.latitude.toFixed(5)},${near.longitude.toFixed(5)})`;
  const amen = `"amenity"~"^(${[...FOOD_AMENITIES, ...(term.amenity ?? [])].join('|')})$"`;
  const parts: string[] = [];
  if (term.cuisines.length) {
    // cuisine can be a list like "vietnamese;pho"
    parts.push(`nwr[${amen}]["cuisine"~"(^|;) *(${term.cuisines.map(esc).join('|')}) *(;|$)",i]${around};`);
  }
  // Whole words only, so "pho" doesn't match "Phoenix Garden".
  const word = (n: string) => `(^|[^[:alnum:]])(${n === 'pho' ? 'pho|phở' : esc(n)})([^[:alnum:]]|$)`;
  for (const n of term.names ?? []) parts.push(`nwr[${amen}]["name"~"${word(n)}",i]${around};`);
  if (term.amenity?.length) parts.push(`nwr["amenity"~"^(${term.amenity.join('|')})$"]${around};`);
  if (term.shop?.length) parts.push(`nwr["shop"~"^(${term.shop.join('|')})$"]${term.names?.length ? `["name"~"${term.names.map(esc).join('|')}",i]` : ''}${around};`);
  if (term.diet) parts.push(`nwr[${amen}]["diet:${term.diet}"~"yes|only"]${around};`);
  return `[out:json][timeout:15];(${parts.join('')});out center tags 60;`;
}

function addressOf(t: Record<string, string>): string | undefined {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return [street, t['addr:city']].filter(Boolean).join(', ') || undefined;
}

const cuisineCache = new Map<string, { at: number; results: PlaceSearchResult[] }>();
const CACHE_MS = 10 * 60 * 1000;

export async function searchByCuisine(
  query: string,
  near: { latitude: number; longitude: number },
  signal?: AbortSignal,
  radiusM = 2500
): Promise<PlaceSearchResult[]> {
  const term = foodTerm(query);
  if (!term) return [];
  // Same food word in roughly the same area (~1 km) within 10 min: reuse.
  const cacheKey = `${term.cuisines.join(',')}|${(term.names ?? []).join(',')}|${near.latitude.toFixed(2)},${near.longitude.toFixed(2)}`;
  const cached = cuisineCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.results;
  const body = 'data=' + encodeURIComponent(buildOverpassQuery(term, near, radiusM));
  let lastError: unknown;
  for (const url of OVERPASS_ENDPOINTS) {
    // Each server gets ~6 s; a slow one falls through to the next.
    const c = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const onAbort = () => c?.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => c?.abort(), 6000);
    try {
      const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: c?.signal ?? signal });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const data = await res.json();
      const seen = new Set<string>();
      const out: PlaceSearchResult[] = [];
      for (const e of data.elements ?? []) {
        const t = e.tags ?? {};
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        if (!t.name || typeof lat !== 'number') continue;
        const key = `${fold(t.name)}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cuisine = (t.cuisine || '').split(';')[0].replace(/_/g, ' ');
        out.push({
          id: `osm-${e.type}-${e.id}`,
          name: t.name,
          address: [cuisine && cuisine[0].toUpperCase() + cuisine.slice(1), addressOf(t)].filter(Boolean).join(' · ') || undefined,
          latitude: lat,
          longitude: lng,
          kind: 'place',
          type: t.amenity || t.shop,
        });
      }
      cuisineCache.set(cacheKey, { at: Date.now(), results: out });
      return out;
    } catch (e: any) {
      if (signal?.aborted) throw e; // the search changed; stop
      lastError = e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError;
}

const FOOD_TYPES = new Set([...FOOD_AMENITIES, 'bakery', 'deli', 'pastry', 'confectionery', 'coffee', 'tea', 'butcher', 'cheese', 'greengrocer', 'seafood', 'wine', 'alcohol', 'beverages', 'food']);
/** For food queries, drop non-food name matches ("Phoenix Community Garden", "Phone Store"). */
export function isFoodResult(r: PlaceSearchResult): boolean {
  return r.kind === 'place' && !!r.type && FOOD_TYPES.has(r.type);
}

export function distanceSq(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const k = Math.cos((a.latitude * Math.PI) / 180);
  return (a.latitude - b.latitude) ** 2 + ((a.longitude - b.longitude) * k) ** 2;
}
