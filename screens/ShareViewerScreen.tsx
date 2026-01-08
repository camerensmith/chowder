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
import { parseShareCode, storeShareCode } from '../lib/sharing';
import { getAuthor, createList, addPlaceToList, createPlace } from '../lib/db';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'ShareViewer'>;

export default function ShareViewerScreen() {
  const route = useRoute<RoutePropType>();
  const navigation = useNavigation<NavigationProp>();
  const { code } = route.params || {};
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
    } catch (error) {
      console.error('Failed to parse code:', error);
      Alert.alert('Invalid Code', 'This share code is not valid or is corrupted');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!payload) return;

    try {
      setIsImporting(true);
      const author = await getAuthor();
      const authorName = author?.displayName || 'Someone';

      // Create new list
      const newList = await createList(
        `${payload.title} (from ${payload.authorName})`,
        `Imported from ${payload.authorName}`
      );

      // Add all places to the database and then to the list
      for (const placeData of payload.places) {
        try {
          const place = await createPlace(
            placeData.name,
            placeData.lat,
            placeData.lng,
            placeData.address
          );
          await addPlaceToList(newList.id, place.id);
        } catch (error) {
          console.error(`Failed to add place ${placeData.name}:`, error);
        }
      }

      Alert.alert(
        'Imported!',
        `Successfully imported "${newList.name}" with ${payload.places.length} places`,
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.navigate('Main');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Failed to import list:', error);
      Alert.alert('Error', 'Failed to import list');
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
          <Text style={styles.prompt}>Have a share code?</Text>
          <Text style={styles.subtitle}>
            Enter the code sent to you to view and import the list
          </Text>

          <TextInput
            style={styles.codeInput}
            placeholder="Enter share code..."
            placeholderTextColor={theme.colors.textSecondary}
            value={shareCode}
            onChangeText={setShareCode}
            autoCapitalize="characters"
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
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.placeCard}>
                <Text style={styles.placeName}>{item.name}</Text>
                {item.address && (
                  <Text style={styles.placeAddress}>{item.address}</Text>
                )}
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
