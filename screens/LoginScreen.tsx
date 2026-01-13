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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { theme } from '../lib/theme';
import { signIn } from '../lib/auth';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function LoginScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email');
      return;
    }
    if (!password) {
      Alert.alert('Required', 'Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      await signIn(email.trim(), password);
      navigation.replace('Main');
    } catch (error: any) {
      console.error('Failed to sign in:', error);
      Alert.alert('Error', error.message || 'Failed to sign in. Please check your credentials.');
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

        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {/* Email Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={theme.colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </View>

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor={theme.colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Sign In Button */}
        <TouchableOpacity
          style={[styles.button, (!email.trim() || !password || isLoading) && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={!email.trim() || !password || isLoading}
        >
          <Text style={styles.buttonText}>{isLoading ? 'Signing in...' : 'Sign In'}</Text>
        </TouchableOpacity>

        {/* Create Account Link */}
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('CreateAccount')}
        >
          <Text style={styles.linkText}>Don't have an account? Create one</Text>
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
