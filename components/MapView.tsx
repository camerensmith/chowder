import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Place } from '../types';
import { getTileProviderPreference, getTileProvider } from '../lib/tileProviders';

// Conditional import for native maps - try expo-maps first (works in Expo Go), then react-native-maps
let MapViewNative: any = null;
let Marker: any = null;
let isExpoMaps = false;
if (Platform.OS !== 'web') {
  try {
    // Try expo-maps first (works in Expo Go)
    const ExpoMaps = require('expo-maps');
    if (ExpoMaps && ExpoMaps.ExpoMap) {
      MapViewNative = ExpoMaps.ExpoMap;
      Marker = ExpoMaps.ExpoMap.Marker || ExpoMaps.Marker;
      isExpoMaps = true;
    }
  } catch (e) {
    // Fallback to react-native-maps (requires dev build)
    try {
      const Maps = require('react-native-maps');
      MapViewNative = Maps.default || Maps;
      Marker = Maps.Marker;
      isExpoMaps = false;
    } catch (e2) {
      console.warn('No map library available:', e2);
    }
  }
}

// Import pin image - Expo will handle the path
let pinImageUri: string | null = null;
try {
  const pinImage = require('../assets/pin.png');
  pinImageUri = typeof pinImage === 'string' ? pinImage : (pinImage.default || pinImage.uri || pinImage);
} catch (e) {
  // Pin image not found, will use default
  pinImageUri = null;
}

interface MapViewProps {
  places: Place[];
  onPlacePress?: (place: Place) => void;
  onPlaceSelect?: (place: Place) => void; // Callback when pin is tapped (for info card)
  onMapClick?: (lat: number, lng: number) => void; // Callback when map is clicked
  selectedPlaceId?: string; // ID of currently selected place (for highlighting)
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  center?: { lat: number; lng: number }; // Dynamic center for recentering
  zoom?: number; // Dynamic zoom
}

