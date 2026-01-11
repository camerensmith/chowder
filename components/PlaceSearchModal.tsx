import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { searchPlaces, NominatimResult, formatAddress, SearchOptions } from '../lib/maps';

interface PlaceSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: NominatimResult) => void;
  initialLocation?: { latitude: number; longitude: number };
}

export default function PlaceSearchModal({ visible, onClose, onSelect, initialLocation }: PlaceSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Get user's current location when modal opens
  useEffect(() => {
    if (visible && !initialLocation) {
      // Silently try to get location - don't show errors as it's optional
      getCurrentLocation();
    } else if (initialLocation) {
      setUserLocation(initialLocation);
    }
  }, [visible, initialLocation]);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Permission denied - silently fail, search works without location
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low, // Lower accuracy = faster, more reliable
        timeout: 15000, // 15 second timeout
        maximumAge: 300000, // Accept cached location up to 5 minutes old
      });
      
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error: any) {
      // Silently handle all location errors - search works fine without location
      // Error codes:
      // 1 = PERMISSION_DENIED
      // 2 = POSITION_UNAVAILABLE (GPS disabled, no signal, etc.)
      // 3 = TIMEOUT
      // All are non-fatal - search will work without location bias
    }
  };

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const searchOptions: SearchOptions | undefined = userLocation || initialLocation
        ? {
            latitude: (userLocation || initialLocation)!.latitude,
            longitude: (userLocation || initialLocation)!.longitude,
            radius: 25, // 25km radius for local search
          }
        : undefined;

      const searchResults = await searchPlaces(text, searchOptions);
      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [userLocation, initialLocation]);

  const handleSelect = (result: NominatimResult) => {
    onSelect(result);
    setQuery('');
    setResults([]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search Places</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for restaurants, cafes..."
            placeholderTextColor={theme.colors.textSecondary}
            value={query}
            onChangeText={handleSearch}
            autoFocus
          />
          {isLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
        </View>

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(item) => item.place_id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="map-marker" size={20} color={theme.colors.primary} />
              <View style={styles.resultInfo}>
                <Text style={styles.resultName}>{item.name || item.display_name}</Text>
                <Text style={styles.resultAddress} numberOfLines={1}>
                  {formatAddress(item)}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length >= 2 && !isLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No results found</Text>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
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
  headerTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
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
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  resultInfo: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  resultName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  resultAddress: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
});
