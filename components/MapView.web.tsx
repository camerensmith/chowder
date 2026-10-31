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
  const { places, selectedPlaceId, pendingPin, center, zoom } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, { marker: maplibregl.Marker; place: Place }>());
  const pendingMarkerRef = useRef<maplibregl.Marker | null>(null);
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
  }, [places]);

  // Highlight the selected pin.
  useEffect(() => {
    for (const [id, { marker }] of markersRef.current) {
      marker.getElement().classList.toggle('selected', id === selectedPlaceId);
    }
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
