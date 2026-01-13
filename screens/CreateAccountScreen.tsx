import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { signUp } from '../lib/auth';
import { createAuthor, initializeDefaultCategories } from '../lib/db';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CreateAccountScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleContinue = async () => {
    if (!displayName.trim()) {
      Alert.alert('Required', 'Please enter your display name');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Required', 'Please enter a password (at least 6 characters)');
      return;
    }

    setIsLoading(true);
    try {
      // Sign up with backend
      const { user, emailSent } = await signUp(email.trim(), password, displayName.trim());
      
      // Create local author profile
      await createAuthor(displayName.trim(), avatarUri, email.trim(), user.id);
      
      // Ensure default categories exist (in case they weren't created during init)
      await initializeDefaultCategories();
      
      // Show success message with email status
      if (emailSent) {
        Alert.alert(
          'Welcome!',
          `Account created successfully! A welcome email has been sent to ${email.trim()}.`,
          [{ text: 'OK', onPress: () => navigation.replace('Main') }]
        );
      } else {
        navigation.replace('Main');
      }
    } catch (error: any) {
      console.error('Failed to create account:', error);
      Alert.alert('Error', error.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} />
        </View>

        <Text style={styles.title}>Welcome to Chowder</Text>
        <Text style={styles.subtitle}>Create your profile to get started</Text>

        {/* Avatar */}
        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickImage}>
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

        {/* Display Name Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Cam"
            placeholderTextColor={theme.colors.textSecondary}
            value={displayName}
            onChangeText={setDisplayName}
            autoFocus
            maxLength={50}
          />
        </View>

        {/* Email Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your.email@example.com"
            placeholderTextColor={theme.colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            placeholderTextColor={theme.colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Continue Button */}
        <TouchableOpacity
          style={[styles.button, (!displayName.trim() || !email.trim() || !password || isLoading) && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!displayName.trim() || !email.trim() || !password || isLoading}
        >
          <Text style={styles.buttonText}>{isLoading ? 'Creating...' : 'Create Account'}</Text>
        </TouchableOpacity>

        {/* Login Link */}
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.linkText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
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
