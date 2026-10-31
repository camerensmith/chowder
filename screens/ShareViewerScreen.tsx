import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { RootStackParamList, SharePayload } from '../types';
import { theme } from '../lib/theme';
import { parseShareCode } from '../lib/sharing';
import { createList, addPlaceToList, createPlace, getAllPlaces, getImportedFriendLists, deleteList, getAllCategories } from '../lib/db';
import { Place } from '../types';

/** ~50 m: treat a shared place as the same one you already have. */
function findExistingPlace(places: Place[], name: string, lat: number, lng: number): Place | undefined {
  const norm = (s: string) => s.trim().toLowerCase();
  return places.find(p => norm(p.name) === norm(name) && Math.abs(p.latitude - lat) < 0.0005 && Math.abs(p.longitude - lng) < 0.0005);
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'ShareViewer'>;

export default function ShareViewerScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavigationProp>();
  const { code, friendName } = route.params || {};
  const [shareCode, setShareCode] = useState(code || '');
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(!code);

  useEffect(() => {
    if (code) {
      handleParseCode(code);
    }
  }, [code]);

  const handleParseCode = async (codeToParse: string) => {
    if (!codeToParse.trim()) {
      Alert.alert('Error', 'Please enter a share code');
      return;
    }

    try {
      setIsLoading(true);
      const parsed = parseShareCode(codeToParse.trim());
      setPayload(parsed);
      setShowCodeInput(false);
    } catch (error: any) {
      Alert.alert('Invalid Code', error?.message || 'This share code is not valid.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!payload || isImporting) return;

    try {
      setIsImporting(true);
      const listName = `${payload.title} (from ${payload.authorName})`;

      const [existingPlaces, categories, friendLists] = await Promise.all([
        getAllPlaces(),
        getAllCategories(),
        getImportedFriendLists(),
      ]);
      const categoryIdByName = new Map(
        categories.filter(c => c.type === 'place').map(c => [c.name.toLowerCase(), c.id])
      );

      const newList = await createList(listName, `Imported from ${payload.authorName}`, undefined, undefined, payload.authorName, Date.now());

      // Reuse places you already have instead of creating duplicate pins.
      let added = 0;
      for (const shared of payload.places) {
        let place = findExistingPlace(existingPlaces, shared.name, shared.lat, shared.lng);
        if (!place) {
          const categoryId = shared.category ? categoryIdByName.get(shared.category.toLowerCase()) : undefined;
          place = await createPlace(shared.name, shared.lat, shared.lng, shared.address, categoryId);
          existingPlaces.push(place);
        }
        await addPlaceToList(newList.id, place.id);
        added++;
      }

      // Replace the previous import of this same list from this same friend.
      for (const old of friendLists.filter(l => l.importedFrom === payload.authorName && l.name === listName)) {
        await deleteList(old.id);
      }

      Alert.alert('Imported!', `Saved "${newList.name}" with ${added} ${added === 1 ? 'place' : 'places'}.`, [
        { text: 'View List', onPress: () => navigation.replace('ListDetail', { listId: newList.id }) },
      ]);
    } catch (error: any) {
      console.error('Failed to import list:', error);
      Alert.alert('Import failed', error?.message || 'Could not import this list.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>View Share</Text>
        <View style={{ width: 24 }} />
      </View>

      {!payload && showCodeInput ? (
        <View style={styles.content}>
          <MaterialCommunityIcons
            name="share-variant"
            size={64}
            color={theme.colors.primary}
          />
          <Text style={styles.prompt}>
            {friendName ? `Re-import ${friendName}'s list` : 'Have a share code?'}
          </Text>
          <Text style={styles.subtitle}>
            {friendName
              ? `Paste the new share code from ${friendName}. Their existing list will be replaced.`
              : 'Enter the code sent to you to view and import the list'}
          </Text>

          <TextInput
            style={styles.codeInput}
            placeholder="Enter share code..."
            placeholderTextColor={theme.colors.textSecondary}
            value={shareCode}
            onChangeText={setShareCode}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, (!shareCode.trim() || isLoading) && styles.buttonDisabled]}
            onPress={() => handleParseCode(shareCode)}
            disabled={!shareCode.trim() || isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Loading...' : 'View List'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {payload ? (
        <View style={styles.content}>
          <View style={styles.previewHeader}>
            <Text style={styles.authorText}>
              {payload.authorName} sent you a recommendation
            </Text>
            <Text style={styles.payloadTitle}>{payload.title}</Text>
            <Text style={styles.payloadCount}>
              {payload.places.length} {payload.places.length === 1 ? 'place' : 'places'}
            </Text>
          </View>

          <FlatList
            data={payload.places}
            style={{ alignSelf: 'stretch' }}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.placeCard}>
                <Text style={styles.placeName}>{item.name}</Text>
                {item.address ? (
                  <Text style={styles.placeAddress}>{item.address}</Text>
                ) : null}
              </View>
            )}
          />

          <TouchableOpacity
            style={[styles.importButton, isImporting && styles.buttonDisabled]}
            onPress={handleImport}
            disabled={isImporting}
          >
            <MaterialCommunityIcons name="download" size={20} color={theme.colors.background} />
            <Text style={styles.importButtonText}>
              {isImporting ? 'Importing...' : 'Save to My Lists'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  prompt: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    textAlign: 'center',
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
  codeInput: {
    width: '100%',
    ...theme.typography.body,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    fontFamily: 'monospace',
  },
  button: {
    width: '100%',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: theme.colors.border,
  },
  buttonText: {
    ...theme.typography.body,
    color: theme.colors.background,
    fontWeight: '600',
  },
  previewHeader: {
    width: '100%',
    marginBottom: theme.spacing.xl,
  },
  authorText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  payloadTitle: {
    ...theme.typography.h2,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  payloadCount: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  placeCard: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
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
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.xl,
  },
  importButtonText: {
    ...theme.typography.body,
    color: theme.colors.background,
    fontWeight: '600',
    marginLeft: theme.spacing.sm,
  },
});
