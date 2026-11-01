// Web map (MapLibre GL, vector tiles).
//
// The map is created exactly once per mount. Props are mirrored into refs so
// callbacks always see current values without re-creating the map or the
// markers — re-creating them on every parent render is what caused the zoom
// resets, flicker and lost taps in earlier versions.

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { StyleSpecification } from 'maplibre-gl';
import { Place } from '../types';
import { getTileProvider, getTileProviderPreference, onTileProviderChange } from '../lib/tileProviders';
import { chowderStyle, rasterStyle } from '../lib/mapStyles';
import { MapViewProps, DEFAULT_CENTER, DEFAULT_ZOOM } from './mapTypes';

function assetUrl(mod: any): string {
  if (typeof mod === 'string') return mod;
  return mod?.uri ?? mod?.default?.uri ?? mod?.default ?? '';
}
const PIN_URL = assetUrl(require('../assets/pin.png'));

function styleFor(providerId: string): StyleSpecification {
  const provider = getTileProvider(providerId);
  if (provider.kind === 'vector' || !provider.url) return chowderStyle;
  return rasterStyle(provider.url, provider.attribution, provider.maxZoom);
}

// Pins are DOM markers. The outer element is positioned by MapLibre (it owns
// `transform`), so selection scaling is applied to the inner image.
let stylesInjected = false;
function injectPinStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .chowder-pin { width: 34px; height: 34px; cursor: pointer; }
    .chowder-pin img { width: 100%; height: 100%; display: block; transform-origin: 50% 100%;
      transition: transform 150ms ease; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25)); pointer-events: none; }
    .chowder-pin.selected { z-index: 2; }
    .chowder-pin.selected img { transform: scale(1.35); }
    .chowder-pending { width: 28px; height: 36px; pointer-events: none; }
    .chowder-result { width: 26px; height: 26px; border-radius: 13px; background: #fff; border: 2px solid #DC143C;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .chowder-result::after { content: ''; width: 10px; height: 10px; border-radius: 5px; background: #DC143C; }
    .chowder-cluster { min-width: 34px; height: 34px; padding: 0 8px; box-sizing: border-box; border-radius: 17px;
      background: #DC143C; color: #fff; font: 600 14px/30px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.3); cursor: pointer; }
    .maplibregl-ctrl-attrib { font-size: 10px; }
  `;
  document.head.appendChild(style);
}

function makePinElement(place: Place): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'chowder-pin';
  el.title = place.name;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', place.name);
  const img = document.createElement('img');
  img.src = PIN_URL;
  img.alt = '';
  el.appendChild(img);
  return el;
}

function makePendingElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'chowder-pending';
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#e53935" stroke="#b71c1c" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="#fff"/></svg>`;
  return el;
}

export default function MapView(props: MapViewProps) {
  const { places, selectedPlaceId, pendingPin, center, zoom, resultPins } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, { marker: maplibregl.Marker; place: Place }>());
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null);
  const clusterMarkersRef = useRef<maplibregl.Marker[]>([]);
  const resultMarkersRef = useRef<maplibregl.Marker[]>([]);
  const reclusterRef = useRef<() => void>(() => {});
  const hasFitRef = useRef(false);
  const ignoreMapClickUntil = useRef(0);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    injectPinStyles();
    const { initialCenter, initialZoom } = propsRef.current;
    const start = initialCenter ?? DEFAULT_CENTER;
    if (initialCenter) hasFitRef.current = true; // caller chose the view

    const map = new maplibregl.Map({
      container,
      style: chowderStyle,
      center: [start.lng, start.lat],
      zoom: initialZoom ?? DEFAULT_ZOOM,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    // Zoom buttons only where there's no pinch (desktop browsers).
    if (!('ontouchstart' in window)) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    }
    // Credits collapsed to a small (i) bottom-left, clear of the recenter button.
    const attribution = new maplibregl.AttributionControl({ compact: true });
    map.addControl(attribution, 'bottom-left');
    map.once('load', () => {
      container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
    mapRef.current = map;
    (container as any).__chowderMap = map; // handle for debugging / browser tests

    // Group pins that would overlap on screen into a numbered bubble (like
    // Apple Maps). Tapping a bubble zooms in until the pins separate.
    const CLUSTER_PX = 40;
    const NO_CLUSTER_ZOOM = 17;
    const recluster = () => {
      clusterMarkersRef.current.forEach(m => m.remove());
      clusterMarkersRef.current = [];
      const entries = [...markersRef.current.values()];
      const selectedId = propsRef.current.selectedPlaceId;
      const show = (e: { marker: maplibregl.Marker }) => { e.marker.getElement().style.visibility = ''; };
      if (map.getZoom() >= NO_CLUSTER_ZOOM) {
        entries.forEach(show);
        return;
      }
      const pts = entries.map(e => ({ e, p: map.project(e.marker.getLngLat()) }));
      const used = new Set<number>();
      pts.forEach((a, i) => {
        if (used.has(i)) return;
        used.add(i);
        if (a.e.place.id === selectedId) { show(a.e); return; }
        const group = [a];
        pts.forEach((b, j) => {
          if (used.has(j) || b.e.place.id === selectedId) return;
          if (Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < CLUSTER_PX) {
            used.add(j);
            group.push(b);
          }
        });
        if (group.length === 1) { show(a.e); return; }
        group.forEach(g => { g.e.marker.getElement().style.visibility = 'hidden'; });
        const lng = group.reduce((s, g) => s + g.e.place.longitude, 0) / group.length;
        const lat = group.reduce((s, g) => s + g.e.place.latitude, 0) / group.length;
        const el = document.createElement('div');
        el.className = 'chowder-cluster';
        el.textContent = String(group.length);
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `${group.length} places: ${group.map(g => g.e.place.name).join(', ')}`);
        el.addEventListener('click', ev => {
          ev.stopPropagation();
          ignoreMapClickUntil.current = Date.now() + 400;
          const bounds = new maplibregl.LngLatBounds();
          group.forEach(g => bounds.extend([g.e.place.longitude, g.e.place.latitude]));
          map.fitBounds(bounds, { padding: 90, maxZoom: NO_CLUSTER_ZOOM, duration: 400 });
        });
        clusterMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map));
      });
    };
    reclusterRef.current = recluster;
    map.on('zoomend', recluster);
    map.on('load', recluster);

    map.on('moveend', () => {
      const c = map.getCenter();
      propsRef.current.onViewChange?.({ latitude: c.lat, longitude: c.lng });
    });

    map.on('click', e => {
      if (Date.now() < ignoreMapClickUntil.current) return; // tap was on a pin
      propsRef.current.onMapClick?.(e.lngLat.lat, e.lngLat.lng);
    });

    let cancelled = false;
    getTileProviderPreference().then(id => {
      if (!cancelled && getTileProvider(id).id !== 'chowder') map.setStyle(styleFor(id));
    });
    const unsubscribeStyle = onTileProviderChange(id => map.setStyle(styleFor(id)));

    // Tell the map when its container changes size (tab switches, keyboard on
    // phones, rotation) or it renders a stretched/blank canvas.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      unsubscribeStyle();
      resizeObserver.disconnect();
      markersRef.current.clear();
      clusterMarkersRef.current = [];
      resultMarkersRef.current = [];
      reclusterRef.current = () => {};
      pendingMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      hasFitRef.current = false;
    };
  }, []);

  // Sync markers with places: add new, move changed, remove deleted.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const seen = new Set<string>();

    for (const place of places) {
      seen.add(place.id);
      const existing = markers.get(place.id);
      if (existing) {
        existing.place = place;
        const pos = existing.marker.getLngLat();
        if (pos.lat !== place.latitude || pos.lng !== place.longitude) {
          existing.marker.setLngLat([place.longitude, place.latitude]);
        }
        existing.marker.getElement().title = place.name;
        continue;
      }
      const el = makePinElement(place);
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);
      const entry = { marker, place };
      el.addEventListener('click', e => {
        e.stopPropagation();
        ignoreMapClickUntil.current = Date.now() + 400;
        map.easeTo({ center: [entry.place.longitude, entry.place.latitude], duration: 300 });
        propsRef.current.onPlaceSelect?.(entry.place);
      });
      markers.set(place.id, entry);
    }

    for (const [id, { marker }] of markers) {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    // Fit to all pins the first time we have some (unless a view was requested).
    if (!hasFitRef.current && places.length > 0 && !propsRef.current.center) {
      hasFitRef.current = true;
      if (places.length === 1) {
        map.jumpTo({ center: [places[0].longitude, places[0].latitude], zoom: 15 });
      } else {
        const bounds = new maplibregl.LngLatBounds();
        places.forEach(p => bounds.extend([p.longitude, p.latitude]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 });
      }
    }
    reclusterRef.current();
  }, [places]);

  // Highlight the selected pin.
  useEffect(() => {
    for (const [id, { marker }] of markersRef.current) {
      marker.getElement().classList.toggle('selected', id === selectedPlaceId);
    }
    reclusterRef.current();
  }, [selectedPlaceId, places]);

  // Pending (unsaved) pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pendingMarkerRef.current?.remove();
    pendingMarkerRef.current = null;
    if (pendingPin) {
      pendingMarkerRef.current = new maplibregl.Marker({ element: makePendingElement(), anchor: 'bottom' })
        .setLngLat([pendingPin.longitude, pendingPin.latitude])
        .addTo(map);
    }
  }, [pendingPin]);

  // Search-result pins ("Show all on map").
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    resultMarkersRef.current.forEach(m => m.remove());
    resultMarkersRef.current = [];
    if (!resultPins?.length) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const r of resultPins) {
      const el = document.createElement('div');
      el.className = 'chowder-result';
      el.title = r.name;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', r.name);
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        ignoreMapClickUntil.current = Date.now() + 400;
        propsRef.current.onResultPress?.(r.id);
      });
      resultMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([r.longitude, r.latitude]).addTo(map));
      bounds.extend([r.longitude, r.latitude]);
    }
    hasFitRef.current = true;
    map.fitBounds(bounds, { padding: { top: 80, bottom: 140, left: 50, right: 50 }, maxZoom: 16, duration: 500 });
  }, [resultPins]);

  // One-shot recenter requests.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    hasFitRef.current = true;
    map.easeTo({ center: [center.lng, center.lat], zoom: zoom ?? Math.max(map.getZoom(), 15), duration: 500 });
    propsRef.current.onCenterConsumed?.();
  }, [center, zoom]);

  return (
    <View style={styles.container}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
});
