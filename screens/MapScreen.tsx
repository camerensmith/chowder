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
import { getAllPlaces, createPlace, getCategory, getVisitsForPlace, getPlace, getListItems } from '../lib/db';
import { searchPlaces, extractCoordinates, formatAddress, NominatimResult } from '../lib/maps';
import MapView from '../components/MapView';
import PlaceSearchModal from '../components/PlaceSearchModal';
import PlaceSaveModal from '../components/PlaceSaveModal';
import PlaceInfoCard from '../components/PlaceInfoCard';
import MapFilterModal, { MapFilters } from '../components/MapFilterModal';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const DEFAULT_FILTERS: MapFilters = {
  categoryIds: [],
  tagIds: [],
  listIds: [],
  ratingFilterType: 'none',
  minRating: undefined,
  maxRating: undefined,
  exactRating: undefined,
  searchText: undefined,
};

export default function MapScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const [places, setPlaces] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [clickedLocation, setClickedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [preFillName, setPreFillName] = useState<string | undefined>(undefined);
  const [preFillAddress, setPreFillAddress] = useState<string | undefined>(undefined);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedPlaceCategory, setSelectedPlaceCategory] = useState<string | undefined>(undefined);
  const [selectedPlaceImage, setSelectedPlaceImage] = useState<string | undefined>(undefined);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS);
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [filteredPlaces, setFilteredPlaces] = useState<Place[]>([]);
  
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

  // Reload places when screen comes into focus (e.g., after editing a place)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadPlaces();
    });
    return unsubscribe;
  }, [navigation]);

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
      const loadedPlaces = await getAllPlaces();
      setAllPlaces(loadedPlaces);
      applyFilters(loadedPlaces, filters);
    } catch (error) {
      console.error('Failed to load places:', error);
    }
  };

  const applyFilters = async (places: Place[], currentFilters: MapFilters) => {
    let filtered = [...places];

    // Filter by text search
    if (currentFilters.searchText && currentFilters.searchText.trim().length > 0) {
      const searchLower = currentFilters.searchText.toLowerCase().trim();
      filtered = filtered.filter(place => {
        const nameMatch = place.name?.toLowerCase().includes(searchLower) || false;
        const addressMatch = place.address?.toLowerCase().includes(searchLower) || false;
        const notesMatch = place.notes?.toLowerCase().includes(searchLower) || false;
        return nameMatch || addressMatch || notesMatch;
      });
    }

    // Filter by categories
    if (currentFilters.categoryIds.length > 0) {
      filtered = filtered.filter(p => p.categoryId && currentFilters.categoryIds.includes(p.categoryId));
    }

    // Filter by tags
    if (currentFilters.tagIds.length > 0) {
      const placesWithTags = await Promise.all(
        filtered.map(async (place) => {
          // Load place with tags
          const placeWithTags = await getPlace(place.id);
          const tagIds = placeWithTags?.tagIds || [];
          return { place, tagIds };
        })
      );
      filtered = placesWithTags
        .filter(({ tagIds }) => currentFilters.tagIds.some(tagId => tagIds.includes(tagId)))
        .map(({ place }) => place);
    }

    // Filter by lists
    if (currentFilters.listIds.length > 0) {
      const placesInLists = await Promise.all(
        currentFilters.listIds.map(async (listId) => {
          const items = await getListItems(listId);
          return items.map(item => item.placeId);
        })
      );
      const placeIdsInLists = new Set(placesInLists.flat());
      filtered = filtered.filter(p => placeIdsInLists.has(p.id));
    }

    // Filter by rating
    if (currentFilters.ratingFilterType !== 'none') {
      const placesWithRatings = await Promise.all(
        filtered.map(async (place) => {
          // Get the display rating for the place
          const visits = await getVisitsForPlace(place.id);
          let rating: number | undefined;
          
          // Visits no longer have ratings - only use overallRatingManual
          rating = place.overallRatingManual;
          
          return { place, rating: rating || 0 };
        })
      );

      const { ratingFilterType, minRating, maxRating, exactRating } = currentFilters;
      const filteredPlacesWithRatings = placesWithRatings.filter((item) => {
        const { rating } = item;
        if (ratingFilterType === 'min' && minRating !== undefined) {
          return rating >= minRating;
        }
        if (ratingFilterType === 'max' && maxRating !== undefined) {
          return rating <= maxRating;
        }
        if (ratingFilterType === 'exact' && exactRating !== undefined) {
          return Math.abs(rating - exactRating) < 0.1; // Allow small floating point differences
        }
        return true;
      });
      
      filtered = filteredPlacesWithRatings.map((item) => item.place);
    }

    setFilteredPlaces(filtered);
    setPlaces(filtered);
  };

  const handleFiltersChange = (newFilters: MapFilters) => {
    setFilters(newFilters);
    applyFilters(allPlaces, newFilters);
  };

  const clearFiltersAndReloadPlaces = async () => {
    setFilters(DEFAULT_FILTERS);
    const loadedPlaces = await getAllPlaces();
    setAllPlaces(loadedPlaces);
    applyFilters(loadedPlaces, DEFAULT_FILTERS);
  };

  const handleSearchSelect = async (result: NominatimResult) => {
    try {
      const coords = extractCoordinates(result);
      const address = formatAddress(result);
      // Show save modal with pre-filled data from search result
      setClickedLocation({ latitude: coords.latitude, longitude: coords.longitude });
      setPreFillName(result.name);
      setPreFillAddress(address);
      setShowSearchModal(false);
      setSearchQuery('');
      // Show save modal after a brief delay to allow search modal to close
      setTimeout(() => {
        setShowSaveModal(true);
      }, 100);
    } catch (error) {
      console.error('Failed to process search result:', error);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    // Clear selected place when clicking on map
    setSelectedPlace(null);
    setClickedLocation({ latitude: lat, longitude: lng });
    setPreFillName(undefined);
    setPreFillAddress(undefined);
    setShowSaveModal(true);
  };

  const handleSavePlace = async (name: string, address?: string, categoryId?: string, notes?: string) => {
    if (!clickedLocation) return;
    
    try {
      await createPlace(
        name,
        clickedLocation.latitude,
        clickedLocation.longitude,
        address,
        categoryId,
        notes
      );
      // Clear filters to ensure the new place is visible on the map
      await clearFiltersAndReloadPlaces();
      setShowSaveModal(false);
      setClickedLocation(null);
    } catch (error) {
      console.error('Failed to save place:', error);
    }
  };

  const handlePlaceSelect = async (place: Place) => {
    // Reload the place from database to get latest data (including categoryId)
    try {
      const updatedPlace = await getPlace(place.id);
      if (updatedPlace) {
        setSelectedPlace(updatedPlace);
        
        // Load category name if categoryId exists
        if (updatedPlace.categoryId) {
          try {
            const category = await getCategory(updatedPlace.categoryId);
            setSelectedPlaceCategory(category?.name);
          } catch (error) {
            console.error('Failed to load category:', error);
            setSelectedPlaceCategory(undefined);
          }
        } else {
          setSelectedPlaceCategory(undefined);
        }
      } else {
        // Fallback to original place if reload fails
        setSelectedPlace(place);
        setSelectedPlaceCategory(undefined);
      }
    } catch (error) {
      console.error('Failed to reload place:', error);
      // Fallback to original place
      setSelectedPlace(place);
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
        <TouchableOpacity onPress={loadPlaces}>
          <MaterialCommunityIcons name="refresh" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} />
        </View>
        <TouchableOpacity onPress={() => setShowSearchModal(true)}>
          <View style={styles.addButton}>
            <MaterialCommunityIcons name="plus" size={28} color={theme.colors.onSecondary} />
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
        <TouchableOpacity onPress={() => setShowFilterModal(true)}>
          <View style={styles.filterButton}>
            <MaterialCommunityIcons name="filter-variant" size={20} color={theme.colors.secondary} />
            {(filters.categoryIds.length > 0 || filters.tagIds.length > 0 || filters.listIds.length > 0 || filters.ratingFilterType !== 'none') && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>
                  {[filters.categoryIds.length, filters.tagIds.length, filters.listIds.length, filters.ratingFilterType !== 'none' ? 1 : 0]
                    .reduce((a, b) => a + b, 0)}
                </Text>
              </View>
            )}
          </View>
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
            setPreFillName(undefined);
            setPreFillAddress(undefined);
          }}
          onSave={handleSavePlace}
          initialName={preFillName}
          initialAddress={preFillAddress}
        />
      )}

      {/* Filter Modal */}
      <MapFilterModal
        visible={showFilterModal}
        filters={filters}
        onClose={() => setShowFilterModal(false)}
        onApply={handleFiltersChange}
      />
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
  filterButton: {
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    ...theme.typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
  },
});
