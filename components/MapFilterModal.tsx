import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Category, Tag, List } from '../types';
import { theme } from '../lib/theme';
import {
  getAllTags,
  getCategoriesByType,
  getAllLists,
} from '../lib/db';

export interface MapFilters {
  categoryIds: string[];
  tagIds: string[];
  listIds: string[];
  minRating?: number;
  maxRating?: number;
  exactRating?: number;
  ratingFilterType: 'none' | 'min' | 'max' | 'exact' | 'range';
  searchText?: string;
}

interface MapFilterModalProps {
  visible: boolean;
  filters: MapFilters;
  onClose: () => void;
  onApply: (filters: MapFilters) => void;
}

export default function MapFilterModal({ visible, filters, onClose, onApply }: MapFilterModalProps) {
  const [localFilters, setLocalFilters] = useState<MapFilters>(filters);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [ratingInput, setRatingInput] = useState('');
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
      setSearchText(filters.searchText || '');
      loadFilterData();
      // Set rating input based on current filter
      if (filters.exactRating !== undefined) {
        setRatingInput(filters.exactRating.toString());
      } else if (filters.minRating !== undefined) {
        setRatingInput(filters.minRating.toString());
      } else {
        setRatingInput('');
      }
    }
  }, [visible, filters]);

  const loadFilterData = async () => {
    try {
      const [cats, allTags, allLists] = await Promise.all([
        getCategoriesByType('place'),
        getAllTags(),
        getAllLists(),
      ]);
      setCategories(cats);
      setTags(allTags);
      setLists(allLists);
    } catch (error) {
      console.error('Failed to load filter data:', error);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setLocalFilters(prev => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(categoryId)
        ? prev.categoryIds.filter(id => id !== categoryId)
        : [...prev.categoryIds, categoryId],
    }));
  };

  const toggleTag = (tagId: string) => {
    setLocalFilters(prev => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter(id => id !== tagId)
        : [...prev.tagIds, tagId],
    }));
  };

  const toggleList = (listId: string) => {
    setLocalFilters(prev => ({
      ...prev,
      listIds: prev.listIds.includes(listId)
        ? prev.listIds.filter(id => id !== listId)
        : [...prev.listIds, listId],
    }));
  };

  const handleRatingFilterChange = (type: MapFilters['ratingFilterType']) => {
    setLocalFilters(prev => ({
      ...prev,
      ratingFilterType: type,
      minRating: type === 'min' || type === 'range' ? prev.minRating : undefined,
      maxRating: type === 'max' || type === 'range' ? prev.maxRating : undefined,
      exactRating: type === 'exact' ? prev.exactRating : undefined,
    }));
  };

  const handleRatingInputChange = (value: string) => {
    setRatingInput(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 5) {
      const { ratingFilterType } = localFilters;
      if (ratingFilterType === 'exact') {
        setLocalFilters(prev => ({ ...prev, exactRating: numValue }));
      } else if (ratingFilterType === 'min') {
        setLocalFilters(prev => ({ ...prev, minRating: numValue }));
      } else if (ratingFilterType === 'max') {
        setLocalFilters(prev => ({ ...prev, maxRating: numValue }));
      }
    }
  };

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
    setLocalFilters(prev => ({ ...prev, searchText: text.trim() || undefined }));
  };

  const handleClear = () => {
    const emptyFilters: MapFilters = {
      categoryIds: [],
      tagIds: [],
      listIds: [],
      ratingFilterType: 'none',
      searchText: undefined,
    };
    setLocalFilters(emptyFilters);
    setRatingInput('');
    setSearchText('');
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (localFilters.categoryIds.length > 0) count++;
    if (localFilters.tagIds.length > 0) count++;
    if (localFilters.listIds.length > 0) count++;
    if (localFilters.ratingFilterType !== 'none') count++;
    if (localFilters.searchText && localFilters.searchText.trim().length > 0) count++;
    return count;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Filter Places</Text>
            <View style={styles.headerRight}>
              {getActiveFilterCount() > 0 && (
                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.content}>
            {/* Text Search */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Search</Text>
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={handleSearchTextChange}
                placeholder="Search by name, address, or notes..."
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Categories */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Categories</Text>
              <View style={styles.chipContainer}>
                {categories.map(cat => {
                  const isSelected = localFilters.categoryIds.includes(cat.id);
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => toggleCategory(cat.id)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Tags */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.chipContainer}>
                {tags.map(tag => {
                  const isSelected = localFilters.tagIds.includes(tag.id);
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => toggleTag(tag.id)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {tag.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Lists */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lists</Text>
              <View style={styles.chipContainer}>
                {lists.map(list => {
                  const isSelected = localFilters.listIds.includes(list.id);
                  return (
                    <TouchableOpacity
                      key={list.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => toggleList(list.id)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {list.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Rating Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Rating</Text>
              <View style={styles.ratingFilterContainer}>
                <View style={styles.ratingTypeButtons}>
                  <TouchableOpacity
                    style={[
                      styles.ratingTypeButton,
                      localFilters.ratingFilterType === 'none' && styles.ratingTypeButtonActive,
                    ]}
                    onPress={() => handleRatingFilterChange('none')}
                  >
                    <Text
                      style={[
                        styles.ratingTypeButtonText,
                        localFilters.ratingFilterType === 'none' && styles.ratingTypeButtonTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.ratingTypeButton,
                      localFilters.ratingFilterType === 'min' && styles.ratingTypeButtonActive,
                    ]}
                    onPress={() => handleRatingFilterChange('min')}
                  >
                    <Text
                      style={[
                        styles.ratingTypeButtonText,
                        localFilters.ratingFilterType === 'min' && styles.ratingTypeButtonTextActive,
                      ]}
                    >
                      ≥ Min
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.ratingTypeButton,
                      localFilters.ratingFilterType === 'max' && styles.ratingTypeButtonActive,
                    ]}
                    onPress={() => handleRatingFilterChange('max')}
                  >
                    <Text
                      style={[
                        styles.ratingTypeButtonText,
                        localFilters.ratingFilterType === 'max' && styles.ratingTypeButtonTextActive,
                      ]}
                    >
                      ≤ Max
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.ratingTypeButton,
                      localFilters.ratingFilterType === 'exact' && styles.ratingTypeButtonActive,
                    ]}
                    onPress={() => handleRatingFilterChange('exact')}
                  >
                    <Text
                      style={[
                        styles.ratingTypeButtonText,
                        localFilters.ratingFilterType === 'exact' && styles.ratingTypeButtonTextActive,
                      ]}
                    >
                      =
                    </Text>
                  </TouchableOpacity>
                </View>
                {localFilters.ratingFilterType !== 'none' && (
                  <View style={styles.ratingInputContainer}>
                    <TextInput
                      style={styles.ratingInput}
                      value={ratingInput}
                      onChangeText={handleRatingInputChange}
                      placeholder="0.0 - 5.0"
                      placeholderTextColor={theme.colors.textSecondary}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.ratingInputLabel}>stars</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyButtonText}>
                Apply {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
              </Text>
            </TouchableOpacity>
          </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  clearButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  clearButtonText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  content: {
    padding: theme.spacing.lg,
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
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  ratingFilterContainer: {
    gap: theme.spacing.md,
  },
  ratingTypeButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  ratingTypeButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  ratingTypeButtonActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  ratingTypeButtonText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  ratingTypeButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  ratingInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  ratingInput: {
    flex: 1,
    ...theme.typography.body,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ratingInputLabel: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  searchInput: {
    ...theme.typography.body,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  footer: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  cancelButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  applyButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
