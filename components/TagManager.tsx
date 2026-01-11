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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tag } from '../types';
import { theme } from '../lib/theme';
import { getAllTags, createTag, addTagToPlace, removeTagFromPlace, getTagsForPlace } from '../lib/db';

interface TagManagerProps {
  placeId: string;
  onTagsChange?: () => void;
}

export default function TagManager({ placeId, onTagsChange }: TagManagerProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [placeTags, setPlaceTags] = useState<Tag[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => {
    loadTags();
  }, [placeId]);

  const loadTags = async () => {
    try {
      const [all, place] = await Promise.all([
        getAllTags(),
        getTagsForPlace(placeId),
      ]);
      setAllTags(all);
      setPlaceTags(place);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  const handleToggleTag = async (tag: Tag) => {
    try {
      const isTagged = placeTags.some(t => t.id === tag.id);
      if (isTagged) {
        await removeTagFromPlace(placeId, tag.id);
      } else {
        await addTagToPlace(placeId, tag.id);
      }
      await loadTags();
      if (onTagsChange) onTagsChange();
    } catch (error) {
      console.error('Failed to toggle tag:', error);
      Alert.alert('Error', 'Failed to update tags');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      Alert.alert('Error', 'Tag name is required');
      return;
    }

    // Check for duplicate
    if (allTags.some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase())) {
      Alert.alert('Error', 'Tag with this name already exists');
      return;
    }

    try {
      await createTag(newTagName.trim());
      setNewTagName('');
      setShowAddModal(false);
      await loadTags();
    } catch (error) {
      console.error('Failed to create tag:', error);
      Alert.alert('Error', 'Failed to create tag');
    }
  };

  const getTagColor = (tag: Tag): string => {
    return tag.color || theme.colors.primary;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tags</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <MaterialCommunityIcons name="plus" size={18} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tagsContainer}>
        {allTags.length === 0 ? (
          <Text style={styles.emptyText}>No tags yet. Create one to get started.</Text>
        ) : (
          allTags.map(tag => {
            const isSelected = placeTags.some(t => t.id === tag.id);
            return (
              <TouchableOpacity
                key={tag.id}
                style={[
                  styles.tagChip,
                  isSelected && styles.tagChipSelected,
                  { borderColor: getTagColor(tag) },
                ]}
                onPress={() => handleToggleTag(tag)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tagText,
                    isSelected && { color: getTagColor(tag), fontWeight: '600' },
                  ]}
                >
                  {tag.name}
                </Text>
                {isSelected && (
                  <MaterialCommunityIcons
                    name="check"
                    size={16}
                    color={getTagColor(tag)}
                  />
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Create Tag Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Tag</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalContent}>
              <Text style={styles.modalLabel}>Tag Name</Text>
              <TextInput
                style={styles.modalInput}
                value={newTagName}
                onChangeText={setNewTagName}
                placeholder="Enter tag name"
                placeholderTextColor={theme.colors.textSecondary}
                autoFocus
              />
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowAddModal(false);
                  setNewTagName('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleCreateTag}
              >
                <Text style={styles.modalSaveText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  addButton: {
    padding: theme.spacing.xs,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  tagChipSelected: {
    backgroundColor: theme.colors.primary + '15',
  },
  tagText: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
  },
  emptyText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
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
