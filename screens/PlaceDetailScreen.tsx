import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { getPlace, getVisitsForPlace, getAllLists, addPlaceToList, removePlaceFromList, getListItems } from '../lib/db';
import { Place, List, Visit } from '../types';

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
  const [isLoading, setIsLoading] = useState(true);

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

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[...Array(5)].map((_, i) => (
          <MaterialCommunityIcons
            key={i}
            name={i < Math.round(rating) ? 'star' : 'star-outline'}
            size={20}
            color={i < Math.round(rating) ? theme.colors.star : theme.colors.starEmpty}
          />
        ))}
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
        <TouchableOpacity>
          <MaterialCommunityIcons name="dots-vertical" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Rating */}
        {place.overallRating && (
          <View style={styles.ratingSection}>
            {renderStars(place.overallRating)}
            <Text style={styles.ratingText}>{place.overallRating.toFixed(1)}</Text>
            <Text style={styles.visitCount}>({visits.length} {visits.length === 1 ? 'visit' : 'visits'})</Text>
          </View>
        )}

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
        {visits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visits</Text>
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
          </View>
        )}
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  starsContainer: {
    flexDirection: 'row',
    marginRight: theme.spacing.sm,
  },
  ratingText: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  visitCount: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
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
});
