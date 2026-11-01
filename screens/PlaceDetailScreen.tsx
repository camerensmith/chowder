import React, { useCallback, useState } from 'react';
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pickImage } from '../lib/imageStorage';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
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
  getListIdsForPlace,
  updatePlace,
  PlaceUpdates,
  deleteVisit,
  deletePlace,
  getDishesForPlace,
  createVisit,
  createDish,
  updateDish,
  deleteDish,
  getCategory,
  updateVisit,
} from '../lib/db';
import { Place, List, Visit, Dish, Category } from '../types';
import PlaceEditModal from '../components/PlaceEditModal';
import DishEditModal from '../components/DishEditModal';
import VisitEditModal from '../components/VisitEditModal';
import TagManager from '../components/TagManager';
import DraggableStarRating from '../components/DraggableStarRating';
import GoogleRatingFootnote from '../components/GoogleRatingFootnote';
import { getRatingScalePreference, toDisplayRating, toInternalRating, RatingScale } from '../lib/ratingScale';

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
  const [showDishes, setShowDishes] = useState(true);
  const [showDishEditModal, setShowDishEditModal] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [showVisitEditModal, setShowVisitEditModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [mainImageUri, setMainImageUri] = useState<string | undefined>(undefined);
  const [categoryName, setCategoryName] = useState<string | undefined>(undefined);
  const [ratingScale, setRatingScale] = useState<RatingScale>(5);

  // Reload on focus so edits made elsewhere (lists, map) show up when returning.
  useFocusEffect(
    useCallback(() => {
      loadPlace();
    }, [placeId])
  );

  const loadPlace = async () => {
    try {
      const scale = await getRatingScalePreference();
      setRatingScale(scale);
      const placeData = await getPlace(placeId);
      if (!placeData) {
        navigation.goBack();
        return;
      }
      setPlace(placeData);

      const placeVisits = await getVisitsForPlace(placeId);
      setVisits(placeVisits);

      // Cover photo, else the most recent visit photo
      setMainImageUri(placeData.coverImageUri || placeVisits.find(v => v.photoUri)?.photoUri);

      // Load category name if categoryId exists
      if (placeData.categoryId) {
        try {
          const category = await getCategory(placeData.categoryId);
          setCategoryName(category?.name);
        } catch (error) {
          console.error('Failed to load category:', error);
          setCategoryName(undefined);
        }
      } else {
        setCategoryName(undefined);
      }

      // Get dishes for this place
      const placeDishes = await getDishesForPlace(placeId);
      setDishes(placeDishes);

      const [allLists, memberOf] = await Promise.all([getAllLists(), getListIdsForPlace(placeId)]);
      setLists(allLists);
      setPlaceLists(allLists.filter(l => memberOf.includes(l.id)));
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
      `Delete "${place?.name}" along with its visits and dishes? This can't be undone.`,
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
        // Attach to today's visit if there is one; otherwise this dish starts a new visit.
        const today = new Date().toDateString();
        const todaysVisit = visits.find(v => new Date(v.createdAt).toDateString() === today);
        const visitIdToUse = todaysVisit ? todaysVisit.id : (await createVisit(placeId)).id;
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

  const handleSaveEdit = async (updates: PlaceUpdates) => {
    if (!place) return;
    try {
      await updatePlace(placeId, updates);
      await loadPlace();
    } catch (error) {
      console.error('Failed to update place:', error);
      Alert.alert('Error', 'Failed to update place');
    }
  };

  // Computed once in lib/db.ts (respects rating mode) so every screen agrees.
  const getDisplayRating = (): number | undefined => place?.overallRating;

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

  const handleDeleteVisit = (visit: Visit) => {
    const dishCount = dishes.filter(d => d.visitId === visit.id).length;
    Alert.alert(
      'Delete Visit',
      `Delete your visit on ${new Date(visit.createdAt).toLocaleDateString()}${dishCount ? ` and its ${dishCount} ${dishCount === 1 ? 'dish' : 'dishes'}` : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVisit(visit.id);
              await loadPlace();
            } catch (error) {
              console.error('Failed to delete visit:', error);
              Alert.alert('Error', 'Failed to delete visit');
            }
          },
        },
      ]
    );
  };

  const checkedInToday = visits.some(v => new Date(v.createdAt).toDateString() === new Date().toDateString());

  const openDirections = () => {
    if (!place) return;
    const { latitude: lat, longitude: lng } = place;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const apple = Platform.OS === 'ios' || /iPhone|iPad|Macintosh/.test(ua);
    const url = apple
      ? `https://maps.apple.com/?daddr=${lat},${lng}&q=${encodeURIComponent(place.name)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url).catch(() => Alert.alert('Could not open maps'));
  };

  const handleCheckIn = async () => {
    if (checkedInToday) return; // one visit per day; dishes added today attach to it
    try {
      await createVisit(placeId);
      await loadPlace();
    } catch (error) {
      console.error('Failed to check in:', error);
      Alert.alert('Error', 'Failed to record check-in');
    }
  };

  const handleEditVisit = (visit: Visit) => {
    setEditingVisit(visit);
    setShowVisitEditModal(true);
  };

  const handleSaveVisit = async (updates: { notes?: string }) => {
    if (!editingVisit) return;
    try {
      await updateVisit(editingVisit.id, updates);
      await loadPlace();
      setShowVisitEditModal(false);
      setEditingVisit(null);
    } catch (error) {
      console.error('Failed to update visit:', error);
      Alert.alert('Error', 'Failed to update visit');
    }
  };

  const handleRatingChange = async (newRating: number) => {
    if (!place) return;
    try {
      // Setting stars by hand means you want a manual rating, so switch to 'overall'.
      await updatePlace(placeId, { overallRatingManual: toInternalRating(newRating, ratingScale), ratingMode: 'overall' });
      await loadPlace();
    } catch (error) {
      console.error('Failed to update rating:', error);
      Alert.alert('Error', 'Failed to update rating');
    }
  };

  const handleQuickAddImage = async () => {
    const uri = await pickImage();
    if (!uri) return;
    try {
      await updatePlace(placeId, { coverImageUri: uri });
      await loadPlace();
    } catch (error) {
      console.error('Failed to add image:', error);
      Alert.alert('Error', 'Failed to update photo.');
    }
  };

  const renderStars = (rating: number, interactive: boolean = false) => {
    if (interactive) {
      return (
        <DraggableStarRating
          rating={toDisplayRating(rating || 0, ratingScale)}
          onRatingChange={handleRatingChange}
          size={24}
          disabled={false}
          maxRating={ratingScale}
        />
      );
    }
    
    // Display mode - show with half stars
    return (
      <View style={styles.starsContainer}>
        {[...Array(5)].map((_, i) => {
          const starValue = i + 1;
          const isHalf = rating >= starValue - 0.5 && rating < starValue;
          const isFilled = rating >= starValue;
          
          let iconName: string;
          if (isFilled) {
            iconName = 'star';
          } else if (isHalf) {
            iconName = 'star-half-full';
          } else {
            iconName = 'star-outline';
          }
          
          return (
            <MaterialCommunityIcons
              key={i}
              name={iconName as any}
              size={20}
              color={isFilled || isHalf ? theme.colors.star : theme.colors.starEmpty}
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
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back" accessibilityRole="button">
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{place.name}</Text>
        <TouchableOpacity onPress={handleMenuPress} accessibilityLabel="More options" accessibilityRole="button">
          <MaterialCommunityIcons name="dots-vertical" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Cover photo (compact prompt when there isn't one) */}
        {mainImageUri ? (
          <TouchableOpacity
            style={styles.imageContainer}
            onPress={handleQuickAddImage}
            activeOpacity={0.85}
            accessibilityLabel="Change cover photo"
          >
            <Image source={{ uri: mainImageUri }} style={styles.mainImage} resizeMode="cover" />
            <View style={styles.imageOverlay}>
              <MaterialCommunityIcons name="camera-plus-outline" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.addPhotoRow} onPress={handleQuickAddImage} activeOpacity={0.7}>
            <MaterialCommunityIcons name="camera-plus-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.addPhotoText}>Add a cover photo</Text>
          </TouchableOpacity>
        )}

        {/* Category + address (tap for directions) */}
        {(categoryName || place.address) ? (
          <View style={styles.infoBlock}>
            {categoryName ? (
              <View style={styles.categoryChip}>
                <MaterialCommunityIcons name="tag" size={14} color={theme.colors.primary} />
                <Text style={styles.categoryText}>{categoryName}</Text>
              </View>
            ) : null}
            {place.address ? (
              <TouchableOpacity style={styles.addressRow} onPress={openDirections} accessibilityRole="link" accessibilityLabel={`Directions to ${place.address}`}>
                <MaterialCommunityIcons name="map-marker-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.address} numberOfLines={2}>{place.address}</Text>
                <View style={styles.directionsPill}>
                  <MaterialCommunityIcons name="directions" size={14} color={theme.colors.primary} />
                  <Text style={styles.directionsText}>Directions</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

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
                      <Text style={styles.ratingText}>{toDisplayRating(displayRating, ratingScale).toFixed(1)}</Text>
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
          <Text style={styles.visitSummary}>
            {visits.length === 0
              ? 'Not visited yet'
              : `Visited ${visits.length === 1 ? 'once' : `${visits.length} times`} · last ${new Date(Math.max(...visits.map(v => v.createdAt))).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(Math.max(...visits.map(v => v.createdAt))).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}`}
          </Text>
          <GoogleRatingFootnote place={place} style={{ marginTop: 4 }} />
        </View>

        {/* Dishes */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.sectionHeader} onPress={() => setShowDishes(!showDishes)} activeOpacity={0.7}>
            <Text style={styles.sectionTitle}>Dishes{dishes.length ? ` (${dishes.length})` : ''}</Text>
            <MaterialCommunityIcons
              name={showDishes ? 'chevron-up' : 'chevron-down'}
              size={24}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
          {showDishes && (
            <View>
              {dishes.length === 0 ? (
                <Text style={styles.emptyText}>No dishes yet</Text>
              ) : (
                dishes.map(dish => (
                  <TouchableOpacity
                    key={dish.id}
                    style={styles.dishCard}
                    onPress={() => handleEditDish(dish)}
                    activeOpacity={0.7}
                  >
                    {dish.photoUri ? (
                      <Image source={{ uri: dish.photoUri }} style={styles.dishImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.dishImage, styles.dishImageEmpty]}>
                        <MaterialCommunityIcons name="silverware-fork-knife" size={24} color={theme.colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.dishContent}>
                      <View style={styles.dishHeader}>
                        <Text style={styles.dishName}>{dish.name}</Text>
                        <View style={styles.dishRatingContainer}>
                          {renderStars(dish.rating, false)}
                          <Text style={styles.dishRatingText}>{toDisplayRating(dish.rating, ratingScale).toFixed(1)}</Text>
                        </View>
                      </View>
                      {dish.notes ? <Text style={styles.dishNotes}>{dish.notes}</Text> : null}
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

        {/* Tags */}
        <View style={styles.section}>
          <TagManager placeId={placeId} onTagsChange={loadPlace} />
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TouchableOpacity onPress={handleEdit}>
              <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
          {place.notes ? (
            <Text style={styles.notes}>{place.notes}</Text>
          ) : (
            <TouchableOpacity onPress={handleEdit}>
              <Text style={styles.notesPlaceholder}>Tap to add notes</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Lists */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lists</Text>
          {lists.filter(l => !l.importedFrom).length === 0 ? (
            <Text style={styles.emptyText}>No lists yet. Create one in the Lists tab.</Text>
          ) : null}
          {lists.filter(l => !l.importedFrom).map(list => {
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
          <Text style={styles.sectionTitle}>Visits{visits.length ? ` (${visits.length})` : ''}</Text>
          {visits.length > 0 && (
            <>
              {visits.map(visit => (
                <TouchableOpacity
                  key={visit.id}
                  style={styles.visitCard}
                  onPress={() => handleEditVisit(visit)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.visitHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={styles.visitDate}>
                      {new Date(visit.createdAt).toLocaleDateString()}
                      {(() => {
                        const n = dishes.filter(d => d.visitId === visit.id).length;
                        return n ? `  ·  ${n} ${n === 1 ? 'dish' : 'dishes'}` : '';
                      })()}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleDeleteVisit(visit)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Delete visit"
                    >
                      <MaterialCommunityIcons name="delete-outline" size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  {visit.notes ? (
                    <Text style={styles.visitNotes}>{visit.notes}</Text>
                  ) : (
                    <Text style={styles.visitNotesPlaceholder}>Tap to add notes</Text>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
          {/* Check In Button */}
          <TouchableOpacity
            style={[styles.checkInButton, checkedInToday && styles.checkInButtonDone]}
            onPress={handleCheckIn}
            disabled={checkedInToday}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name={checkedInToday ? 'check-circle' : 'map-marker-check'} size={24} color="#FFFFFF" />
            <Text style={styles.checkInButtonText}>{checkedInToday ? 'Checked in today' : 'Check In'}</Text>
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
      <DishEditModal
        visible={showDishEditModal}
        dish={editingDish}
        visitId={visits.length > 0 ? visits[0].id : ''}
        onClose={() => {
          setShowDishEditModal(false);
          setEditingDish(null);
        }}
        onSave={handleSaveDish}
      />

      {/* Visit Edit Modal */}
      <VisitEditModal
        visible={showVisitEditModal}
        visit={editingVisit}
        onClose={() => {
          setShowVisitEditModal(false);
          setEditingVisit(null);
        }}
        onSave={handleSaveVisit}
      />
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    ...theme.shadow,
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
  visitSummary: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
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
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary + '15',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing.xs,
  },
  categoryText: {
    ...theme.typography.bodySmall,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  address: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  notes: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  notesPlaceholder: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
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
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  visitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
  visitNotesPlaceholder: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: theme.spacing.xs,
  },
  addPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    height: 56,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  addPhotoText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  infoBlock: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  directionsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary + '15',
  },
  directionsText: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  dishImageEmpty: {
    width: 56,
    height: 56,
    margin: 12,
    borderRadius: 28,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInButtonDone: {
    backgroundColor: '#2E7D32',
  },
  imageContainer: {
    width: '100%',
    height: 220,
    marginBottom: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.border,
  },
  imagePlaceholderText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: theme.borderRadius.full,
    padding: theme.spacing.sm,
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
  dishRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dishRatingText: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
    fontWeight: '600',
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
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingRight: theme.spacing.md,
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
