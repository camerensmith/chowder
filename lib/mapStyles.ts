// Map styles for the web map (MapLibre GL).
//
// `chowderStyle` is a custom vector style inspired by Apple Maps' light
// appearance: warm neutral land, soft blue water, gentle greens, white streets
// with subtle casings, golden highways, low-contrast buildings, grey street
// labels and spaced-out neighbourhood names. Business/POI icons are left out
// on purpose so your own pins are the points of interest.
//
// Data: OpenFreeMap (free, no API key, OpenMapTiles schema).

import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';

const OFM = 'https://tiles.openfreemap.org';

const C = {
  land: '#F4F2EE',
  residential: '#EFECE6',
  park: '#CDE7C0',
  wood: '#D7EBCC',
  grass: '#DDEFD4',
  hospital: '#F8E4E4',
  school: '#EFEAE0',
  water: '#A9D3F4',
  waterLabel: '#4F86B8',
  building: '#E6E2DB',
  buildingOutline: '#D9D4CB',
  roadCasing: '#DCD7CE',
  road: '#FFFFFF',
  motorway: '#F7CB5C',
  motorwayCasing: '#E2AE3C',
  trunk: '#FBE09A',
  trunkCasing: '#E7C574',
  path: '#D5CFC4',
  rail: '#CFCAC2',
  boundary: '#B9B2C9',
  roadLabel: '#6E6A65',
  placeLabel: '#2F2D2A',
  neighbourhoodLabel: '#8E8880',
  halo: '#FFFFFF',
};

const zoomWidth = (stops: [number, number][]): ExpressionSpecification =>
  ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()] as unknown as ExpressionSpecification;

const cls = (...classes: string[]): ExpressionSpecification =>
  ['match', ['get', 'class'], classes, true, false] as unknown as ExpressionSpecification;

const notTunnel: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
const name: ExpressionSpecification = ['coalesce', ['get', 'name:latin'], ['get', 'name']];

function roadPair(id: string, classes: string[], minzoom: number, casing: string, fill: string, widths: [number, number][]) {
  return [
    {
      id: `${id}-casing`,
      type: 'line' as const,
      source: 'omt',
      'source-layer': 'transportation',
      minzoom,
      filter: ['all', cls(...classes), notTunnel] as ExpressionSpecification,
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': casing, 'line-width': zoomWidth(widths.map(([z, w]) => [z, w + 1.5])) },
    },
    {
      id,
      type: 'line' as const,
      source: 'omt',
      'source-layer': 'transportation',
      minzoom,
      filter: ['all', cls(...classes), notTunnel] as ExpressionSpecification,
      layout: { 'line-cap': 'round' as const, 'line-join': 'round' as const },
      paint: { 'line-color': fill, 'line-width': zoomWidth(widths) },
    },
  ];
}

