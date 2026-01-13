// Tile provider configurations for map views
// All providers are free to use (some may require API keys for higher usage)

export interface TileProvider {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom?: number;
  requiresApiKey?: boolean;
  description?: string;
}

export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    description: 'Standard street map with good coverage worldwide',
  },
  {
    id: 'carto-positron',
    name: 'CartoDB Positron',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 19,
    description: 'Clean, minimal light theme',
  },
  {
    id: 'carto-dark',
    name: 'CartoDB Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 19,
    description: 'Dark theme for low-light viewing',
  },
  {
    id: 'stamen-terrain',
    name: 'Stamen Terrain',
    url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png',
    attribution: 'Map tiles by Stamen Design, © OpenStreetMap contributors',
    maxZoom: 18,
    description: 'Shows terrain features and elevation',
  },
  {
    id: 'stamen-toner',
    name: 'Stamen Toner',
    url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',
    attribution: 'Map tiles by Stamen Design, © OpenStreetMap contributors',
    maxZoom: 20,
    description: 'High contrast black & white style',
  },
  {
    id: 'esri-worldimagery',
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, GeoEye, Earthstar Geographics',
    maxZoom: 19,
    description: 'Satellite and aerial imagery',
  },
  {
    id: 'esri-worldstreetmap',
    name: 'Esri Street Map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    maxZoom: 19,
    description: 'Detailed street map with labels',
  },
  {
    id: 'wikimedia',
    name: 'Wikimedia Maps',
    url: 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, © Wikimedia Foundation',
    maxZoom: 19,
    description: 'Multilingual labels for international use',
  },
];

// Default provider
export const DEFAULT_TILE_PROVIDER = 'osm';

// Get tile provider by ID
export function getTileProvider(id: string): TileProvider {
  return TILE_PROVIDERS.find(p => p.id === id) || TILE_PROVIDERS[0];
}

// Get current tile provider preference (stored in localStorage/AsyncStorage)
export async function getTileProviderPreference(): Promise<string> {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem('chowder_tile_provider') || DEFAULT_TILE_PROVIDER;
  }
  // For native, you could use AsyncStorage here
  return DEFAULT_TILE_PROVIDER;
}

// Set tile provider preference
export async function setTileProviderPreference(id: string): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('chowder_tile_provider', id);
  }
  // For native, you could use AsyncStorage here
}
