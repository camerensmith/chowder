import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { TILE_PROVIDERS, getTileProviderPreference, setTileProviderPreference, TileProvider } from '../lib/tileProviders';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function TileProviderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [selectedProvider, setSelectedProvider] = useState<string>('osm');

  useEffect(() => {
    loadProvider();
  }, []);

  const loadProvider = async () => {
    const providerId = await getTileProviderPreference();
    setSelectedProvider(providerId);
  };

  const handleSelectProvider = async (provider: TileProvider) => {
    await setTileProviderPreference(provider.id);
    setSelectedProvider(provider.id);
    // Navigate back after a short delay to show selection
    setTimeout(() => {
      navigation.goBack();
    }, 300);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tile Provider</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.description}>
          Choose a map style. All providers are free to use.
        </Text>

        {TILE_PROVIDERS.map((provider) => (
          <TouchableOpacity
            key={provider.id}
            style={[
              styles.providerItem,
              selectedProvider === provider.id && styles.providerItemSelected,
            ]}
            onPress={() => handleSelectProvider(provider)}
            activeOpacity={0.7}
          >
            <View style={styles.providerContent}>
              <Text style={styles.providerName}>{provider.name}</Text>
              {provider.description && (
                <Text style={styles.providerDescription}>{provider.description}</Text>
              )}
              <Text style={styles.providerAttribution}>{provider.attribution}</Text>
            </View>
            {selectedProvider === provider.id && (
              <MaterialCommunityIcons
                name="check-circle"
                size={24}
                color={theme.colors.primary}
              />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  placeholder: {
    width: 24,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  providerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  providerItemSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  providerContent: {
    flex: 1,
  },
  providerName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  providerDescription: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  providerAttribution: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
});
