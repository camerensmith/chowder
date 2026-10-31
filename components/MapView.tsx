// Native map (iOS / Android) using react-native-maps, which also works in Expo Go.
// The web build uses MapView.web.tsx (Leaflet) instead.

import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import RNMapView, { Marker, Region } from 'react-native-maps';
import { MapViewProps, DEFAULT_CENTER } from './mapTypes';

const pinImage = require('../assets/pin.png');

function zoomToDelta(zoom: number): number {
  return 360 / Math.pow(2, zoom);
}

export default function MapView({
  places,
  onPlaceSelect,
  onMapClick,
  selectedPlaceId,
  pendingPin,
  initialCenter,
  initialZoom = 13,
  center,
  zoom,
  onCenterConsumed,
  onViewChange,
}: MapViewProps) {
  const mapRef = useRef<RNMapView>(null);
  const hasFitRef = useRef(!!initialCenter);
  const onCenterConsumedRef = useRef(onCenterConsumed);
  onCenterConsumedRef.current = onCenterConsumed;

  const initialRegion = useMemo<Region>(() => {
    const start = initialCenter ?? (places[0] ? { lat: places[0].latitude, lng: places[0].longitude } : DEFAULT_CENTER);
    const delta = zoomToDelta(initialZoom);
    return { latitude: start.lat, longitude: start.lng, latitudeDelta: delta, longitudeDelta: delta };
    // Only the first render's value matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit to all pins once they first load.
  useEffect(() => {
    if (hasFitRef.current || places.length === 0 || center) return;
    hasFitRef.current = true;
    mapRef.current?.fitToCoordinates(
      places.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
      { edgePadding: { top: 80, right: 60, bottom: 160, left: 60 }, animated: false }
    );
  }, [places, center]);

  useEffect(() => {
    if (!center) return;
    hasFitRef.current = true;
    const delta = zoomToDelta(zoom ?? 15);
    mapRef.current?.animateToRegion(
      { latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta },
      400
    );
    onCenterConsumedRef.current?.();
  }, [center, zoom]);

  return (
    <View style={styles.container}>
      <RNMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        onRegionChangeComplete={r => onViewChange?.({ latitude: r.latitude, longitude: r.longitude })}
        onPress={e => {
          // Marker taps also bubble a press on Android; ignore those.
          if ((e.nativeEvent as any).action === 'marker-press') return;
          onMapClick?.(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);
        }}
      >
        {places.map(place => (
          <Marker
            key={place.id}
            identifier={place.id}
            coordinate={{ latitude: place.latitude, longitude: place.longitude }}
            image={pinImage}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={place.id === selectedPlaceId ? 1000 : 1}
            opacity={selectedPlaceId && place.id !== selectedPlaceId ? 0.75 : 1}
            tracksViewChanges={false}
            onPress={e => {
              e.stopPropagation?.();
              onPlaceSelect?.(place);
            }}
          />
        ))}
        {pendingPin && (
          <Marker
            key="__pending__"
            coordinate={{ latitude: pendingPin.latitude, longitude: pendingPin.longitude }}
            pinColor="red"
            zIndex={2000}
          />
        )}
      </RNMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