export const chowderStyle: StyleSpecification = {
  version: 8,
  name: 'Chowder',
  glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    omt: {
      type: 'vector',
      url: `${OFM}/planet`,
      attribution: '© <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': C.land } },

    // --- land use / cover ---
    {
      id: 'residential', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: cls('residential', 'suburb', 'neighbourhood'),
      paint: { 'fill-color': C.residential, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 0.3] },
    },
    {
      id: 'hospital', type: 'fill', source: 'omt', 'source-layer': 'landuse', minzoom: 12,
      filter: cls('hospital'), paint: { 'fill-color': C.hospital },
    },
    {
      id: 'school', type: 'fill', source: 'omt', 'source-layer': 'landuse', minzoom: 12,
      filter: cls('school', 'university', 'college', 'kindergarten'), paint: { 'fill-color': C.school },
    },
    {
      id: 'wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: cls('wood', 'forest'), paint: { 'fill-color': C.wood, 'fill-opacity': 0.8 },
    },
    {
      id: 'grass', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: cls('grass', 'farmland', 'meadow', 'scrub'), paint: { 'fill-color': C.grass, 'fill-opacity': 0.6 },
    },
    {
      id: 'green-landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: cls('cemetery', 'pitch', 'stadium', 'playground', 'garden'), paint: { 'fill-color': C.grass },
    },
    {
      id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
      paint: { 'fill-color': C.park, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 1] },
    },

    // --- water ---
    {
      id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
      filter: notTunnel, paint: { 'fill-color': C.water },
    },
    {
      id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 8,
      filter: notTunnel,
      paint: { 'line-color': C.water, 'line-width': zoomWidth([[8, 0.5], [14, 2], [18, 6]]) },
    },

    // --- airports ---
    {
      id: 'aeroway', type: 'fill', source: 'omt', 'source-layer': 'aeroway', minzoom: 11,
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      paint: { 'fill-color': '#E9E7EF' },
    },

    // --- buildings fade in when zoomed in, like Apple's ---
    {
      id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14,
      paint: {
        'fill-color': C.building,
        'fill-outline-color': C.buildingOutline,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.5, 1],
      },
    },

    // --- roads (bottom to top) ---
    {
      id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 15,
      filter: cls('path', 'track'),
      paint: { 'line-color': C.path, 'line-width': 1, 'line-dasharray': [2, 2] },
    },
    {
      id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
      filter: ['all', cls('rail', 'transit'), notTunnel],
      paint: { 'line-color': C.rail, 'line-width': zoomWidth([[12, 0.75], [18, 2.5]]) },
    },
    ...roadPair('road-service', ['service'], 15, C.roadCasing, C.road, [[15, 1.5], [18, 6]]),
    ...roadPair('road-minor', ['minor'], 13, C.roadCasing, C.road, [[13, 0.5], [14, 2], [16, 6], [18, 14]]),
    ...roadPair('road-secondary', ['secondary', 'tertiary'], 9, C.roadCasing, C.road, [[9, 0.75], [12, 2], [14, 4], [16, 9], [18, 18]]),
    ...roadPair('road-primary', ['primary'], 7, C.roadCasing, C.road, [[7, 0.75], [10, 1.75], [13, 3.5], [16, 10], [18, 20]]),
    ...roadPair('road-trunk', ['trunk'], 5, C.trunkCasing, C.trunk, [[5, 0.75], [10, 2], [13, 4], [16, 11], [18, 22]]),
    ...roadPair('road-motorway', ['motorway'], 4, C.motorwayCasing, C.motorway, [[4, 0.75], [8, 1.5], [12, 3], [15, 7], [18, 22]]),

    // --- boundaries ---
    {
      id: 'boundary-state', type: 'line', source: 'omt', 'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': C.boundary, 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.6 },
    },
    {
      id: 'boundary-country', type: 'line', source: 'omt', 'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': C.boundary, 'line-width': zoomWidth([[3, 1], [10, 2]]) },
    },

    // --- labels ---
    {
      id: 'water-label', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
      filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
      layout: { 'text-field': name, 'text-font': ['Noto Sans Italic'], 'text-size': 13, 'text-max-width': 6 },
      paint: { 'text-color': C.waterLabel, 'text-halo-color': 'rgba(255,255,255,0.6)', 'text-halo-width': 1 },
    },
    {
      id: 'road-label-minor', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15,
      filter: cls('minor', 'service'),
      layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
      paint: { 'text-color': C.roadLabel, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'road-label-major', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 13,
      filter: cls('primary', 'secondary', 'tertiary', 'trunk'),
      layout: {
        'symbol-placement': 'line',
        'text-field': name,
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 16, 13],
      },
      paint: { 'text-color': C.roadLabel, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'park-label', type: 'symbol', source: 'omt', 'source-layer': 'park', minzoom: 13,
      filter: ['has', 'name'],
      layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-max-width': 7 },
      paint: { 'text-color': '#4E8A47', 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.2 },
    },
    {
      id: 'neighbourhood-label', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 12, maxzoom: 17,
      filter: cls('suburb', 'neighbourhood', 'quarter'),
      layout: {
        'text-field': ['upcase', name],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-letter-spacing': 0.15,
        'text-max-width': 8,
      },
      paint: { 'text-color': C.neighbourhoodLabel, 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1.2 },
    },
    {
      id: 'village-label', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 10,
      filter: cls('village', 'hamlet'),
      layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 12 },
      paint: { 'text-color': C.placeLabel, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'town-label', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 7,
      filter: cls('town'),
      layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 12, 15] },
      paint: { 'text-color': C.placeLabel, 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'city-label', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 3, maxzoom: 14,
      filter: cls('city'),
      layout: { 'text-field': name, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 12, 18] },
      paint: { 'text-color': C.placeLabel, 'text-halo-color': C.halo, 'text-halo-width': 2 },
    },
    {
      id: 'state-label', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 4, maxzoom: 8,
      filter: cls('state'),
      layout: { 'text-field': ['upcase', name], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-letter-spacing': 0.2 },
      paint: { 'text-color': C.neighbourhoodLabel, 'text-halo-color': C.halo, 'text-halo-width': 1 },
    },
    {
      id: 'country-label', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 7,
      filter: cls('country'),
      layout: { 'text-field': name, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 6, 15] },
      paint: { 'text-color': '#55524D', 'text-halo-color': C.halo, 'text-halo-width': 1.5 },
    },
  ],
} as StyleSpecification;

/** Wrap a raster tile URL as a MapLibre style. */
export function rasterStyle(url: string, attribution: string, maxzoom = 19): StyleSpecification {
  return {
    version: 8,
    sources: {
      raster: { type: 'raster', tiles: [url], tileSize: 256, attribution, maxzoom },
    },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
  };
}
