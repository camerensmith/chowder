import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { getAllPlaces, createPlace } from '../lib/db';
import { searchPlaces, extractCoordinates, formatAddress, NominatimResult } from '../lib/maps';
import MapView from '../components/MapView';
import PlaceSearchModal from '../components/PlaceSearchModal';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function MapScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [places, setPlaces] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  useEffect(() => {
    loadPlaces();
  }, []);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <MaterialCommunityIcons name="home" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons name="bowl" size={24} color={theme.colors.primary} />
          <MaterialCommunityIcons name="silverware-fork-knife" size={16} color={theme.colors.secondary} style={styles.spoon} />
        </View>
        <TouchableOpacity onPress={() => setShowSearchModal(true)}>
          <View style={styles.addButton}>
            <MaterialCommunityIcons name="plus" size={20} color={theme.colors.background} />
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
        />
      </View>

      {/* Place Search Modal */}
      <PlaceSearchModal
        visible={showSearchModal}
        onClose={() => {
          setShowSearchModal(false);
          setSearchQuery('');
        }}
        onSelect={handleSearchSelect}
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
    position: 'relative',
  },
  spoon: {
    position: 'absolute',
    bottom: -4,
    right: -4,
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
  },
});
