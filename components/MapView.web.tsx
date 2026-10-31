// Web map (Leaflet).
//
// The Leaflet map is created exactly once per mount. Props are mirrored into
// refs so callbacks always see current values without re-creating the map or
// the markers — re-creating them on every parent render is what caused the
// zoom resets, flicker and lost taps in earlier versions.

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Place } from '../types';
import { getTileProvider, getTileProviderPreference, onTileProviderChange } from '../lib/tileProviders';
import { MapViewProps, DEFAULT_CENTER, DEFAULT_ZOOM } from './mapTypes';

function assetUrl(mod: any): string {
  if (typeof mod === 'string') return mod;
  return mod?.uri ?? mod?.default?.uri ?? mod?.default ?? '';
}
const PIN_URL = assetUrl(require('../assets/pin.png'));

const pinIcon = L.icon({ iconUrl: PIN_URL, iconSize: [32, 32], iconAnchor: [16, 32] });
const selectedPinIcon = L.icon({ iconUrl: PIN_URL, iconSize: [44, 44], iconAnchor: [22, 44], className: 'chowder-pin-selected' });
const pendingPinIcon = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#e53935" stroke="#b71c1c" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="#fff"/></svg>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
});

export default function MapView(props: MapViewProps) {
  const { places, selectedPlaceId, pendingPin, center, zoom } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; place: Place }>());
  const pendingMarkerRef = useRef<L.Marker | null>(null);
  const hasFitRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { initialCenter, initialZoom } = propsRef.current;
    const start = initialCenter ?? DEFAULT_CENTER;
    const map = L.map(container, { zoomControl: true, attributionControl: true })
      .setView([start.lat, start.lng], initialZoom ?? DEFAULT_ZOOM);
    mapRef.current = map;
    if (initialCenter) hasFitRef.current = true; // caller chose the view

    map.on('click', (e: L.LeafletMouseEvent) => propsRef.current.onMapClick?.(e.latlng.lat, e.latlng.lng));

    let cancelled = false;
    const applyTiles = (id: string) => {
      if (cancelled) return;
      const provider = getTileProvider(id);
      tileLayerRef.current?.remove();
      tileLayerRef.current = L.tileLayer(provider.url, {
        attribution: provider.attribution,
        maxZoom: provider.maxZoom ?? 19,
      }).addTo(map);
    };
    getTileProviderPreference().then(applyTiles);
    const unsubscribeTiles = onTileProviderChange(applyTiles);

    // Leaflet must be told when its container changes size (tab switches,
    // keyboard opening on phones, rotation) or it renders grey gaps.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      unsubscribeTiles();
      resizeObserver.disconnect();
      markersRef.current.clear();
      pendingMarkerRef.current = null;
      tileLayerRef.current = null;
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
        const pos = existing.marker.getLatLng();
        if (pos.lat !== place.latitude || pos.lng !== place.longitude) {
          existing.marker.setLatLng([place.latitude, place.longitude]);
        }
        continue;
      }
      const marker = L.marker([place.latitude, place.longitude], {
        icon: place.id === propsRef.current.selectedPlaceId ? selectedPinIcon : pinIcon,
        title: place.name,
        alt: place.name,
        keyboard: true,
      }).addTo(map);
      const entry = { marker, place };
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        map.panTo([entry.place.latitude, entry.place.longitude], { animate: true });
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
        map.setView([places[0].latitude, places[0].longitude], 15);
      } else {
        const bounds = L.latLngBounds(places.map(p => [p.latitude, p.longitude] as [number, number]));
        map.fitBounds(bounds.pad(0.15), { maxZoom: 16 });
      }
    }
  }, [places]);

  // Highlight the selected pin.
  useEffect(() => {
    for (const [id, { marker }] of markersRef.current) {
      const selected = id === selectedPlaceId;
      marker.setIcon(selected ? selectedPinIcon : pinIcon);
      marker.setZIndexOffset(selected ? 1000 : 0);
    }
  }, [selectedPlaceId, places]);

  // Pending (unsaved) pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pendingMarkerRef.current?.remove();
    pendingMarkerRef.current = null;
    if (pendingPin) {
      pendingMarkerRef.current = L.marker([pendingPin.latitude, pendingPin.longitude], {
        icon: pendingPinIcon,
        zIndexOffset: 2000,
        interactive: false,
      }).addTo(map);
    }
  }, [pendingPin]);

  // One-shot recenter requests.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    hasFitRef.current = true;
    map.setView([center.lat, center.lng], zoom ?? Math.max(map.getZoom(), 15), { animate: true });
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
