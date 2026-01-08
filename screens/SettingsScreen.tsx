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
import { getAuthor } from '../lib/db';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [author, setAuthor] = useState<any>(null);

  useEffect(() => {
    loadAuthor();
  }, []);

  const loadAuthor = async () => {
    const authorData = await getAuthor();
    setAuthor(authorData);
  };

  const handleImportShare = () => {
    navigation.navigate('ShareViewer', {});
  };

  const handleExportData = async () => {
    // TODO: Implement export
    console.log('Export data');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Main')}>
          <MaterialCommunityIcons name="home" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons name="bowl" size={24} color={theme.colors.primary} />
          <MaterialCommunityIcons name="silverware-fork-knife" size={16} color={theme.colors.secondary} style={styles.spoon} />
        </View>
        <TouchableOpacity>
          <View style={styles.addButton}>
            <MaterialCommunityIcons name="plus" size={20} color={theme.colors.background} />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile Section */}
        {author && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile</Text>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Display Name</Text>
              <Text style={styles.settingValue}>{author.displayName}</Text>
            </View>
          </View>
        )}

        {/* Settings Options */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <Text style={styles.settingLabel}>Tile Provider</Text>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>OpenStreetMap.org</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <Text style={styles.settingLabel}>Manage Categories</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <Text style={styles.settingLabel}>Backup & Restore Data</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <Text style={styles.settingLabel}>Help & Feedback</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <Text style={styles.settingLabel}>About</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Import/Export */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleImportShare}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="import" size={20} color={theme.colors.primary} />
            <Text style={[styles.settingLabel, { marginLeft: theme.spacing.md }]}>Import List via Share Code</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.exportButton, styles.settingRow]}
            onPress={handleExportData}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="download" size={20} color={theme.colors.primary} />
            <Text style={[styles.exportButtonText, { marginLeft: theme.spacing.md }]}>Export Data</Text>
          </TouchableOpacity>
        </View>
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
  logoContainer: {
    position: 'relative',
  },
  spoon: {
    position: 'absolute',
    bottom: -4,
    right: -4,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
    marginBottom: theme.spacing.xl,
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  settingItem: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  settingLabel: {
    ...theme.typography.body,
    color: theme.colors.text,
    flex: 1,
  },
  settingValue: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exportButton: {
    backgroundColor: theme.colors.primary,
    marginTop: theme.spacing.md,
  },
  exportButtonText: {
    ...theme.typography.body,
    color: theme.colors.background,
    fontWeight: '600',
    flex: 1,
  },
});
