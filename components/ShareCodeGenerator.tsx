// Component to generate and display share codes for lists

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { generateShareCode, storeShareCode } from '../lib/sharing';
import { SharePayload } from '../types';
import { getAuthor, getList, getListItems, getAllPlaces } from '../lib/db';
import * as Clipboard from 'expo-clipboard';

interface ShareCodeGeneratorProps {
  listId: string;
  onClose: () => void;
}

export default function ShareCodeGenerator({ listId, onClose }: ShareCodeGeneratorProps) {
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      const [list, author] = await Promise.all([
        getList(listId),
        getAuthor(),
      ]);

      if (!list) {
        Alert.alert('Error', 'List not found');
        return;
      }

      const items = await getListItems(listId);
      const allPlaces = await getAllPlaces();
      const listPlaces = items
        .map(item => allPlaces.find(p => p.id === item.placeId))
        .filter(Boolean);

      const payload: SharePayload = {
        type: 'list',
        title: list.name,
        authorName: author?.displayName || 'Someone',
        places: listPlaces.map(place => ({
          id: place.id,
          name: place.name,
          address: place.address,
          lat: place.latitude,
          lng: place.longitude,
          category: place.categoryId,
        })),
      };

      const code = generateShareCode(payload);
      storeShareCode(code, payload);
      setShareCode(code);
    } catch (error) {
      console.error('Failed to generate share code:', error);
      Alert.alert('Error', 'Failed to generate share code');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (shareCode) {
      await Clipboard.setStringAsync(shareCode);
      Alert.alert('Copied!', 'Share code copied to clipboard');
    }
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Share List</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {!shareCode ? (
            <View style={styles.content}>
              <MaterialCommunityIcons
                name="share-variant"
                size={64}
                color={theme.colors.primary}
              />
              <Text style={styles.description}>
                Generate a share code that others can use to import this list
              </Text>
              <TouchableOpacity
                style={[styles.button, isGenerating && styles.buttonDisabled]}
                onPress={handleGenerate}
                disabled={isGenerating}
              >
                <Text style={styles.buttonText}>
                  {isGenerating ? 'Generating...' : 'Generate Share Code'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.content}>
              <MaterialCommunityIcons
                name="check-circle"
                size={64}
                color={theme.colors.primary}
              />
              <Text style={styles.successText}>Share Code Generated!</Text>
              <View style={styles.codeContainer}>
                <Text style={styles.codeText} selectable>{shareCode}</Text>
              </View>
              <TouchableOpacity style={styles.button} onPress={handleCopy}>
                <MaterialCommunityIcons name="content-copy" size={20} color={theme.colors.background} />
                <Text style={styles.buttonText}>Copy Code</Text>
              </TouchableOpacity>
              <Text style={styles.instructions}>
                Share this code with others. They can import it from Settings → Import List via Share Code
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    width: '90%',
    maxWidth: 400,
    padding: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.text,
  },
  content: {
    alignItems: 'center',
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.border,
  },
  buttonText: {
    ...theme.typography.body,
    color: theme.colors.background,
    fontWeight: '600',
    marginLeft: theme.spacing.sm,
  },
  successText: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  codeContainer: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  codeText: {
    ...theme.typography.body,
    fontFamily: 'monospace',
    color: theme.colors.text,
    textAlign: 'center',
  },
  instructions: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
});
