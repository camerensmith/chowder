import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { getAuthor, exportBackup, importBackup } from '../lib/db';
import { signOut } from '../lib/auth';
import { stopSyncService } from '../lib/sync';
import { Platform } from 'react-native';
import { getTileProviderPreference, getTileProvider } from '../lib/tileProviders';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [author, setAuthor] = useState<any>(null);
  const [tileProviderName, setTileProviderName] = useState<string>('OpenStreetMap');

  useEffect(() => {
    loadAuthor();
    loadTileProvider();
  }, []);

  // Refresh tile provider name when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadTileProvider();
    }, [])
  );

  const loadTileProvider = async () => {
    const providerId = await getTileProviderPreference();
    const provider = getTileProvider(providerId);
    setTileProviderName(provider.name);
  };

  const loadAuthor = async () => {
    const authorData = await getAuthor();
    setAuthor(authorData);
  };

  const handleImportShare = () => {
    navigation.navigate('ShareViewer', {});
  };

  const handleExportData = async () => {
    try {
      const backup = await exportBackup();
      const jsonString = JSON.stringify(backup, null, 2);
      const filename = `chowder-backup-${new Date().toISOString().split('T')[0]}.json`;

      if (Platform.OS === 'web') {
        // Download file
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Also offer email option
        Alert.alert(
          'Backup Exported',
          'Backup file downloaded. Would you like to email it to yourself?',
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes',
              onPress: () => {
                const subject = encodeURIComponent('Chowder Backup');
                const body = encodeURIComponent(`Chowder backup file attached.\n\nBackup date: ${new Date(backup.exportedAt).toLocaleString()}\n\nPlease save the JSON file and attach it when replying.`);
                const mailtoLink = `mailto:?subject=${subject}&body=${body}`;
                window.open(mailtoLink);
              },
            },
          ]
        );
      } else {
        // For native, show options to share or copy
        Alert.alert(
          'Backup Ready',
          'Choose how to save your backup:',
          [
            {
              text: 'Copy to Clipboard',
              onPress: async () => {
                const { default: Clipboard } = await import('expo-clipboard');
                await Clipboard.setStringAsync(jsonString);
                Alert.alert('Success', 'Backup copied to clipboard. You can paste it into a text file or email.');
              },
            },
            {
              text: 'Share',
              onPress: async () => {
                try {
                  const { default: Sharing } = await import('expo-sharing');
                  if (await Sharing.isAvailableAsync()) {
                    // For native, we'd need expo-file-system to save first
                    Alert.alert('Info', 'Please use "Copy to Clipboard" and paste into an email or note app.');
                  }
                } catch {
                  Alert.alert('Info', 'Please use "Copy to Clipboard" and paste into an email or note app.');
                }
              },
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      console.error('Failed to export backup:', error);
      Alert.alert('Error', 'Failed to export backup. Please try again.');
    }
  };

  const handleImportData = () => {
    if (Platform.OS === 'web') {
      // Create file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          const text = await file.text();
          const backup = JSON.parse(text);
          
          Alert.alert(
            'Import Backup',
            `This will replace all your current data with the backup from ${new Date(backup.exportedAt).toLocaleString()}. Are you sure?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Import',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await importBackup(backup);
                    Alert.alert('Success', 'Backup imported successfully!');
                    // Reload app data
                    loadAuthor();
                  } catch (error) {
                    console.error('Failed to import backup:', error);
                    Alert.alert('Error', 'Failed to import backup. Please check the file format.');
                  }
                },
              },
            ]
          );
        } catch (error) {
          Alert.alert('Error', 'Invalid backup file. Please check the file format.');
        }
      };
      input.click();
    } else {
      // For native, show text input option
      Alert.prompt(
        'Import Backup',
        'Paste your backup JSON here:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            style: 'destructive',
            onPress: async (jsonString) => {
              if (!jsonString) return;
              try {
                const backup = JSON.parse(jsonString);
                Alert.alert(
                  'Import Backup',
                  `This will replace all your current data with the backup from ${new Date(backup.exportedAt).toLocaleString()}. Are you sure?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Import',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await importBackup(backup);
                          Alert.alert('Success', 'Backup imported successfully!');
                          loadAuthor();
                        } catch (error) {
                          console.error('Failed to import backup:', error);
                          Alert.alert('Error', 'Failed to import backup. Please check the format.');
                        }
                      },
                    },
                  ]
                );
              } catch (error) {
                Alert.alert('Error', 'Invalid backup format. Please check your JSON.');
              }
            },
          },
        ],
        'plain-text'
      );
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              stopSyncService();
              await signOut();
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            } catch (error: any) {
              console.error('Failed to sign out:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={loadAuthor}>
          <MaterialCommunityIcons name="refresh" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} />
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile Section */}
        {author && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>Display Name</Text>
              <Text style={styles.settingValue}>{author.displayName}</Text>
            </View>
            {author.email && (
              <View style={styles.settingItem}>
                <Text style={styles.settingLabel}>Email</Text>
                <Text style={styles.settingValue}>{author.email}</Text>
              </View>
            )}
          </View>
        )}

        {/* Settings Options */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => navigation.navigate('TileProvider')}
            activeOpacity={0.7}
          >
            <Text style={styles.settingLabel}>Tile Provider</Text>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>{tileProviderName}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => navigation.navigate('CategoryManagement')}
            activeOpacity={0.7}
          >
            <Text style={styles.settingLabel}>Manage Categories</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleImportData}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="upload" size={20} color={theme.colors.primary} />
            <Text style={[styles.settingLabel, { marginLeft: theme.spacing.md }]}>Restore Data</Text>
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
            <MaterialCommunityIcons name="download" size={20} color={theme.colors.background} />
            <Text style={[styles.exportButtonText, { marginLeft: theme.spacing.md }]}>Backup Data</Text>
          </TouchableOpacity>
        </View>

        {/* Logout Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="logout" size={22} color={theme.colors.background} />
            <Text style={styles.logoutButtonText}>Sign Out</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 157,
    height: 48,
    resizeMode: 'contain',
  },
  placeholder: {
    width: 32,
    height: 32,
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl,
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
  logoutButton: {
    backgroundColor: theme.colors.error || '#dc3545',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
    ...theme.shadow,
  },
  logoutButtonText: {
    ...theme.typography.body,
    color: theme.colors.background,
    fontWeight: '600',
    marginLeft: theme.spacing.sm,
  },
});
