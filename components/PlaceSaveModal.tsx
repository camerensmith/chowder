import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { reverseGeocode } from '../lib/maps';
import { getCategoriesByType } from '../lib/db';
import { Category } from '../types';

interface PlaceSaveModalProps {
  visible: boolean;
  latitude: number;
  longitude: number;
  onClose: () => void;
  onSave: (name: string, address?: string, categoryId?: string, notes?: string) => void;
  initialName?: string;
  initialAddress?: string;
}

export default function PlaceSaveModal({ visible, latitude, longitude, onClose, onSave, initialName, initialAddress }: PlaceSaveModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName || '');
      setAddress(initialAddress || null);
      setCategoryId(undefined);
      setNotes('');
      setShowCategoryPicker(false);
      // Only load address if not provided
      if (!initialAddress) {
        loadAddress();
      }
      loadCategories();
    }
  }, [visible, latitude, longitude, initialName, initialAddress]);

  const loadAddress = async () => {
    setIsLoadingAddress(true);
    try {
      const addr = await reverseGeocode(latitude, longitude);
      setAddress(addr);
    } catch (error) {
      console.error('Failed to load address:', error);
    } finally {
      setIsLoadingAddress(false);
    }
  };

  const loadCategories = async () => {
    try {
      const placeCategories = await getCategoriesByType('place');
      setCategories(placeCategories);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a place name');
      return;
    }
    onSave(name.trim(), address || undefined, categoryId, notes.trim() || undefined);
    setName('');
    setAddress(null);
    setCategoryId(undefined);
    setNotes('');
  };

  const selectedCategory = categories.find(c => c.id === categoryId);

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
          <Text style={styles.headerTitle}>Save Place</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Place Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter place name"
              placeholderTextColor={theme.colors.textSecondary}
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Address</Text>
            {isLoadingAddress ? (
              <View style={styles.addressLoading}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Loading address...</Text>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="Address will be auto-filled"
                placeholderTextColor={theme.colors.textSecondary}
                value={address || ''}
                onChangeText={setAddress}
                multiline
              />
            )}
          </View>

          {/* Category */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Category</Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              <Text style={[styles.pickerText, !selectedCategory && styles.placeholder]}>
                {selectedCategory ? selectedCategory.name : 'Select category (optional)'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            {showCategoryPicker && (
              <View style={styles.categoryList}>
                <TouchableOpacity
                  style={styles.categoryOption}
                  onPress={() => {
                    setCategoryId(undefined);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={styles.categoryOptionText}>None</Text>
                </TouchableOpacity>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.categoryOption}
                    onPress={() => {
                      setCategoryId(cat.id);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text style={styles.categoryOptionText}>{cat.name}</Text>
                    {categoryId === cat.id && (
                      <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Add notes (optional)"
              placeholderTextColor={theme.colors.textSecondary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.coordsContainer}>
            <MaterialCommunityIcons name="map-marker" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.coordsText}>
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </Text>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>
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
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    ...theme.typography.labelMedium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    ...theme.typography.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addressLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  coordsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
  },
  coordsText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
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
  cancelText: {
    ...theme.typography.labelLarge,
    color: theme.colors.text,
  },
  saveButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  saveText: {
    ...theme.typography.labelLarge,
    color: theme.colors.onPrimary,
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pickerText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  placeholder: {
    color: theme.colors.textSecondary,
  },
  categoryList: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxHeight: 200,
  },
  categoryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  categoryOptionText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
