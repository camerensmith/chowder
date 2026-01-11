import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import {
  getPlace,
  getVisitsForPlace,
  getAllLists,
  addPlaceToList,
  removePlaceFromList,
  getListItems,
  updatePlace,
  deletePlace,
  getDishesForPlace,
  createVisit,
  createDish,
  updateDish,
  deleteDish,
} from '../lib/db';
import { Place, List, Visit, Dish, Category } from '../types';
import PlaceEditModal from '../components/PlaceEditModal';
import DishEditModal from '../components/DishEditModal';
import TagManager from '../components/TagManager';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'PlaceDetail'>;

export default function PlaceDetailScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavigationProp>();
  const { placeId } = route.params;
  const [place, setPlace] = useState<Place | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [placeLists, setPlaceLists] = useState<List[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showDishes, setShowDishes] = useState(false);
  const [showDishEditModal, setShowDishEditModal] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [mainImageUri, setMainImageUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadPlace();
  }, [placeId]);

  const loadPlace = async () => {
    try {
      const placeData = await getPlace(placeId);
      if (!placeData) {
        navigation.goBack();
        return;
      }
      setPlace(placeData);

      const placeVisits = await getVisitsForPlace(placeId);
      setVisits(placeVisits);

      // Get main image from most recent visit with photo
      const visitWithPhoto = placeVisits.find(v => v.photoUri);
      setMainImageUri(visitWithPhoto?.photoUri);

      // Get dishes for this place
      const placeDishes = await getDishesForPlace(placeId);
      setDishes(placeDishes);

      const allLists = await getAllLists();
      setLists(allLists);

      // Find which lists contain this place
      const listsWithPlace: List[] = [];
      for (const list of allLists) {
        const items = await getListItems(list.id);
        if (items.some(item => item.placeId === placeId)) {
          listsWithPlace.push(list);
        }
      }
      setPlaceLists(listsWithPlace);
    } catch (error) {
      console.error('Failed to load place:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleList = async (listId: string) => {
    try {
      const isInList = placeLists.some(l => l.id === listId);
      if (isInList) {
        await removePlaceFromList(listId, placeId);
      } else {
        await addPlaceToList(listId, placeId);
      }
      await loadPlace();
    } catch (error) {
      console.error('Failed to update list:', error);
    }
  };

  const handleMenuPress = () => {
    setShowMenuModal(true);
  };

  const handleEdit = () => {
    setShowMenuModal(false);
    setShowEditModal(true);
  };

  const handleDeletePress = () => {
    setShowMenuModal(false);
    handleDelete();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Place',
      `Are you sure you want to delete "${place?.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlace(placeId);
              navigation.goBack();
            } catch (error) {
              console.error('Failed to delete place:', error);
              Alert.alert('Error', 'Failed to delete place');
            }
          },
        },
      ]
    );
  };

  const handleAddDish = () => {
    setEditingDish(null);
    setShowDishEditModal(true);
  };

  const handleEditDish = (dish: Dish) => {
    setEditingDish(dish);
    setShowDishEditModal(true);
  };

  const handleSaveDish = async (dishData: { name: string; rating: number; categoryId?: string; notes?: string; photoUri?: string }) => {
    try {
      if (editingDish) {
        // Update existing dish
        await updateDish(editingDish.id, dishData);
      } else {
        // Create new dish - attach to most recent visit or create new visit
        let visitIdToUse: string;
        if (visits.length === 0) {
          const newVisit = await createVisit(placeId, 0);
          visitIdToUse = newVisit.id;
        } else {
          visitIdToUse = visits[0].id;
        }
        await createDish(visitIdToUse, dishData.name, dishData.rating, dishData.categoryId, dishData.notes, dishData.photoUri);
      }
      await loadPlace();
      setShowDishes(true);
    } catch (error) {
      console.error('Failed to save dish:', error);
      Alert.alert('Error', 'Failed to save dish');
    }
  };

  const handleDeleteDish = async (dishId: string) => {
    Alert.alert(
      'Delete Dish',
      'Are you sure you want to delete this dish?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDish(dishId);
              await loadPlace();
            } catch (error) {
              console.error('Failed to delete dish:', error);
              Alert.alert('Error', 'Failed to delete dish');
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async (updates: { name: string; address: string; categoryId?: string; rating?: number; imageUri?: string; overallRatingManual?: number; ratingMode?: 'aggregate' | 'overall' }) => {
    if (!place) return;
    try {
      await updatePlace(placeId, {
        name: updates.name,
        address: updates.address,
        categoryId: updates.categoryId,
        overallRatingManual: updates.overallRatingManual,
        ratingMode: updates.ratingMode,
      });
      
      // If rating or image is provided, create or update a visit
      if (updates.rating !== undefined || updates.imageUri) {
        const existingVisits = await getVisitsForPlace(placeId);
        const rating = updates.rating !== undefined ? updates.rating : (existingVisits[0]?.rating || 0);
        const imageUri = updates.imageUri || existingVisits[0]?.photoUri;
        
        if (existingVisits.length > 0) {
          // Update the most recent visit
          const mostRecentVisit = existingVisits[0];
          // Note: We don't have updateVisit function yet, so we'll create a new visit
          // In a real app, you'd want to update the existing visit
          await createVisit(placeId, rating, mostRecentVisit.notes, imageUri);
        } else {
          // Create a new visit with the rating and/or image
          await createVisit(placeId, rating, undefined, imageUri);
        }
      }
      
      await loadPlace();
    } catch (error) {
      console.error('Failed to update place:', error);
      Alert.alert('Error', 'Failed to update place');
    }
  };

  const calculateAggregateRating = (): number | undefined => {
    if (dishes.length === 0) return undefined;
    const sum = dishes.reduce((acc, dish) => acc + dish.rating, 0);
    return sum / dishes.length;
  };

  const getDisplayRating = (): number | undefined => {
    if (!place) return undefined;
    const ratingMode = place.ratingMode || 'overall';
    
    if (ratingMode === 'aggregate') {
      return calculateAggregateRating();
    } else {
      // Use overallRatingManual if set, otherwise fall back to overallRating (from visits)
      return place.overallRatingManual ?? place.overallRating;
    }
  };

  const handleToggleRatingMode = async () => {
    if (!place) return;
    const newMode = place.ratingMode === 'aggregate' ? 'overall' : 'aggregate';
    try {
      await updatePlace(placeId, { ratingMode: newMode });
      await loadPlace();
    } catch (error) {
      console.error('Failed to update rating mode:', error);
      Alert.alert('Error', 'Failed to update rating mode');
    }
  };

  const handleCheckIn = async () => {
    try {
      // Create a new visit with default rating of 0 (user can edit later)
      await createVisit(placeId, 0);
      await loadPlace();
      Alert.alert('Success', 'Check-in recorded!');
    } catch (error) {
      console.error('Failed to check in:', error);
      Alert.alert('Error', 'Failed to record check-in');
    }
  };

  const handleStarPress = async (starValue: number) => {
    if (!place) return;
    
    // Only allow rating when in 'overall' mode
    if (place.ratingMode === 'aggregate') {
      Alert.alert('Info', 'Switch to "Overall" mode to set a manual rating');
      return;
    }
    
    try {
      await updatePlace(placeId, { overallRatingManual: starValue });
      await loadPlace();
    } catch (error) {
      console.error('Failed to update rating:', error);
      Alert.alert('Error', 'Failed to update rating');
    }
  };

  const renderStars = (rating: number, interactive: boolean = false) => {
    return (
      <View style={styles.starsContainer}>
        {[...Array(5)].map((_, i) => {
          const starValue = i + 1;
          const isFilled = starValue <= Math.round(rating);
          
          if (interactive) {
            return (
              <TouchableOpacity
                key={i}
                onPress={() => handleStarPress(starValue)}
                activeOpacity={0.7}
                style={styles.starButton}
              >
                <MaterialCommunityIcons
                  name={isFilled ? 'star' : 'star-outline'}
                  size={24}
                  color={isFilled ? theme.colors.star : theme.colors.starEmpty}
                />
              </TouchableOpacity>
            );
          }
          
          return (
            <MaterialCommunityIcons
              key={i}
              name={isFilled ? 'star' : 'star-outline'}
              size={20}
              color={isFilled ? theme.colors.star : theme.colors.starEmpty}
            />
          );
        })}
      </View>
    );
  };

  if (isLoading || !place) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text>Loading...</Text>
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
        <Text style={styles.headerTitle} numberOfLines={1}>{place.name}</Text>
        <TouchableOpacity onPress={handleMenuPress}>
          <MaterialCommunityIcons name="dots-vertical" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Main Image */}
        {mainImageUri && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: mainImageUri }} style={styles.mainImage} resizeMode="cover" />
          </View>
        )}

        {/* Dishes Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowDishes(!showDishes)}
            activeOpacity={0.7}
          >
            <Text style={styles.sectionTitle}>Dishes</Text>
            <MaterialCommunityIcons
              name={showDishes ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
          {showDishes && (
            <View style={styles.dishesContent}>
              {dishes.length === 0 ? (
                <Text style={styles.emptyText}>No dishes added yet</Text>
              ) : (
                dishes.map(dish => (
                  <TouchableOpacity
                    key={dish.id}
                    style={styles.dishCard}
                    onPress={() => handleEditDish(dish)}
                    activeOpacity={0.7}
                  >
                    {dish.photoUri && (
                      <Image source={{ uri: dish.photoUri }} style={styles.dishImage} />
                    )}
                    <View style={styles.dishContent}>
                      <View style={styles.dishHeader}>
                        <Text style={styles.dishName}>{dish.name}</Text>
                        {renderStars(dish.rating)}
                      </View>
                      {dish.notes && <Text style={styles.dishNotes}>{dish.notes}</Text>}
                    </View>
                    <TouchableOpacity
                      style={styles.dishDeleteButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteDish(dish.id);
                      }}
                    >
                      <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.error} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity
                style={styles.addDishButton}
                onPress={handleAddDish}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="plus" size={20} color={theme.colors.primary} />
                <Text style={styles.addDishText}>Add Dish</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {/* Rating */}
        <View style={styles.ratingSection}>
          <View style={styles.ratingHeader}>
            <View style={styles.ratingDisplay}>
              {(() => {
                const displayRating = getDisplayRating();
                const isOverallMode = (place.ratingMode || 'overall') === 'overall';
                const isInteractive = isOverallMode; // Only interactive in overall mode
                
                if (displayRating) {
                  return (
                    <>
                      {renderStars(displayRating, isInteractive)}
                      <Text style={styles.ratingText}>{displayRating.toFixed(1)}</Text>
                    </>
                  );
                }
                // Show interactive stars even when no rating (for setting initial rating)
                if (isOverallMode) {
                  return (
                    <>
                      {renderStars(0, true)}
                      <Text style={styles.ratingTextPlaceholder}>Tap to rate</Text>
                    </>
                  );
                }
                return (
                  <Text style={styles.ratingTextPlaceholder}>No rating</Text>
                );
              })()}
            </View>
            <TouchableOpacity
              style={styles.ratingModeToggle}
              onPress={handleToggleRatingMode}
              activeOpacity={0.7}
            >
              <Text style={styles.ratingModeLabel}>
                {(place.ratingMode || 'overall') === 'aggregate' ? 'Average' : 'Overall'}
              </Text>
              <MaterialCommunityIcons
                name={(place.ratingMode || 'overall') === 'aggregate' ? 'chart-line' : 'star'}
                size={16}
                color={theme.colors.primary}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.ratingSubtext}>
            {(place.ratingMode || 'overall') === 'aggregate'
              ? dishes.length > 0
                ? `Average of ${dishes.length} ${dishes.length === 1 ? 'dish' : 'dishes'}`
                : 'No dishes yet'
              : place.overallRatingManual !== undefined
                ? 'Tap stars to change rating'
                : 'Tap stars to rate'}
          </Text>
        </View>

        {/* Tags */}
        <View style={styles.section}>
          <TagManager placeId={placeId} onTagsChange={loadPlace} />
        </View>

        {/* Address */}
        {place.address && (
          <View style={styles.section}>
            <MaterialCommunityIcons name="map-marker" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.address}>{place.address}</Text>
          </View>
        )}

        {/* Notes */}
        {place.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notes}>{place.notes}</Text>
          </View>
        )}

        {/* Lists */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lists</Text>
          {lists.map(list => {
            const isInList = placeLists.some(l => l.id === list.id);
            return (
              <TouchableOpacity
                key={list.id}
                style={styles.listItem}
                onPress={() => handleToggleList(list.id)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={isInList ? 'check-circle' : 'circle-outline'}
                  size={20}
                  color={isInList ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text style={styles.listName}>{list.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Visits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visits</Text>
          {visits.length > 0 && (
            <>
              {visits.map(visit => (
                <View key={visit.id} style={styles.visitCard}>
                  <View style={styles.visitHeader}>
                    {renderStars(visit.rating)}
                    <Text style={styles.visitDate}>
                      {new Date(visit.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {visit.notes && <Text style={styles.visitNotes}>{visit.notes}</Text>}
                </View>
              ))}
            </>
          )}
          {/* Check In Button */}
          <TouchableOpacity
            style={styles.checkInButton}
            onPress={handleCheckIn}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="map-marker-check" size={24} color="#FFFFFF" />
            <Text style={styles.checkInButtonText}>Check In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Menu Modal */}
      <Modal
        visible={showMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenuModal(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleEdit}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.text} />
              <Text style={styles.menuItemText}>Edit</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              onPress={handleDeletePress}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="delete" size={20} color={theme.colors.error} />
              <Text style={[styles.menuItemText, styles.menuItemTextDestructive]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Modal */}
      <PlaceEditModal
        visible={showEditModal}
        place={place}
        onClose={() => setShowEditModal(false)}
        onSave={handleSaveEdit}
      />

      {/* Dish Edit Modal */}
      {visits.length > 0 && (
        <DishEditModal
          visible={showDishEditModal}
          dish={editingDish}
          visitId={visits[0].id}
          onClose={() => {
            setShowDishEditModal(false);
            setEditingDish(null);
          }}
          onSave={handleSaveDish}
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
  headerTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: theme.spacing.md,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  ratingSection: {
    marginBottom: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  ratingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  starsContainer: {
    flexDirection: 'row',
    marginRight: theme.spacing.sm,
    alignItems: 'center',
  },
  starButton: {
    padding: theme.spacing.xs,
    marginHorizontal: 2,
  },
  ratingText: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  ratingTextPlaceholder: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  ratingModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface,
  },
  ratingModeLabel: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  ratingSubtext: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  address: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  notes: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  listName: {
    ...theme.typography.body,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  visitCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  visitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  visitDate: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  visitNotes: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    marginBottom: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dishesContent: {
    marginTop: theme.spacing.md,
  },
  dishCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dishImage: {
    width: 80,
    height: 80,
    backgroundColor: theme.colors.border,
  },
  dishContent: {
    flex: 1,
    padding: theme.spacing.md,
  },
  dishHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  dishName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  dishNotes: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  dishDeleteButton: {
    padding: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  addDishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    marginTop: theme.spacing.sm,
  },
  addDishText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
    fontWeight: '600',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    minWidth: 200,
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 5,
      },
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  menuItemDestructive: {
    // No special styling needed, handled by text color
  },
  menuItemText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  menuItemTextDestructive: {
    color: theme.colors.error,
  },
  menuDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.md,
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 5,
      },
    }),
  },
  checkInButtonText: {
    ...theme.typography.h3,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
