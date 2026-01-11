import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Place } from '../types';
import { theme } from '../lib/theme';
import { getAllPlaces, createPlace, getCategory, getVisitsForPlace } from '../lib/db';
import { searchPlaces, extractCoordinates, formatAddress, NominatimResult } from '../lib/maps';
import MapView from '../components/MapView';
import PlaceSearchModal from '../components/PlaceSearchModal';
import PlaceSaveModal from '../components/PlaceSaveModal';
import PlaceInfoCard from '../components/PlaceInfoCard';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function MapScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [places, setPlaces] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [clickedLocation, setClickedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedPlaceCategory, setSelectedPlaceCategory] = useState<string | undefined>(undefined);
  const [selectedPlaceImage, setSelectedPlaceImage] = useState<string | undefined>(undefined);
  
  // Calculate recenter button position
  const tabBarHeight = 80;
  const cardHeight = 96;
  const cardBottomOffset = tabBarHeight + 2 + insets.bottom; // Card is pinned to tab bar with 2px gap
  const recenterButtonBottomWithCard = cardHeight + cardBottomOffset + theme.spacing.md; // Extra spacing above card

  useEffect(() => {
    loadPlaces();
    // Try to get location silently in background (don't show errors on initial load)
    getCurrentLocation(false);
  }, []);

  const getCurrentLocation = async (showError = false) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (showError) {
          console.log('Location permission denied');
        }
        return;
      }

      // Use lower accuracy for better success rate
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low, // Lower accuracy = faster, more reliable
      });
      
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error: any) {
      // Silently handle location errors - they're common on web browsers
      // Error codes:
      // 1 = PERMISSION_DENIED
      // 2 = POSITION_UNAVAILABLE (common on web - no GPS, location services disabled, etc.)
      // 3 = TIMEOUT
      // All are non-fatal - app works fine without location
      
      // Only show a single helpful message if user explicitly requested location
      if (showError && error?.code === 2) {
        // On web browsers, location often fails - this is normal
        console.log('Location unavailable. This is common on web browsers. The app works fine without location.');
      }
    }
  };

  const loadPlaces = async () => {
    try {
      const allPlaces = await getAllPlaces();
      setPlaces(allPlaces);
    } catch (error) {
      console.error('Failed to load places:', error);
    }
  };

  const handleSearchSelect = async (result: NominatimResult) => {
    try {
      const coords = extractCoordinates(result);
      const address = formatAddress(result);
      const newPlace = await createPlace(
        result.name,
        coords.latitude,
        coords.longitude,
        address
      );
      await loadPlaces();
      setShowSearchModal(false);
      setSearchQuery('');
    } catch (error) {
      console.error('Failed to add place:', error);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    // Clear selected place when clicking on map
    setSelectedPlace(null);
    setClickedLocation({ latitude: lat, longitude: lng });
    setShowSaveModal(true);
  };

  const handleSavePlace = async (name: string, address?: string) => {
    if (!clickedLocation) return;
    
    try {
      await createPlace(
        name,
        clickedLocation.latitude,
        clickedLocation.longitude,
        address
      );
      await loadPlaces();
      setShowSaveModal(false);
      setClickedLocation(null);
    } catch (error) {
      console.error('Failed to save place:', error);
    }
  };

  const handlePlaceSelect = async (place: Place) => {
    setSelectedPlace(place);
    
    // Load category name if categoryId exists
    if (place.categoryId) {
      try {
        const category = await getCategory(place.categoryId);
        setSelectedPlaceCategory(category?.name);
      } catch (error) {
        console.error('Failed to load category:', error);
        setSelectedPlaceCategory(undefined);
      }
    } else {
      setSelectedPlaceCategory(undefined);
    }

    // Load most recent visit photo if available
    try {
      const visits = await getVisitsForPlace(place.id);
      const visitWithPhoto = visits.find(v => v.photoUri);
      setSelectedPlaceImage(visitWithPhoto?.photoUri);
    } catch (error) {
      console.error('Failed to load visit photo:', error);
      setSelectedPlaceImage(undefined);
    }
  };

  const handleInfoCardPress = () => {
    if (selectedPlace) {
      navigation.navigate('PlaceDetail', { placeId: selectedPlace.id });
      setSelectedPlace(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <MaterialCommunityIcons name="home" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} />
        </View>
        <TouchableOpacity onPress={() => setShowSearchModal(true)}>
          <View style={styles.addButton}>
            <MaterialCommunityIcons name="plus" size={20} color={theme.colors.onSecondary} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Q Search places..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setShowSearchModal(true)}
        />
        <TouchableOpacity>
          <MaterialCommunityIcons name="filter-variant" size={20} color={theme.colors.secondary} />
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          places={places}
          onPlacePress={(place) => navigation.navigate('PlaceDetail', { placeId: place.id })}
          onPlaceSelect={handlePlaceSelect}
          onMapClick={handleMapClick}
          selectedPlaceId={selectedPlace?.id}
          center={userLocation ? { lat: userLocation.latitude, lng: userLocation.longitude } : undefined}
        />
        {/* Place Info Card */}
        {selectedPlace && (
          <PlaceInfoCard
            place={selectedPlace}
            categoryName={selectedPlaceCategory}
            imageUri={selectedPlaceImage}
            onPress={handleInfoCardPress}
          />
        )}

        {/* Recenter Button - moves up when place is selected */}
        <TouchableOpacity
          style={[
            styles.recenterButton,
            selectedPlace && { bottom: recenterButtonBottomWithCard },
          ]}
          onPress={() => getCurrentLocation(true)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons 
            name="crosshairs-gps" 
            size={24} 
            color={userLocation ? theme.colors.primary : theme.colors.textSecondary} 
          />
        </TouchableOpacity>
      </View>

      {/* Place Search Modal */}
      <PlaceSearchModal
        visible={showSearchModal}
        onClose={() => {
          setShowSearchModal(false);
          setSearchQuery('');
        }}
        onSelect={handleSearchSelect}
        initialLocation={userLocation || undefined}
      />

      {/* Place Save Modal (for map clicks) */}
      {clickedLocation && (
        <PlaceSaveModal
          visible={showSaveModal}
          latitude={clickedLocation.latitude}
          longitude={clickedLocation.longitude}
          onClose={() => {
            setShowSaveModal(false);
            setClickedLocation(null);
          }}
          onSave={handleSavePlace}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 157,
    height: 48,
    resizeMode: 'contain',
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
    padding: theme.spacing.sm,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  recenterButton: {
    position: 'absolute',
    bottom: theme.spacing.lg,
    right: theme.spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 1, // Ensure button is above the map
  },
});