export default function MapView({ places, onPlacePress, onPlaceSelect, onMapClick, selectedPlaceId, initialCenter, initialZoom = 13, center, zoom }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const selectedMarkerRef = useRef<any>(null);
  const nativeMapRef = useRef<any>(null);
  const [tileProviderId, setTileProviderId] = useState<string>('osm');

  // Load tile provider preference and listen for changes
  useEffect(() => {
    if (Platform.OS === 'web') {
      getTileProviderPreference().then(id => setTileProviderId(id));
      
      // Listen for storage changes (when user changes provider in settings)
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'chowder_tile_provider' && e.newValue) {
          setTileProviderId(e.newValue);
        }
      };
      
      window.addEventListener('storage', handleStorageChange);
      
      // Also check periodically (for same-tab changes)
      const interval = setInterval(async () => {
        const currentId = await getTileProviderPreference();
        if (currentId !== tileProviderId) {
          setTileProviderId(currentId);
        }
      }, 1000);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
        clearInterval(interval);
      };
    }
  }, [tileProviderId]);

  // Initialize map (only once)
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current) return;

    const initMap = async () => {
      if (!mapRef.current) return; // Type guard for async context
      
      // Check if map is already initialized
      if (mapInstanceRef.current) {
        return; // Map already exists, don't re-initialize
      }
      
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

      // Check if container already has a map (Leaflet stores it in _leaflet_id)
      if ((mapRef.current as any)._leaflet_id) {
        return; // Container already has a map initialized
      }

      // Initialize map
      const center = initialCenter || (places.length > 0 
        ? { lat: places[0].latitude, lng: places[0].longitude }
        : { lat: 40.7128, lng: -74.0060 }); // Default to NYC

      const map = L.default.map(mapRef.current).setView([center.lat, center.lng], initialZoom);
      mapInstanceRef.current = map;

      // Load tile provider and add tiles
      const providerId = await getTileProviderPreference();
      const provider = getTileProvider(providerId);
      const tileLayer = L.default.tileLayer(provider.url, {
        attribution: provider.attribution,
        maxZoom: provider.maxZoom || 19,
      });
      tileLayer.addTo(map);
      tileLayerRef.current = tileLayer;

      // Handle map clicks for placing new pins
      if (onMapClick) {
        map.on('click', (e: any) => {
          onMapClick(e.latlng.lat, e.latlng.lng);
        });
      }
    };

    initMap().catch(console.error);

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          // Map might already be removed, ignore error
        }
        mapInstanceRef.current = null;
      }
      // Clear Leaflet ID from container
      if (mapRef.current && (mapRef.current as any)._leaflet_id) {
        delete (mapRef.current as any)._leaflet_id;
      }
      markersRef.current = [];
      tileLayerRef.current = null;
    };
  }, [places, initialCenter, initialZoom, onMapClick]);

  // Update tile layer when provider changes
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current || !tileLayerRef.current) return;

    const updateTiles = async () => {
      const L = await import('leaflet');
      const provider = getTileProvider(tileProviderId);
      
      // Remove old tile layer
      if (tileLayerRef.current) {
        mapInstanceRef.current.removeLayer(tileLayerRef.current);
      }
      
      // Add new tile layer
      const newTileLayer = L.default.tileLayer(provider.url, {
        attribution: provider.attribution,
        maxZoom: provider.maxZoom || 19,
      });
      newTileLayer.addTo(mapInstanceRef.current);
      tileLayerRef.current = newTileLayer;
    };

    updateTiles().catch(console.error);
  }, [tileProviderId]);

  // Update markers whenever places change (separate effect)
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current) return;

    const updateMarkers = async () => {
      const L = await import('leaflet');
      const map = mapInstanceRef.current;
      if (!map) return;

      // Set up custom pin icons (normal and highlighted)
      const pinIconUrl = pinImageUri || 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
      
      const pinIcon = L.default.icon({
        iconUrl: pinIconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Highlighted pin icon (larger and with different styling)
      const highlightedPinIcon = L.default.icon({
        iconUrl: pinIconUrl,
        iconSize: [40, 40], // Larger when selected
        iconAnchor: [20, 40],
        popupAnchor: [0, -40],
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        className: 'leaflet-marker-highlighted', // For custom CSS if needed
      });

      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      selectedMarkerRef.current = null;

      // Add markers for each place
      places.forEach((place) => {
        const isSelected = selectedPlaceId === place.id;
        const markerIcon = isSelected ? highlightedPinIcon : pinIcon;

        const marker = L.default.marker([place.latitude, place.longitude], { icon: markerIcon })
          .addTo(map);

        // Handle marker click - center map and show info card
        marker.on('click', () => {
          // Center map on this marker
          map.setView([place.latitude, place.longitude], map.getZoom(), {
            animate: true,
            duration: 0.3,
          });

          // Call onPlaceSelect to show info card
          if (onPlaceSelect) {
            onPlaceSelect(place);
          }
        });

        // Store selected marker reference
        if (isSelected) {
          selectedMarkerRef.current = marker;
        }

        markersRef.current.push(marker);
      });

      // Fit map to show all markers (only if no initial center specified and places exist)
      if (places.length > 0 && !initialCenter && !center) {
        const group = new L.default.FeatureGroup(markersRef.current);
        map.fitBounds(group.getBounds().pad(0.1));
      }
    };

    updateMarkers().catch(console.error);
  }, [places, selectedPlaceId, onPlaceSelect, initialCenter, center]);

  // Handle dynamic center updates (for recentering)
  useEffect(() => {
    if (!center) return;

    if (Platform.OS === 'web') {
      if (!mapInstanceRef.current) return;
      
      const updateCenter = async () => {
        const L = await import('leaflet');
        const map = mapInstanceRef.current;
        if (map) {
          map.setView([center.lat, center.lng], zoom || initialZoom, {
            animate: true,
            duration: 0.5,
          });
        }
      };
      updateCenter().catch(console.error);
    } else {
      // Native map center update
      if (nativeMapRef.current) {
        if (isExpoMaps) {
          // expo-maps
          if (typeof nativeMapRef.current.setCameraPosition === 'function') {
            nativeMapRef.current.setCameraPosition({
              target: {
                latitude: center.lat,
                longitude: center.lng,
              },
              zoom: zoom || initialZoom,
            });
          }
        } else {
          // react-native-maps
          if (typeof nativeMapRef.current.animateCamera === 'function') {
            nativeMapRef.current.animateCamera({
              center: {
                latitude: center.lat,
                longitude: center.lng,
              },
              zoom: zoom || initialZoom,
            }, { duration: 500 });
          } else if (typeof nativeMapRef.current.animateToRegion === 'function') {
            nativeMapRef.current.animateToRegion({
              latitude: center.lat,
              longitude: center.lng,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }, 500);
          }
        }
      }
    }
  }, [center, zoom, initialZoom]);

  // Update marker highlighting when selection changes (without recreating markers)
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapInstanceRef.current || markersRef.current.length === 0) return;

    const updateHighlighting = async () => {
      const L = await import('leaflet');
      const pinIconUrl = pinImageUri || 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
      
      const normalIcon = L.default.icon({
        iconUrl: pinIconUrl,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const highlightedIcon = L.default.icon({
        iconUrl: pinIconUrl,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40],
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Find the place for each marker and update icon
      markersRef.current.forEach((marker) => {
        // Find the place that matches this marker's position
        const place = places.find(p => 
          Math.abs(p.latitude - (marker as any).getLatLng().lat) < 0.0001 &&
          Math.abs(p.longitude - (marker as any).getLatLng().lng) < 0.0001
        );
        
        if (place) {
          const isSelected = selectedPlaceId === place.id;
          marker.setIcon(isSelected ? highlightedIcon : normalIcon);
          if (isSelected) {
            selectedMarkerRef.current = marker;
          }
        }
      });
    };

    updateHighlighting().catch(console.error);
  }, [selectedPlaceId]);

  // Native map implementation
  if (Platform.OS !== 'web') {
    if (!MapViewNative || !Marker) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorText}>Map view not available</Text>
          <Text style={styles.errorText}>react-native-maps may not be available in Expo Go</Text>
        </View>
      );
    }

    const defaultLat = center?.lat || initialCenter?.lat || (places.length > 0 ? places[0].latitude : 40.7128);
    const defaultLng = center?.lng || initialCenter?.lng || (places.length > 0 ? places[0].longitude : -74.0060);
    const defaultZoom = zoom || initialZoom;

    // Use expo-maps API if available, otherwise react-native-maps
    if (isExpoMaps) {
      // expo-maps API
      return (
        <View style={styles.container}>
          <MapViewNative
            ref={nativeMapRef}
            style={styles.map}
            initialCameraPosition={{
              target: {
                latitude: defaultLat,
                longitude: defaultLng,
              },
              zoom: defaultZoom,
            }}
            onPress={(event: any) => {
              if (onMapClick && event.nativeEvent?.coordinate) {
                onMapClick(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude);
              }
            }}
          >
            {places.map((place) => (
              <Marker
                key={place.id}
                coordinate={{
                  latitude: place.latitude,
                  longitude: place.longitude,
                }}
                onPress={() => {
                  if (onPlaceSelect) {
                    onPlaceSelect(place);
                  }
                  if (onPlacePress) {
                    onPlacePress(place);
                  }
                }}
                icon={pinImageUri ? { uri: pinImageUri } : undefined}
                anchor={{ x: 0.5, y: 1 }}
              />
            ))}
          </MapViewNative>
        </View>
      );
    } else {
      // react-native-maps API
      return (
        <View style={styles.container}>
          <MapViewNative
            ref={nativeMapRef}
            style={styles.map}
            initialRegion={{
              latitude: defaultLat,
              longitude: defaultLng,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            onPress={(event: any) => {
              if (onMapClick && event.nativeEvent?.coordinate) {
                onMapClick(event.nativeEvent.coordinate.latitude, event.nativeEvent.coordinate.longitude);
              }
            }}
          >
            {places.map((place) => (
              <Marker
                key={place.id}
                coordinate={{
                  latitude: place.latitude,
                  longitude: place.longitude,
                }}
                onPress={() => {
                  if (onPlaceSelect) {
                    onPlaceSelect(place);
                  }
                  if (onPlacePress) {
                    onPlacePress(place);
                  }
                }}
                image={pinImageUri ? { uri: pinImageUri } : undefined}
                anchor={{ x: 0.5, y: 1 }}
              />
            ))}
          </MapViewNative>
        </View>
      );
    }
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
  errorText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
});
