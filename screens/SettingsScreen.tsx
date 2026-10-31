import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { getAuthor, updateAuthor, getImportedFriendLists, deleteList } from '../lib/db';
import { Author, List } from '../types';
import { exportBackupToFile, pickAndRestoreBackup } from '../lib/backup';
import { pickImage } from '../lib/imageStorage';
import { getTileProviderPreference, getTileProvider } from '../lib/tileProviders';
import { getRatingScalePreference, setRatingScalePreference, RatingScale } from '../lib/ratingScale';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [author, setAuthor] = useState<Author | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [tileProviderName, setTileProviderName] = useState<string>('OpenStreetMap');
  const [ratingScale, setRatingScale] = useState<RatingScale>(5);
  const [friendLists, setFriendLists] = useState<List[]>([]);

  useEffect(() => {
    loadAuthor();
    loadTileProvider();
    loadRatingScale();
    loadFriendLists();
  }, []);

  // Refresh tile provider name when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadTileProvider();
      loadRatingScale();
      loadFriendLists();
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
    setNameDraft(authorData?.displayName ?? '');
  };

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (!author || !name || name === author.displayName) {
      setNameDraft(author?.displayName ?? '');
      return;
    }
    await updateAuthor({ displayName: name });
    loadAuthor();
  };

  const handleChangeAvatar = async () => {
    const uri = await pickImage({ aspect: [1, 1] });
    if (!uri) return;
    await updateAuthor({ avatarUri: uri });
    loadAuthor();
  };

  const loadRatingScale = async () => {
    const scale = await getRatingScalePreference();
    setRatingScale(scale);
  };

  const handleToggleRatingScale = async () => {
    const nextScale: RatingScale = ratingScale === 5 ? 10 : 5;
    await setRatingScalePreference(nextScale);
    setRatingScale(nextScale);
  };

  const loadFriendLists = async () => {
    try {
      const imported = await getImportedFriendLists();
      setFriendLists(imported);
    } catch (error) {
      console.error('Failed to load friend lists:', error);
    }
  };

  const handleReimportFriend = (friendName: string) => {
    Alert.alert(
      'Re-import Friend',
      `Import a new share code from ${friendName}? This will replace their existing list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => navigation.navigate('ShareViewer', { friendName }),
        },
      ]
    );
  };

  const handleRemoveFriendList = (list: List) => {
    Alert.alert(
      'Remove Friend List',
      `Remove "${list.name}"? You can re-import it later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteList(list.id);
              loadFriendLists();
            } catch (error) {
              console.error('Failed to remove friend list:', error);
              Alert.alert('Error', 'Failed to remove list.');
            }
          },
        },
      ]
    );
  };

  const handleImportShare = () => {
    navigation.navigate('ShareViewer', {});
  };

  const handleImportData = async () => {
    const restored = await pickAndRestoreBackup();
    if (restored) {
      loadAuthor();
      loadFriendLists();
    }
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
            <Text style={styles.sectionTitle}>Profile</Text>
            <View style={[styles.settingItem, { flexDirection: 'row', alignItems: 'center' }]}>
              <TouchableOpacity onPress={handleChangeAvatar} accessibilityLabel="Change profile photo">
                {author.avatarUri ? (
                  <Image source={{ uri: author.avatarUri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <MaterialCommunityIcons name="camera" size={20} color={theme.colors.textSecondary} />
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
                <Text style={styles.settingLabel}>Display name</Text>
                <TextInput
                  style={styles.nameInput}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  onBlur={handleSaveName}
                  onSubmitEditing={handleSaveName}
                  returnKeyType="done"
                  maxLength={50}
                  placeholder="Your name"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <Text style={styles.settingHint}>Shown as the author of lists you share.</Text>
              </View>
            </View>
          </View>
        )}

        {/* Settings Options */}
        <View style={styles.section}>
          {/* Native maps use Apple/Google Maps; tile styles only apply on web. */}
          {Platform.OS === 'web' ? (
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => navigation.navigate('TileProvider')}
              activeOpacity={0.7}
            >
              <Text style={styles.settingLabel}>Map Style</Text>
              <View style={styles.settingRight}>
                <Text style={styles.settingValue}>{tileProviderName}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
              </View>
            </TouchableOpacity>
          ) : null}

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
            onPress={handleToggleRatingScale}
            activeOpacity={0.7}
          >
            <Text style={styles.settingLabel}>Rating Scale</Text>
            <View style={styles.settingRight}>
              <Text style={styles.settingValue}>Out of {ratingScale}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
            </View>
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

        </View>

        {/* Friends Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Friends' Lists</Text>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleImportShare}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="account-plus" size={20} color={theme.colors.primary} />
            <Text style={[styles.settingLabel, { marginLeft: theme.spacing.md }]}>Import a Friend's List</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          {friendLists.length > 0 && friendLists.map(list => (
            <View key={list.id} style={styles.friendRow}>
              <View style={styles.friendInfo}>
                <Text style={styles.friendName}>{list.importedFrom}</Text>
                <Text style={styles.friendMeta}>
                  {list.name}
                  {list.importedAt ? `  ·  ${new Date(list.importedAt).toLocaleDateString()}` : ''}
                </Text>
              </View>
              <View style={styles.friendActions}>
                <TouchableOpacity
                  style={styles.friendAction}
                  onPress={() => handleReimportFriend(list.importedFrom!)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="refresh" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.friendAction, { marginLeft: theme.spacing.sm }]}
                  onPress={() => handleRemoveFriendList(list)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.error || '#dc3545'} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Import/Export */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.exportButton, styles.settingRow]}
            onPress={exportBackupToFile}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="download" size={20} color={theme.colors.background} />
            <Text style={[styles.exportButtonText, { marginLeft: theme.spacing.md }]}>Backup Data</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          Chowder keeps all your data on this device. Use Backup Data regularly — it's the only copy.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameInput: {
    ...theme.typography.body,
    color: theme.colors.text,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: 4,
    marginTop: 2,
  },
  settingHint: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  footerNote: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
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
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  settingItem: {
    backgroundColor: theme.colors.surface,
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
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  friendMeta: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendAction: {
    padding: theme.spacing.xs || 4,
  },
});
