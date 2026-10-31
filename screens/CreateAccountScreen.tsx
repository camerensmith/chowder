import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { createAuthor } from '../lib/db';
import { pickImage } from '../lib/imageStorage';
import { pickAndRestoreBackup } from '../lib/backup';
import { openPendingShare } from '../lib/navigation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Chowder is local-only: this just creates the on-device profile used as the
// author name on shared lists. There is no server account or password.
export default function CreateAccountScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const handlePickImage = async () => {
    const uri = await pickImage({ aspect: [1, 1] });
    if (uri) setAvatarUri(uri);
  };

  const handleContinue = async () => {
    const name = displayName.trim();
    if (!name) {
      Alert.alert('Name required', 'Enter the name friends will see on lists you share.');
      return;
    }
    setIsSaving(true);
    try {
      await createAuthor(name, avatarUri);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      // If they arrived via a share link, continue to the import screen.
      setTimeout(openPendingShare, 0);
    } catch (error: any) {
      console.error('Failed to create profile:', error);
      Alert.alert('Error', error?.message || 'Could not save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = async () => {
    const restored = await pickAndRestoreBackup();
    if (restored) navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const canContinue = displayName.trim().length > 0 && !isSaving;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} />
        </View>

        <Text style={styles.title}>Welcome to Chowder</Text>
        <Text style={styles.subtitle}>Everything stays on this device. What should we call you?</Text>

        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickImage} accessibilityLabel="Choose profile photo">
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <MaterialCommunityIcons name="camera" size={32} color={theme.colors.textSecondary} />
            </View>
          )}
          <View style={styles.avatarEdit}>
            <MaterialCommunityIcons name="pencil" size={16} color={theme.colors.primary} />
          </View>
        </TouchableOpacity>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Cam"
            placeholderTextColor={theme.colors.textSecondary}
            value={displayName}
            onChangeText={setDisplayName}
            onSubmitEditing={handleContinue}
            returnKeyType="done"
            autoFocus
            maxLength={50}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.buttonText}>{isSaving ? 'Saving…' : 'Get Started'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={handleRestore}>
          <Text style={styles.linkText}>Restore from a backup file</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    position: 'relative',
    marginBottom: theme.spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xxl,
    textAlign: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: theme.spacing.xl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  avatarEdit: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  inputContainer: {
    width: '100%',
    marginBottom: theme.spacing.xl,
  },
  label: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    fontWeight: '600',
  },
  input: {
    ...theme.typography.body,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
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
  linkButton: {
    marginTop: theme.spacing.md,
  },
  linkText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    textAlign: 'center',
  },
});
