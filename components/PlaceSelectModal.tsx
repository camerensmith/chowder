import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Place } from '../types';
import { theme } from '../lib/theme';
import { getAllPlaces, getListItems } from '../lib/db';

interface PlaceSelectModalProps {
  visible: boolean;
  listId: string;
  onClose: () => void;
  onSelect: (placeId: string) => void;
}

export default function PlaceSelectModal({ visible, listId, onClose, onSelect }: PlaceSelectModalProps) {
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [filteredPlaces, setFilteredPlaces] = useState<Place[]>([]);
  const [placesInList, setPlacesInList] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, listId]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      setFilteredPlaces(
        allPlaces.filter(
          place =>
            place.name.toLowerCase().includes(query) ||
            place.address?.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredPlaces(allPlaces);
    }
  }, [searchQuery, allPlaces]);

  const loadData = async () => {
    try {
      const [places, listItems] = await Promise.all([
        getAllPlaces(),
        getListItems(listId),
      ]);
      setAllPlaces(places);
      setFilteredPlaces(places);
      const placeIdsInList = new Set(listItems.map(item => item.placeId));
      setPlacesInList(placeIdsInList);
    } catch (error) {
      console.error('Failed to load places:', error);
    }
  };

  const handlePlaceSelect = (place: Place) => {
    onSelect(place.id);
    onClose();
  };

  const renderPlaceItem = ({ item }: { item: Place }) => {
    const isInList = placesInList.has(item.id);
    
    return (
      <TouchableOpacity
        style={[styles.placeItem, isInList && styles.placeItemInList]}
        onPress={() => !isInList && handlePlaceSelect(item)}
        disabled={isInList}
        activeOpacity={0.7}
      >
        <View style={styles.placeInfo}>
          <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
          {item.address && (
            <Text style={styles.placeAddress} numberOfLines={1}>{item.address}</Text>
          )}
        </View>
        {isInList ? (
          <MaterialCommunityIcons name="check-circle" size={24} color={theme.colors.primary} />
        ) : (
          <MaterialCommunityIcons name="plus-circle" size={24} color={theme.colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Place to List</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search places..."
              placeholderTextColor={theme.colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Places List */}
          <FlatList
            data={filteredPlaces}
            renderItem={renderPlaceItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {searchQuery ? 'No places found' : 'No places available'}
                </Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text,
  },
  listContent: {
    padding: theme.spacing.md,
  },
  placeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  placeItemInList: {
    opacity: 0.6,
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  placeAddress: {
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
