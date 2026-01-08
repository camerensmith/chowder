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

export async function searchPlaces(query: string): Promise<NominatimResult[]> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.append('q', query);
    url.searchParams.append('format', 'json');
    url.searchParams.append('addressdetails', '1');
    url.searchParams.append('limit', '20');

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
