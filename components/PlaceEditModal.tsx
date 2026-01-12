import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  Image,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Place, Category } from '../types';
import { theme } from '../lib/theme';
import { getCategoriesByType } from '../lib/db';
import DraggableStarRating from './DraggableStarRating';

interface PlaceEditModalProps {
  visible: boolean;
  place: Place | null;
  onClose: () => void;
  onSave: (updates: { name: string; address: string; categoryId?: string; rating?: number; imageUri?: string; coverImageUri?: string; overallRatingManual?: number; ratingMode?: 'aggregate' | 'overall' }) => void;
}

export default function PlaceEditModal({ visible, place, onClose, onSave }: PlaceEditModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [ratingMode, setRatingMode] = useState<'aggregate' | 'overall'>('overall');
  const [overallRatingManual, setOverallRatingManual] = useState<number | undefined>(undefined);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (visible && place) {
      setName(place.name);
      setAddress(place.address || '');
      setCategoryId(place.categoryId);
      setRating(place.overallRating);
      setImageUri(place.coverImageUri); // Load cover image if exists
      setRatingMode(place.ratingMode || 'overall');
      setOverallRatingManual(place.overallRatingManual);
      loadCategories();
    }
  }, [visible, place]);

  const loadCategories = async () => {
    try {
      const placeCategories = await getCategoriesByType('place');
      setCategories(placeCategories);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handlePickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to upload images');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleTakePhoto = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions to take photos');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleImageSource = () => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        { text: 'Camera', onPress: handleTakePhoto },
        { text: 'Photo Library', onPress: handlePickImage },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const handleRemoveImage = () => {
    setImageUri(undefined);
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Place name is required');
      return;
    }
    onSave({
      name: name.trim(),
      address: address.trim(),
      categoryId,
      rating,
      imageUri,
      coverImageUri: imageUri, // Save as cover image
      ratingMode,
      overallRatingManual: ratingMode === 'overall' && rating ? rating : undefined,
    });
    onClose();
  };

  const selectedCategory = categories.find(c => c.id === categoryId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit Place</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Place name"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>

            {/* Address */}
            <View style={styles.field}>
              <Text style={styles.label}>Address</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Address"
                placeholderTextColor={theme.colors.textSecondary}
                multiline
              />
            </View>

            {/* Category */}
            <View style={styles.field}>
              <Text style={styles.label}>Category</Text>
              <TouchableOpacity
                style={styles.picker}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              >
                <Text style={[styles.pickerText, !selectedCategory && styles.placeholder]}>
                  {selectedCategory ? selectedCategory.name : 'Select category'}
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

            {/* Rating Mode Toggle */}
            <View style={styles.field}>
              <Text style={styles.label}>Rating Mode</Text>
              <View style={styles.ratingModeContainer}>
                <TouchableOpacity
                  style={[styles.ratingModeOption, ratingMode === 'overall' && styles.ratingModeOptionActive]}
                  onPress={() => setRatingMode('overall')}
                >
                  <MaterialCommunityIcons
                    name="star"
                    size={20}
                    color={ratingMode === 'overall' ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[styles.ratingModeOptionText, ratingMode === 'overall' && styles.ratingModeOptionTextActive]}>
                    Overall
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ratingModeOption, ratingMode === 'aggregate' && styles.ratingModeOptionActive]}
                  onPress={() => setRatingMode('aggregate')}
                >
                  <MaterialCommunityIcons
                    name="chart-line"
                    size={20}
                    color={ratingMode === 'aggregate' ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text style={[styles.ratingModeOptionText, ratingMode === 'aggregate' && styles.ratingModeOptionTextActive]}>
                    Aggregate
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.ratingModeHint}>
                {ratingMode === 'aggregate'
                  ? 'Rating will be calculated from average of dish ratings'
                  : 'Set a manual overall rating for this place'}
              </Text>
            </View>

            {/* Overall Rating (only shown when mode is 'overall') */}
            {ratingMode === 'overall' && (
              <View style={styles.field}>
                <Text style={styles.label}>Overall Rating</Text>
                <View style={styles.ratingContainer}>
                  <DraggableStarRating
                    rating={overallRatingManual || rating || 0}
                    onRatingChange={(newRating) => {
                      setRating(newRating);
                      setOverallRatingManual(newRating);
                    }}
                    size={32}
                    disabled={false}
                  />
                </View>
                {rating && (
                  <TouchableOpacity
                    onPress={() => {
                      setRating(undefined);
                      setOverallRatingManual(undefined);
                    }}
                    style={styles.clearRating}
                  >
                    <Text style={styles.clearRatingText}>Clear rating</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Image Upload */}
            <View style={styles.field}>
              <Text style={styles.label}>Image</Text>
              {imageUri ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={handleRemoveImage}
                  >
                    <MaterialCommunityIcons name="close-circle" size={24} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.imageUploadButton}
                  onPress={handleImageSource}
                >
                  <MaterialCommunityIcons name="image-plus" size={24} color={theme.colors.primary} />
                  <Text style={styles.imageUploadText}>Upload Image</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
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
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  content: {
    padding: theme.spacing.lg,
  },
  field: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    ...theme.typography.body,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  starButton: {
    padding: theme.spacing.xs,
  },
  clearRating: {
    marginTop: theme.spacing.sm,
    alignSelf: 'flex-start',
  },
  clearRatingText: {
    ...theme.typography.bodySmall,
    color: theme.colors.primary,
  },
  ratingModeContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  ratingModeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ratingModeOptionActive: {
    backgroundColor: theme.colors.primary + '15',
    borderColor: theme.colors.primary,
  },
  ratingModeOptionText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  ratingModeOptionTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  ratingModeHint: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
    fontStyle: 'italic',
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
  saveButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  saveButtonText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  imageUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    gap: theme.spacing.sm,
  },
  imageUploadText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
});
