// Map utilities - Nominatim search for places
import { Platform } from 'react-native';

// Browsers identify the app via Referer; a custom User-Agent there only adds a
// CORS preflight to every request. Native apps must identify themselves.
const NOMINATIM_HEADERS: Record<string, string> = Platform.OS === 'web' ? {} : { 'User-Agent': 'Chowder/1.0' };

export interface NominatimResult {
  place_id: number;
  name: string;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  address?: {
    road?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}

export interface SearchOptions {
  latitude?: number;
  longitude?: number;
  viewbox?: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  };
  radius?: number; // in kilometers
}

export async function searchPlaces(
  query: string,
  options?: SearchOptions
): Promise<NominatimResult[]> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.append('q', query);
    url.searchParams.append('format', 'json');
    url.searchParams.append('addressdetails', '1');
    url.searchParams.append('limit', '20');
    
    // Add location bias to prioritize results near the user
    if (options?.latitude && options?.longitude) {
      // Use viewbox to bias results to a specific area
      if (options.viewbox) {
        const { minLon, minLat, maxLon, maxLat } = options.viewbox;
        url.searchParams.append('viewbox', `${minLon},${maxLat},${maxLon},${minLat}`);
        url.searchParams.append('bounded', '1'); // Only return results within viewbox
      } else {
        // Use a radius-based viewbox around the center point
        const radius = options.radius || 10; // Default 10km radius
        const latDelta = radius / 111; // Rough conversion: 1 degree latitude ≈ 111km
        const lonDelta = radius / (111 * Math.cos((options.latitude * Math.PI) / 180));
        
        const minLat = options.latitude - latDelta;
        const maxLat = options.latitude + latDelta;
        const minLon = options.longitude - lonDelta;
        const maxLon = options.longitude + lonDelta;
        
        url.searchParams.append('viewbox', `${minLon},${maxLat},${maxLon},${minLat}`);
        url.searchParams.append('bounded', '0'); // Allow results outside but bias towards viewbox
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        ...NOMINATIM_HEADERS,
      },
    });

    if (!response.ok) {
      if (response.status === 503 || response.status === 429) {
        console.warn('Nominatim API temporarily unavailable');
        return [];
      }
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Nominatim search error:', error);
    return [];
  }
}

export function extractCoordinates(result: NominatimResult): { latitude: number; longitude: number } {
  return {
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
  };
}

export function formatAddress(result: NominatimResult): string {
  if (result.address) {
    const parts = [
      result.address.road,
      result.address.city || result.address.county,
      result.address.state,
    ].filter(Boolean);
    return parts.join(', ');
  }
  return result.display_name;
}

// Reverse geocoding: get address from coordinates
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.append('lat', latitude.toString());
    url.searchParams.append('lon', longitude.toString());
    url.searchParams.append('format', 'json');
    url.searchParams.append('addressdetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        ...NOMINATIM_HEADERS,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.display_name || null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

export interface ReverseGeocodeDetail {
  address: string;       // Human-readable short address
  placeName?: string;    // Named place at this location (e.g. restaurant, shop), if any
}

// Returns true when the Nominatim result represents a specific named place (e.g. restaurant,
// café, hotel, shop, attraction) rather than a geographic area or road.
// These results should offer an "Add to Chowder" action rather than just panning the map.
const SPECIFIC_PLACE_CLASSES = new Set(['amenity', 'shop', 'tourism', 'leisure', 'historic', 'craft', 'office']);
const LOCATION_CLASSES = new Set(['place', 'boundary', 'natural', 'highway', 'railway', 'waterway', 'landuse', 'administrative']);

export function isSpecificPlace(result: NominatimResult): boolean {
  if (LOCATION_CLASSES.has(result.class)) return false;
  if (SPECIFIC_PLACE_CLASSES.has(result.class)) return true;
  // Fallback: if the top-level `name` is populated and differs from a geographic type, treat as specific
  return Boolean(result.name && result.name.length > 0);
}

// Reverse geocoding with place name detection
export async function reverseGeocodeDetailed(latitude: number, longitude: number): Promise<ReverseGeocodeDetail | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.append('lat', latitude.toString());
    url.searchParams.append('lon', longitude.toString());
    url.searchParams.append('format', 'json');
    url.searchParams.append('addressdetails', '1');
    url.searchParams.append('namedetails', '1');

    const response = await fetch(url.toString(), {
      headers: {
        ...NOMINATIM_HEADERS,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Build a short human-readable address
    const addr = data.address || {};
    const parts = [
      addr.road ? (addr.house_number ? `${addr.house_number} ${addr.road}` : addr.road) : undefined,
      addr.city || addr.town || addr.village || addr.county,
      addr.state,
    ].filter(Boolean);
    const address = parts.join(', ') || data.display_name || '';

    // A "place name" is the top-level name when it differs from the road/address
    // Nominatim sets `name` when the result is a named amenity/shop/POI rather than a plain address
    const nameDetails = data.namedetails || {};
    const placeName: string | undefined =
      nameDetails.name && nameDetails.name !== addr.road ? nameDetails.name : undefined;

    return { address, placeName };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

// ===== Place search (Photon) =====
// Photon (photon.komoot.io) is OpenStreetMap search built for type-ahead with a
// location bias, so "pizza" finds pizza places near where you're looking —
// Nominatim is address-oriented and often returned results in another state.

export interface PlaceSearchResult {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  /** 'place' = a specific business/POI you can save; 'area' = city, street, neighbourhood… */
  kind: 'place' | 'area';
  /** e.g. "restaurant", "cafe", "city" */
  type?: string;
}

const AREA_KEYS = new Set(['place', 'boundary', 'highway', 'landuse', 'natural', 'waterway', 'railway']);

export async function searchNearby(
  query: string,
  near?: { latitude: number; longitude: number },
  signal?: AbortSignal
): Promise<PlaceSearchResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '12');
  url.searchParams.set('lang', 'en');
  if (near) {
    url.searchParams.set('lat', near.latitude.toFixed(5));
    url.searchParams.set('lon', near.longitude.toFixed(5));
    url.searchParams.set('location_bias_scale', '0.5');
  }
  const response = await fetch(url.toString(), { signal });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  const data = await response.json();
  const seen = new Set<string>();
  const results: PlaceSearchResult[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (!p.name || typeof lat !== 'number') continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const address = [street, p.city || p.district || p.county, street ? undefined : p.state].filter(Boolean).join(', ');
    const key = `${p.name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      id: `${p.osm_type ?? ''}${p.osm_id ?? key}`,
      name: p.name,
      address: address || undefined,
      latitude: lat,
      longitude: lng,
      kind: AREA_KEYS.has(p.osm_key) ? 'area' : 'place',
      type: p.osm_value,
    });
  }
  // Distance from the bias point keeps "nearest first" ordering when Photon's ranking ties.
  if (near) {
    const d = (r: PlaceSearchResult) => (r.latitude - near.latitude) ** 2 + ((r.longitude - near.longitude) * Math.cos((near.latitude * Math.PI) / 180)) ** 2;
    const places = results.filter(r => r.kind === 'place').sort((a, b) => d(a) - d(b));
    const areas = results.filter(r => r.kind === 'area');
    return [...places, ...areas];
  }
  return results;
}
