import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
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
import { getList, getListItems, getAllPlaces } from '../lib/db';
import { List, Place } from '../types';
import ShareCodeGenerator from '../components/ShareCodeGenerator';

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

  useEffect(() => {
    loadList();
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
              <Text style={styles.ratingText}>{item.overallRating.toFixed(1)}</Text>
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
        <Text style={styles.headerTitle} numberOfLines={1}>{list.name}</Text>
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

      {/* Share Modal */}
      {showShareModal && (
        <ShareCodeGenerator
          listId={listId}
          onClose={() => setShowShareModal(false)}
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
});
