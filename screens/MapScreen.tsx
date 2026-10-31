import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  FlatList,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
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
  getAllListItems,
  getAllLists,
  getListIdsForPlace,
  addPlaceToList,
  removePlaceFromList,
  updatePlace,
  getImportedFriendLists,
} from '../lib/db';
import { searchPlaces, extractCoordinates, reverseGeocodeDetailed, NominatimResult, isSpecificPlace, formatAddress } from '../lib/maps';
import MapView from '../components/MapView';
import PlaceSearchModal from '../components/PlaceSearchModal';
import PlaceSaveModal from '../components/PlaceSaveModal';
import PlaceInfoCard from '../components/PlaceInfoCard';
import MapFilterModal, { MapFilters } from '../components/MapFilterModal';
import AddToListModal from '../components/AddToListModal';
import BottomSheet from '../components/BottomSheet';
import { pickImage } from '../lib/imageStorage';

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
  const [places, setPlaces] = useState<Place[]>([]);
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
  const filterRunRef = useRef(0);

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
    // Try to get location silently in background (don't show errors on initial load)
    getCurrentLocation(false);
  }, []);

  // Reload whenever the tab is focused (e.g. after editing or deleting a place).
  useEffect(() => {
    const reload = () => {
      loadPlaces();
      loadFriendLists();
    };
    reload();
    const unsubscribe = navigation.addListener('focus', reload);
    return unsubscribe;
  }, [navigation]);

  // Re-filter whenever the data or any filter changes.
  useEffect(() => {
    applyFilters(allPlaces, { ...filters, listIds: [...new Set([...filters.listIds, ...activeFriendListIds])] });
  }, [allPlaces, filters, activeFriendListIds]);

  const getCurrentLocation = async (recenterAfter = false) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (recenterAfter) {
          Alert.alert('Location unavailable', 'Allow location access to center the map on you.');
        }
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      if (recenterAfter) {
        setRecenterTarget({ lat: location.coords.latitude, lng: location.coords.longitude });
      }
    } catch (error: any) {
      if (recenterAfter) {
        Alert.alert('Location unavailable', 'Your device could not determine your location right now.');
      }
    }
  };

  const loadPlaces = async () => {
    try {
      const loadedPlaces = await getAllPlaces();
      setSelectedPlace(current => (current && !loadedPlaces.some(p => p.id === current.id) ? null : current));
      setAllPlaces(loadedPlaces);
    } catch (error) {
      console.error('Failed to load places:', error);
    }
  };

  const applyFilters = async (source: Place[], currentFilters: MapFilters) => {
    // Filters run async; ignore results from an older run that finishes late.
    const run = ++filterRunRef.current;
    let filtered = [...source];

    const search = currentFilters.searchText?.trim().toLowerCase();
    if (search) {
      filtered = filtered.filter(place =>
        [place.name, place.address, place.notes].some(field => field?.toLowerCase().includes(search))
      );
    }

    if (currentFilters.categoryIds.length > 0) {
      filtered = filtered.filter(p => p.categoryId && currentFilters.categoryIds.includes(p.categoryId));
    }

    if (currentFilters.tagIds.length > 0) {
      filtered = filtered.filter(p => currentFilters.tagIds.some(tagId => p.tagIds?.includes(tagId)));
    }

    if (currentFilters.listIds.length > 0) {
      const items = await getAllListItems();
      const listIds = new Set(currentFilters.listIds);
      const placeIdsInLists = new Set(items.filter(li => listIds.has(li.listId)).map(li => li.placeId));
      filtered = filtered.filter(p => placeIdsInLists.has(p.id));
    }

    if (currentFilters.ratingFilterType !== 'none') {
      const { ratingFilterType, minRating, maxRating, exactRating } = currentFilters;
      filtered = filtered.filter(place => {
        const rating = place.overallRating ?? 0;
        if (ratingFilterType === 'min' && minRating !== undefined) return rating >= minRating;
        if (ratingFilterType === 'max' && maxRating !== undefined) return rating <= maxRating;
        if (ratingFilterType === 'exact' && exactRating !== undefined) return Math.abs(rating - exactRating) < 0.25;
        return true;
      });
    }

    if (run === filterRunRef.current) setPlaces(filtered);
  };

  const handleFiltersChange = (newFilters: MapFilters) => {
    setFilters(newFilters);
  };

  const clearFiltersAndReloadPlaces = async () => {
    setFilters(DEFAULT_FILTERS);
    setActiveFriendListIds(new Set());
    await loadPlaces();
  };

  const handleOpenAddToList = async () => {
    if (!selectedPlace) return;
    try {
      const [allLists, memberOf] = await Promise.all([getAllLists(), getListIdsForPlace(selectedPlace.id)]);
      setModalAllLists(allLists);
      setModalPlaceLists(allLists.filter(l => memberOf.includes(l.id)));
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
    const uri = await pickImage();
    if (!uri) return;
    try {
      await updatePlace(selectedPlace.id, { coverImageUri: uri });
      setSelectedPlaceImage(uri);
      const updated = await getPlace(selectedPlace.id);
      if (updated) setSelectedPlace(updated);
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

  const handleSearchSelect = async (result: NominatimResult) => {
    try {
      const coords = extractCoordinates(result);
      setSelectedPlace(null);
      setShowSearchModal(false);
      setSearchQuery('');

      if (isSpecificPlace(result)) {
        // Specific place (restaurant, shop, etc.): drop a pending pin so the user can add it
        setPendingPin({ latitude: coords.latitude, longitude: coords.longitude });
        setPendingAddress(formatAddress(result) || result.display_name || undefined);
        setPendingRecommendedName(result.name || undefined);
        setRecenterTarget({ lat: coords.latitude, lng: coords.longitude });
      } else {
        // City / region / road: just pan the map
        setPendingPin(null);
        setPendingAddress(undefined);
        setPendingRecommendedName(undefined);
        setRecenterTarget({ lat: coords.latitude, lng: coords.longitude });
      }
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

    // Prefer the cover photo, else the most recent visit photo.
    try {
      const fresh = await getPlace(place.id);
      if (fresh?.coverImageUri) {
        setSelectedPlaceImage(fresh.coverImageUri);
      } else {
        const visits = await getVisitsForPlace(place.id);
        setSelectedPlaceImage(visits.find(v => v.photoUri)?.photoUri);
      }
    } catch (error) {
      console.error('Failed to load place photo:', error);
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
        <TouchableOpacity onPress={loadPlaces} accessibilityLabel="Refresh" accessibilityRole="button">
          <MaterialCommunityIcons name="refresh" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} />
        </View>
        <TouchableOpacity onPress={() => setShowSearchModal(true)} accessibilityLabel="Add a place" accessibilityRole="button">
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
        <TouchableOpacity onPress={() => setShowFilterModal(true)} accessibilityLabel="Filters" accessibilityRole="button">
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
      <BottomSheet visible={showFriendPanel} onClose={() => setShowFriendPanel(false)} title="Friends' Lists" maxHeightFraction={0.7}>
        {friendLists.length === 0 ? (
          <Text style={styles.friendPanelEmpty}>
            No imported friend lists yet.{'\n'}Import a share code in Settings.
          </Text>
        ) : (
          <FlatList
            data={friendLists}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.friendListRow} onPress={() => handleToggleFriendList(item.id)} activeOpacity={0.7}>
                <View style={styles.friendListInfo}>
                  <Text style={styles.friendListName}>{item.name}</Text>
                  {item.importedAt ? (
                    <Text style={styles.friendListMeta}>{new Date(item.importedAt).toLocaleDateString()}</Text>
                  ) : null}
                </View>
                <Switch
                  value={activeFriendListIds.has(item.id)}
                  onValueChange={() => handleToggleFriendList(item.id)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </TouchableOpacity>
            )}
          />
        )}
      </BottomSheet>
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
