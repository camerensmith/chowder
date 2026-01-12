import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { getAllLists, createList, deleteList } from '../lib/db';
import { List } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ListsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [lists, setLists] = useState<List[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const swipeableRefs = useRef<{ [key: string]: any }>({});

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      const allLists = await getAllLists();
      setLists(allLists);
    } catch (error) {
      console.error('Failed to load lists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateList = async () => {
    // TODO: Show create list modal
    try {
      const newList = await createList('New List');
      await loadLists();
      navigation.navigate('ListDetail', { listId: newList.id });
    } catch (error) {
      console.error('Failed to create list:', error);
    }
  };

  const handleDeleteList = (list: List) => {
    // Close the swipeable if it's open
    if (swipeableRefs.current[list.id]) {
      swipeableRefs.current[list.id].close();
    }
    
    Alert.alert(
      'Delete List',
      `Are you sure you want to delete "${list.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteList(list.id);
              await loadLists();
            } catch (error) {
              console.error('Failed to delete list:', error);
              Alert.alert('Error', `Failed to delete list: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  const renderStarRating = (rating?: number) => {
    if (!rating) return null;
    return (
      <View style={styles.ratingContainer}>
        <MaterialCommunityIcons name="star" size={14} color={theme.colors.star} />
        <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
      </View>
    );
  };

  const renderListCard = ({ item }: { item: List }) => {
    const subtitle = [item.category, item.city].filter(Boolean).join(', ') || 'Places, Favors & rares';
    
    const renderRightActions = (progress: any, dragX: any) => {
      return (
        <TouchableOpacity
          style={styles.deleteAction}
          onPress={() => {
            handleDeleteList(item);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.deleteActionContent}>
            <MaterialCommunityIcons name="delete" size={24} color="#FFFFFF" />
            <Text style={styles.deleteActionText}>Delete</Text>
          </View>
        </TouchableOpacity>
      );
    };
    
    return (
      <Swipeable
        ref={(ref) => {
          if (ref) {
            swipeableRefs.current[item.id] = ref;
          } else {
            delete swipeableRefs.current[item.id];
          }
        }}
        renderRightActions={renderRightActions}
      >
        <TouchableOpacity
          style={styles.listCard}
          onPress={() => navigation.navigate('ListDetail', { listId: item.id })}
          activeOpacity={0.7}
        >
          <View style={styles.listInfo}>
            <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.listSubtitle} numberOfLines={1}>{subtitle}</Text>
            {renderStarRating(item.overallRating)}
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={loadLists}>
          <MaterialCommunityIcons name="refresh" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <TouchableOpacity onPress={handleCreateList}>
          <View style={styles.addButton}>
            <MaterialCommunityIcons name="plus" size={28} color={theme.colors.onSecondary} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>Lists</Text>
      </View>

      {/* Lists */}
      {lists.length === 0 && !isLoading ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="clipboard-list" size={48} color={theme.colors.border} />
          <Text style={styles.emptyText}>No lists yet</Text>
          <Text style={styles.emptySubtext}>Create your first list to get started</Text>
        </View>
      ) : (
        <FlatList
          data={lists}
          renderItem={renderListCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={isLoading}
          onRefresh={loadLists}
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
  titleContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    ...theme.shadow,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  listSubtitle: {
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
    ...theme.typography.h3,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
  },
  emptySubtext: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: theme.spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  deleteActionContent: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    width: 100,
  },
  deleteActionContent: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.xs,
  },
  deleteActionText: {
    ...theme.typography.bodySmall,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
