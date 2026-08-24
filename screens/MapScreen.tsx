import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  FlatList,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Place, List } from '../types';
import { theme } from '../lib/theme';
import {
  getAllPlaces,
  createPlace,
  getCategory,
  getVisitsForPlace,
  getPlace,
  getListItems,
  getAllLists,
  addPlaceToList,
  removePlaceFromList,
  updatePlace,
  getImportedFriendLists,
} from '../lib/db';
import { searchPlaces, extractCoordinates, formatAddress, reverseGeocodeDetailed, NominatimResult } from '../lib/maps';
import MapView from '../components/MapView';
import PlaceSearchModal from '../components/PlaceSearchModal';
import PlaceSaveModal from '../components/PlaceSaveModal';
import PlaceInfoCard from '../components/PlaceInfoCard';
import MapFilterModal, { MapFilters } from '../components/MapFilterModal';
import AddToListModal from '../components/AddToListModal';
import { persistImageLocally, uploadToCloudflare } from '../lib/imageStorage';

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
  const [pendingPin, setPendingPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingAddress, setPendingAddress] = useState<string | undefined>(undefined);
  const [pendingRecommendedName, setPendingRecommendedName] = useState<string | undefined>(undefined);
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

  // Recenter: only set when user explicitly presses the recenter button; cleared after one use
  const [recenterTarget, setRecenterTarget] = useState<{ lat: number; lng: number } | null>(null);

  // Add-to-list state
  const [showAddToListModal, setShowAddToListModal] = useState(false);
  const [modalAllLists, setModalAllLists] = useState<List[]>([]);
  const [modalPlaceLists, setModalPlaceLists] = useState<List[]>([]);

  // Friend lists panel state
  const [showFriendPanel, setShowFriendPanel] = useState(false);
  const [friendLists, setFriendLists] = useState<List[]>([]);
  const [activeFriendListIds, setActiveFriendListIds] = useState<Set<string>>(new Set());
  
  // Calculate recenter button position
  const tabBarHeight = 80;
  const cardHeight = 96;
  const cardBottomOffset = tabBarHeight + 2 + insets.bottom; // Card is pinned to tab bar with 2px gap
  const recenterButtonBottomWithCard = cardHeight + cardBottomOffset + theme.spacing.md; // Extra spacing above card

  useEffect(() => {
    loadPlaces();
    // Try to get location silently in background (don't show errors on initial load)
    getCurrentLocation(false);
    loadFriendLists();
  }, []);

  // Reload places when screen comes into focus (e.g., after editing a place)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadPlaces();
      loadFriendLists();
    });
    return unsubscribe;
  }, [navigation]);

  // Re-apply filters when active friend lists change
  useEffect(() => {
    const effectiveFilters = { ...filters, listIds: getEffectiveListIds() };
    applyFilters(allPlaces, effectiveFilters);
  }, [activeFriendListIds, filters, allPlaces]);

  const getCurrentLocation = async (recenterAfter = false) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (recenterAfter) {
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
      // Only recenter the map when the user explicitly pressed the recenter button
      if (recenterAfter) {
        setRecenterTarget({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    } catch (error: any) {
      // Silently handle location errors - they're common on web browsers
      // Error codes:
      // 1 = PERMISSION_DENIED
      // 2 = POSITION_UNAVAILABLE (common on web - no GPS, location services disabled, etc.)
      // 3 = TIMEOUT
      // All are non-fatal - app works fine without location
      
      // Only show a single helpful message if user explicitly requested location
      if (recenterAfter && error?.code === 2) {
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
    const effectiveFilters = { ...newFilters, listIds: [...new Set([...newFilters.listIds, ...Array.from(activeFriendListIds)])] };
    applyFilters(allPlaces, effectiveFilters);
  };

  const clearFiltersAndReloadPlaces = async () => {
    setFilters(DEFAULT_FILTERS);
    const loadedPlaces = await getAllPlaces();
    setAllPlaces(loadedPlaces);
    applyFilters(loadedPlaces, DEFAULT_FILTERS);
  };

  const handleOpenAddToList = async () => {
    if (!selectedPlace) return;
    try {
      const allLists = await getAllLists();
      const listsWithPlace: List[] = [];
      for (const list of allLists) {
        const items = await getListItems(list.id);
        if (items.some(item => item.placeId === selectedPlace.id)) {
          listsWithPlace.push(list);
        }
      }
      setModalAllLists(allLists);
      setModalPlaceLists(listsWithPlace);
      setShowAddToListModal(true);
    } catch (error) {
      console.error('Failed to load lists:', error);
    }
  };

  const handleToggleList = async (listId: string) => {
    if (!selectedPlace) return;
    try {
      const isInList = modalPlaceLists.some(l => l.id === listId);
      if (isInList) {
        await removePlaceFromList(listId, selectedPlace.id);
        setModalPlaceLists(prev => prev.filter(l => l.id !== listId));
      } else {
        await addPlaceToList(listId, selectedPlace.id);
        const added = modalAllLists.find(l => l.id === listId);
        if (added) setModalPlaceLists(prev => [...prev, added]);
      }
    } catch (error) {
      console.error('Failed to toggle list:', error);
    }
  };

  const handleAddImageFromMap = async () => {
    if (!selectedPlace) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photo library.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6,
      });
      if (!result.canceled && result.assets.length > 0) {
        const stableUri = await persistImageLocally(result.assets[0].uri);
        const cfId = await uploadToCloudflare(stableUri).catch(() => null);
        await updatePlace(selectedPlace.id, { coverImageUri: stableUri, cloudflareImageId: cfId ?? undefined });
        setSelectedPlaceImage(stableUri);
        // Refresh place data
        const updated = await getPlace(selectedPlace.id);
        if (updated) setSelectedPlace(updated);
      }
    } catch (error) {
      console.error('Failed to add image:', error);
      Alert.alert('Error', 'Failed to update photo.');
    }
  };

  const loadFriendLists = async () => {
    try {
      const imported = await getImportedFriendLists();
      setFriendLists(imported);
    } catch (error) {
      console.error('Failed to load friend lists:', error);
    }
  };

  const handleToggleFriendList = (listId: string) => {
    setActiveFriendListIds(prev => {
      const next = new Set(prev);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  };

  // Apply friend list filter on top of existing filters
  const getEffectiveListIds = () => {
    const friendIds = Array.from(activeFriendListIds);
    const filterIds = filters.listIds;
    return [...new Set([...filterIds, ...friendIds])];
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
    // Drop a pending pin so the user can confirm or tap elsewhere
    setPendingPin({ latitude: lat, longitude: lng });
    setPendingAddress(undefined);
    setPendingRecommendedName(undefined);
    setPreFillName(undefined);
    setPreFillAddress(undefined);
    // Reverse geocode in the background to show address + recommended name
    reverseGeocodeDetailed(lat, lng).then(detail => {
      if (detail) {
        setPendingAddress(detail.address || undefined);
        setPendingRecommendedName(detail.placeName || undefined);
      }
    }).catch(() => {});
  };

  const handleConfirmPin = () => {
    if (!pendingPin) return;
    setClickedLocation(pendingPin);
    setPendingPin(null);
    // Pre-fill address from reverse geocode if available
    if (pendingAddress) setPreFillAddress(pendingAddress);
    if (pendingRecommendedName) setPreFillName(pendingRecommendedName);
    setPendingAddress(undefined);
    setPendingRecommendedName(undefined);
    setShowSaveModal(true);
  };

  const handleQuickAddPin = async () => {
    if (!pendingPin || !pendingRecommendedName) return;
    try {
      await createPlace(
        pendingRecommendedName || 'New Place',
        pendingPin.latitude,
        pendingPin.longitude,
        pendingAddress,
      );
      await clearFiltersAndReloadPlaces();
      setPendingPin(null);
      setPendingAddress(undefined);
      setPendingRecommendedName(undefined);
    } catch (error) {
      console.error('Failed to quick-add place:', error);
    }
  };

  const handleCancelPin = () => {
    setPendingPin(null);
    setPendingAddress(undefined);
    setPendingRecommendedName(undefined);
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
    // Dismiss any pending pin when selecting an existing place
    setPendingPin(null);
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
        <TouchableOpacity
          onPress={() => {
            loadFriendLists();
            setShowFriendPanel(true);
          }}
          style={{ marginRight: theme.spacing.sm }}
        >
          <View style={[styles.filterButton, activeFriendListIds.size > 0 && styles.filterButtonActive]}>
            <MaterialCommunityIcons
              name="account-group"
              size={20}
              color={activeFriendListIds.size > 0 ? theme.colors.primary : theme.colors.secondary}
            />
            {activeFriendListIds.size > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFriendListIds.size}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
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
          pendingPin={pendingPin}
          center={recenterTarget ?? undefined}
          onCenterConsumed={() => setRecenterTarget(null)}
        />
        {/* Pending-pin confirmation banner */}
        {pendingPin && (
          <View style={styles.pinConfirmBanner}>
            <Text style={styles.pinConfirmText}>Add a place here?</Text>
            {pendingAddress ? (
              <Text style={styles.pinAddressText}>{pendingAddress}</Text>
            ) : null}
            {pendingRecommendedName ? (
              <TouchableOpacity style={styles.pinQuickAddButton} onPress={handleQuickAddPin}>
                <MaterialCommunityIcons name="map-marker-plus" size={16} color={theme.colors.primary} />
                <Text style={styles.pinQuickAddText}>Quick Add: {pendingRecommendedName}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.pinConfirmButtons}>
              <TouchableOpacity style={styles.pinCancelButton} onPress={handleCancelPin}>
                <Text style={styles.pinCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pinConfirmButton} onPress={handleConfirmPin}>
                <MaterialCommunityIcons name="check" size={18} color="#fff" />
                <Text style={styles.pinConfirmButtonText}>Add Place Here</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Place Info Card */}
        {selectedPlace && (
          <PlaceInfoCard
            place={selectedPlace}
            categoryName={selectedPlaceCategory}
            imageUri={selectedPlaceImage}
            onPress={handleInfoCardPress}
            onAddToList={handleOpenAddToList}
            onAddImage={handleAddImageFromMap}
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

      {/* Add to List Modal */}
      <AddToListModal
        visible={showAddToListModal}
        lists={modalAllLists}
        placeLists={modalPlaceLists}
        onToggle={handleToggleList}
        onClose={() => setShowAddToListModal(false)}
      />

      {/* Friend Lists Panel */}
      <Modal
        visible={showFriendPanel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFriendPanel(false)}
      >
        <TouchableOpacity
          style={styles.friendPanelOverlay}
          activeOpacity={1}
          onPress={() => setShowFriendPanel(false)}
        >
          <View style={styles.friendPanel}>
            <View style={styles.friendPanelHandle} />
            <View style={styles.friendPanelHeader}>
              <Text style={styles.friendPanelTitle}>Friends' Lists</Text>
              <TouchableOpacity onPress={() => setShowFriendPanel(false)}>
                <MaterialCommunityIcons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {friendLists.length === 0 ? (
              <Text style={styles.friendPanelEmpty}>
                No imported friend lists yet.{'\n'}Import a share code in Settings.
              </Text>
            ) : (
              <FlatList
                data={friendLists}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <View style={styles.friendListRow}>
                    <View style={styles.friendListInfo}>
                      <Text style={styles.friendListName}>{item.name}</Text>
                      {item.importedAt && (
                        <Text style={styles.friendListMeta}>
                          {new Date(item.importedAt).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                    <Switch
                      value={activeFriendListIds.has(item.id)}
                      onValueChange={() => handleToggleFriendList(item.id)}
                      trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                    />
                  </View>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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
  filterButtonActive: {
    // Visual indicator that friend filter is active (handled by icon color)
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
  friendPanelOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  friendPanel: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    maxHeight: '60%',
  },
  friendPanelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  friendPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  friendPanelTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  friendPanelEmpty: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
  friendListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  friendListInfo: {
    flex: 1,
  },
  friendListName: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '500',
  },
  friendListMeta: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  pinConfirmBanner: {
    position: 'absolute',
    top: theme.spacing.md,
    left: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: theme.spacing.md,
    ...theme.shadow,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 10,
  },
  pinConfirmText: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  pinAddressText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  pinQuickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  pinQuickAddText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  pinConfirmButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  pinCancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  pinCancelButtonText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  pinConfirmButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  pinConfirmButtonText: {
    ...theme.typography.body,
    color: '#fff',
    fontWeight: '600',
  },
});
