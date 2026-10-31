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
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Place, Category } from '../types';
import { theme } from '../lib/theme';
import { getCategoriesByType, PlaceUpdates } from '../lib/db';
import DraggableStarRating from './DraggableStarRating';
import { pickImage } from '../lib/imageStorage';
import { getRatingScalePreference, toDisplayRating, toInternalRating, RatingScale } from '../lib/ratingScale';

interface PlaceEditModalProps {
  visible: boolean;
  place: Place | null;
  onClose: () => void;
  onSave: (updates: PlaceUpdates) => void;
}

export default function PlaceEditModal({ visible, place, onClose, onSave }: PlaceEditModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);
  const [ratingMode, setRatingMode] = useState<'aggregate' | 'overall'>('overall');
  // Always stored on the internal 0–5 scale; converted only for display.
  const [overallRatingManual, setOverallRatingManual] = useState<number | undefined>(undefined);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [ratingScale, setRatingScale] = useState<RatingScale>(5);

  useEffect(() => {
    if (visible && place) {
      setName(place.name);
      setAddress(place.address || '');
      setCategoryId(place.categoryId);
      setNotes(place.notes || '');
      setImageUri(place.coverImageUri);
      setRatingMode(place.ratingMode || 'overall');
      setOverallRatingManual(place.overallRatingManual);
      setShowCategoryPicker(false);
      loadCategories();
      getRatingScalePreference().then(setRatingScale);
    }
  }, [visible, place]);

  const loadCategories = async () => {
    try {
      setCategories(await getCategoriesByType('place'));
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleImageSource = async () => {
    const uri = await pickImage();
    if (uri) setImageUri(uri);
  };

  const handleRemoveImage = () => {
    setImageUri(undefined);
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this place.');
      return;
    }
    onSave({
      name: name.trim(),
      address: address.trim() || undefined,
      categoryId,
      notes: notes.trim() || undefined,
      coverImageUri: imageUri,
      ratingMode,
      // Keep the manual rating even in aggregate mode so switching back restores it.
      overallRatingManual,
    });
    onClose();
  };

  const selectedCategory = categories.find(c => c.id === categoryId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit Place</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.content}>
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

            {/* Notes */}
            <View style={styles.field}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="What's good here? Anything to remember?"
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
                  <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
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
                  </ScrollView>
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
                    rating={toDisplayRating(overallRatingManual ?? 0, ratingScale)}
                    onRatingChange={(newRating) => {
                      setOverallRatingManual(newRating > 0 ? toInternalRating(newRating, ratingScale) : undefined);
                    }}
                    size={32}
                    disabled={false}
                    maxRating={ratingScale}
                  />
                </View>
                {overallRatingManual ? (
                  <TouchableOpacity onPress={() => setOverallRatingManual(undefined)} style={styles.clearRating}>
                    <Text style={styles.clearRatingText}>Clear rating</Text>
                  </TouchableOpacity>
                ) : null}
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
      </KeyboardAvoidingView>
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
