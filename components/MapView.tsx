import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Place } from '../types';

interface MapViewProps {
  places: Place[];
  onPlacePress?: (place: Place) => void;
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
}

export default function MapView({ places, onPlacePress, initialCenter, initialZoom = 13 }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current) return;

    const initMap = async () => {
      if (!mapRef.current) return; // Type guard for async context
      
      const L = await import('leaflet');
      
      // Import Leaflet CSS
      if (typeof document !== 'undefined') {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        if (!document.querySelector('link[href*="leaflet"]')) {
          document.head.appendChild(link);
        }
      }

      // Initialize map
      const center = initialCenter || (places.length > 0 
        ? { lat: places[0].latitude, lng: places[0].longitude }
        : { lat: 40.7128, lng: -74.0060 }); // Default to NYC

      const map = L.default.map(mapRef.current).setView([center.lat, center.lng], initialZoom);
      mapInstanceRef.current = map;

      // Add OpenStreetMap tiles
      L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Add markers for each place
      places.forEach((place) => {
        const marker = L.default.marker([place.latitude, place.longitude])
          .addTo(map)
          .bindPopup(`<b>${place.name}</b><br/>${place.address || 'No address'}`);

        if (onPlacePress) {
          marker.on('click', () => {
            onPlacePress(place);
          });
        }

        markersRef.current.push(marker);
      });

      // Fit map to show all markers
      if (places.length > 0) {
        const group = new L.default.FeatureGroup(markersRef.current);
        map.fitBounds(group.getBounds().pad(0.1));
      }
    };

    initMap().catch(console.error);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];
    };
  }, [places, initialCenter, initialZoom, onPlacePress]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text>Map view not available on this platform</Text>
      </View>
    );
  }

  // @ts-ignore - div is valid in web
  return (
    <View style={styles.container}>
      <div ref={mapRef} style={styles.map} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  // @ts-ignore - web-specific styles
  map: {
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
});
