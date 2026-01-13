import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import {
  getCategoriesByType,
  createCategory,
  deleteCategory,
  updateCategoryOrder,
  initializeDefaultCategories,
} from '../lib/db';
import { Category } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CategoryManagementScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const placeCategories = await getCategoriesByType('place');
      setCategories(placeCategories);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Error', 'Category name is required');
      return;
    }

    // Check for duplicate
    if (categories.some(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
      Alert.alert('Error', 'Category with this name already exists');
      return;
    }

    try {
      const maxOrder = categories.length > 0
        ? Math.max(...categories.map(c => c.order ?? 0))
        : -1;
      await createCategory(newCategoryName.trim(), 'place', undefined, maxOrder + 1);
      setNewCategoryName('');
      setShowAddModal(false);
      await loadCategories();
    } catch (error) {
      console.error('Failed to add category:', error);
      Alert.alert('Error', 'Failed to add category');
    }
  };

  const handleDeleteCategory = (category: Category) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(category.id);
              await loadCategories();
            } catch (error) {
              console.error('Failed to delete category:', error);
              Alert.alert('Error', 'Failed to delete category');
            }
          },
        },
      ]
    );
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    try {
      const category = categories[index];
      const prevCategory = categories[index - 1];
      
      // Swap orders
      await updateCategoryOrder(category.id, prevCategory.order ?? index - 1);
      await updateCategoryOrder(prevCategory.id, category.order ?? index);
      
      await loadCategories();
    } catch (error) {
      console.error('Failed to reorder category:', error);
      Alert.alert('Error', 'Failed to reorder category');
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === categories.length - 1) return;
    try {
      const category = categories[index];
      const nextCategory = categories[index + 1];
      
      // Swap orders
      await updateCategoryOrder(category.id, nextCategory.order ?? index + 1);
      await updateCategoryOrder(nextCategory.id, category.order ?? index);
      
      await loadCategories();
    } catch (error) {
      console.error('Failed to reorder category:', error);
      Alert.alert('Error', 'Failed to reorder category');
    }
  };

  const handleRestoreDefaults = () => {
    Alert.alert(
      'Restore Default Categories',
      'This will add back any missing default categories. Existing categories will not be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              await initializeDefaultCategories();
              await loadCategories();
              Alert.alert('Success', 'Default categories restored');
            } catch (error) {
              console.error('Failed to restore default categories:', error);
              Alert.alert('Error', 'Failed to restore default categories');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Categories</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)}>
          <MaterialCommunityIcons name="plus" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestoreDefaults}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="restore" size={20} color={theme.colors.primary} />
          <Text style={styles.restoreButtonText}>Restore Default Categories</Text>
        </TouchableOpacity>

        {categories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No categories yet</Text>
          </View>
        ) : (
          categories.map((category, index) => (
            <View key={category.id} style={styles.categoryItem}>
              <View style={styles.categoryContent}>
                <MaterialCommunityIcons
                  name="drag"
                  size={20}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.categoryName}>{category.name}</Text>
              </View>
              <View style={styles.categoryActions}>
                <TouchableOpacity
                  style={styles.moveButton}
                  onPress={() => handleMoveUp(index)}
                  disabled={index === 0}
                >
                  <MaterialCommunityIcons
                    name="chevron-up"
                    size={20}
                    color={index === 0 ? theme.colors.border : theme.colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.moveButton}
                  onPress={() => handleMoveDown(index)}
                  disabled={index === categories.length - 1}
                >
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={20}
                    color={index === categories.length - 1 ? theme.colors.border : theme.colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteCategory(category)}
                >
                  <MaterialCommunityIcons
                    name="delete-outline"
                    size={20}
                    color={theme.colors.error}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Category Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Category</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalContent}>
              <Text style={styles.modalLabel}>Category Name</Text>
              <TextInput
                style={styles.modalInput}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="Enter category name"
                placeholderTextColor={theme.colors.textSecondary}
                autoFocus
              />
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowAddModal(false);
                  setNewCategoryName('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleAddCategory}
              >
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
    ...theme.shadow,
  },
  restoreButtonText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
    marginLeft: theme.spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
  },
  categoryName: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  categoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  moveButton: {
    padding: theme.spacing.xs,
  },
  deleteButton: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  modalContent: {
    padding: theme.spacing.lg,
  },
  modalLabel: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  modalInput: {
    ...theme.typography.body,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  modalCancelText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  modalSaveButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  modalSaveText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
