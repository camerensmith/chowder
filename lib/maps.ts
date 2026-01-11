// Map utilities - Nominatim search for places

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
        'User-Agent': 'Chowder/1.0',
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
        'User-Agent': 'Chowder/1.0',
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
