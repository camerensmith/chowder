import * as storage from './storage';

// Map styles offered on the web map (Settings → Map Style). All free, no API key.

export interface TileProvider {
  id: string;
  name: string;
  /** 'vector' styles are defined in lib/mapStyles.ts; 'raster' use `url`. */
  kind: 'vector' | 'raster';
  url?: string;
  attribution: string;
  maxZoom?: number;
  requiresApiKey?: boolean;
  description?: string;
}

// Only providers verified to render real map tiles in a browser without an API key.
// Removed because they no longer work for third-party sites: Organic Maps (no
// public tile server), Stamen (shut down 2023), Wikimedia (blocks other sites),
// and Carto basemaps (now serve an "API KEY REQUIRED" placeholder image).
export const TILE_PROVIDERS: TileProvider[] = [
  {
    id: 'chowder',
    name: 'Chowder',
    kind: 'vector',
    attribution: '© OpenFreeMap © OpenStreetMap contributors',
    maxZoom: 20,
    description: 'Clean, soft map in the style of Apple Maps (default)',
  },
  {
    id: 'osm',
    kind: 'raster',
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    description: 'Classic OpenStreetMap with lots of detail',
  },
  {
    id: 'esri-worldstreetmap',
    kind: 'raster',
    name: 'Esri Street Map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    maxZoom: 19,
    description: 'Clean street map with clear labels',
  },
  {
    id: 'esri-worldimagery',
    kind: 'raster',
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
    description: 'Satellite and aerial imagery',
  },
];

export const DEFAULT_TILE_PROVIDER = 'chowder';
const TILE_PROVIDER_KEY = 'chowder_tile_provider';

/** Unknown/removed ids (e.g. the old broken defaults) fall back to the default. */
export function getTileProvider(id: string): TileProvider {
  return TILE_PROVIDERS.find(p => p.id === id) || TILE_PROVIDERS[0];
}

export async function getTileProviderPreference(): Promise<string> {
  return getTileProvider((await storage.getItem(TILE_PROVIDER_KEY)) || DEFAULT_TILE_PROVIDER).id;
}

export async function setTileProviderPreference(id: string): Promise<void> {
  await storage.setItem(TILE_PROVIDER_KEY, id);
}

/** Call `listener` whenever the tile provider preference changes. */
export function onTileProviderChange(listener: (id: string) => void): () => void {
  return storage.subscribe((key, value) => {
    if (key === TILE_PROVIDER_KEY) listener(getTileProvider(value || DEFAULT_TILE_PROVIDER).id);
  });
}
