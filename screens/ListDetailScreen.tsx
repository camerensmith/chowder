import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { getList, getListItems, getAllPlaces, addPlaceToList, updateList } from '../lib/db';
import { List, Place } from '../types';
import ShareCodeGenerator from '../components/ShareCodeGenerator';
import PlaceSelectModal from '../components/PlaceSelectModal';
import { getRatingScalePreference, toDisplayRating, RatingScale } from '../lib/ratingScale';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'ListDetail'>;

export default function ListDetailScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavigationProp>();
  const { listId } = route.params;
  const [list, setList] = useState<List | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPlaceSelectModal, setShowPlaceSelectModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [ratingScale, setRatingScale] = useState<RatingScale>(5);

  useEffect(() => {
    loadList();
    getRatingScalePreference().then(setRatingScale);
  }, [listId]);

  const loadList = async () => {
    try {
      const listData = await getList(listId);
      if (!listData) {
        navigation.goBack();
        return;
      }
      setList(listData);

      const items = await getListItems(listId);
      const allPlaces = await getAllPlaces();
      const listPlaces = items
        .map(item => allPlaces.find(p => p.id === item.placeId))
        .filter((p): p is Place => p !== undefined);
      setPlaces(listPlaces);
    } catch (error) {
      console.error('Failed to load list:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPlace = async (placeId: string) => {
    try {
      await addPlaceToList(listId, placeId);
      await loadList();
    } catch (error) {
      console.error('Failed to add place to list:', error);
    }
  };

  const handleRenamePress = () => {
    setRenameValue(list?.name ?? '');
    setShowRenameModal(true);
  };

  const handleConfirmRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a name for your list.');
      return;
    }
    try {
      await updateList(listId, { name: trimmed });
      setShowRenameModal(false);
      await loadList();
    } catch (error) {
      console.error('Failed to rename list:', error);
      Alert.alert('Error', 'Failed to rename list. Please try again.');
    }
  };

  const renderPlaceCard = ({ item }: { item: Place }) => {
    return (
      <TouchableOpacity
        style={styles.placeCard}
        onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.placeInfo}>
          <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
          {item.address && (
            <Text style={styles.placeAddress} numberOfLines={1}>{item.address}</Text>
          )}
          {item.overallRating && (
            <View style={styles.ratingContainer}>
              {[...Array(5)].map((_, i) => (
                <MaterialCommunityIcons
                  key={i}
                  name={i < Math.round(item.overallRating!) ? 'star' : 'star-outline'}
                  size={14}
                  color={theme.colors.star}
                />
              ))}
              <Text style={styles.ratingText}>{toDisplayRating(item.overallRating, ratingScale).toFixed(1)}</Text>
            </View>
          )}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  if (isLoading || !list) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerTitleContainer} onPress={handleRenamePress} activeOpacity={0.7}>
          <Text style={styles.headerTitle} numberOfLines={1}>{list.name}</Text>
          <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.textSecondary} style={styles.editIcon} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowShareModal(true)}>
          <MaterialCommunityIcons name="share-variant" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* List Info */}
      {(list.description || list.category || list.city) && (
        <View style={styles.listInfo}>
          {list.description && <Text style={styles.description}>{list.description}</Text>}
          <View style={styles.metaContainer}>
            {list.category && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{list.category}</Text>
              </View>
            )}
            {list.city && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{list.city}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Places */}
      <View style={styles.placesContainer}>
        {places.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="map-marker-off" size={48} color={theme.colors.border} />
            <Text style={styles.emptyText}>No places in this list</Text>
          </View>
        ) : (
          <FlatList
            data={places}
            renderItem={renderPlaceCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}
        
        {/* Add Place Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowPlaceSelectModal(true)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Place</Text>
        </TouchableOpacity>
      </View>

      {/* Share Modal */}
      {showShareModal && (
        <ShareCodeGenerator
          listId={listId}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Place Select Modal */}
      <PlaceSelectModal
        visible={showPlaceSelectModal}
        listId={listId}
        onClose={() => setShowPlaceSelectModal(false)}
        onSelect={handleAddPlace}
      />

      {/* Rename Modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.renameModal}>
            <Text style={styles.renameModalTitle}>Rename List</Text>
            <TextInput
              style={styles.renameModalInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="List name"
              placeholderTextColor={theme.colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleConfirmRename}
            />
            <View style={styles.renameModalButtons}>
              <TouchableOpacity
                style={styles.renameModalCancelButton}
                onPress={() => setShowRenameModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.renameModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameModalConfirmButton, !renameValue.trim() && styles.renameModalConfirmButtonDisabled]}
                onPress={handleConfirmRename}
                activeOpacity={0.7}
              >
                <Text style={styles.renameModalConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: theme.spacing.md,
  },
  headerTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
    textAlign: 'center',
    flexShrink: 1,
  },
  editIcon: {
    marginLeft: theme.spacing.xs,
  },
  listInfo: {
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  metaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  chipText: {
    ...theme.typography.caption,
    color: theme.colors.text,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
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
    marginBottom: theme.spacing.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  ratingText: {
    ...theme.typography.caption,
    color: theme.colors.text,
    marginLeft: theme.spacing.xs,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  placesContainer: {
    flex: 1,
    position: 'relative',
  },
  addButton: {
    position: 'absolute',
    bottom: theme.spacing.lg,
    right: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing.sm,
    ...theme.shadow,
  },
  addButtonText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  renameModal: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 360,
    ...theme.shadow,
  },
  renameModalTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  renameModalInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    ...theme.typography.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.lg,
  },
  renameModalButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  renameModalCancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  renameModalCancelText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  renameModalConfirmButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  renameModalConfirmButtonDisabled: {
    opacity: 0.45,
  },
  renameModalConfirmText: {
    ...theme.typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
