// Authentication system for Chowder
// Handles email/password authentication with JWT tokens

import { Platform } from 'react-native';
import * as api from './api';

// AsyncStorage import - will be null on web
let AsyncStorage: any = null;
if (Platform.OS !== 'web') {
  try {
    AsyncStorage = require('@react-native-async-storage/async-storage').default;
  } catch {
    // AsyncStorage not available
  }
}

const AUTH_TOKEN_KEY = 'chowder_auth_token';
const USER_KEY = 'chowder_user';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUri?: string;
}

// Get auth token from storage
async function getAuthToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  }
  if (!AsyncStorage) return null;
  return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
}

// Set auth token in storage
async function setAuthToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      throw new Error('Failed to store auth token');
    }
    return;
  }
  if (!AsyncStorage) throw new Error('AsyncStorage not available');
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}

// Remove auth token from storage
async function removeAuthToken(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // Ignore errors
    }
    return;
  }
  if (!AsyncStorage) return;
  await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, USER_KEY]);
}

// Get current user from storage
async function getStoredUser(): Promise<User | null> {
  try {
    let userJson: string | null;
    if (Platform.OS === 'web') {
      userJson = localStorage.getItem(USER_KEY);
    } else {
      if (!AsyncStorage) return null;
      userJson = await AsyncStorage.getItem(USER_KEY);
    }
    return userJson ? JSON.parse(userJson) : null;
  } catch {
    return null;
  }
}

// Set current user in storage
async function setStoredUser(user: User): Promise<void> {
  const userJson = JSON.stringify(user);
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(USER_KEY, userJson);
    } catch {
      throw new Error('Failed to store user');
    }
    return;
  }
  if (!AsyncStorage) throw new Error('AsyncStorage not available');
  await AsyncStorage.setItem(USER_KEY, userJson);
}

// Sign up new user
export async function signUp(email: string, password: string, displayName: string): Promise<{ user: User; emailSent: boolean }> {
  try {
    // Check if backend is available
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const hasBackend = apiUrl && apiUrl !== 'http://localhost:3000' && await checkBackendAvailable(apiUrl);
    
    if (hasBackend) {
      // Use backend if available
      const response = await api.post('/api/auth/signup', {
        email,
        password,
        displayName,
      });

      const { token, user } = response;
      await setAuthToken(token);
      await setStoredUser(user);
      
      // Send welcome email (non-blocking - don't fail signup if email fails)
      let emailSent = false;
      try {
        await api.sendWelcomeEmail(email, displayName);
        emailSent = true;
        console.log('Welcome email sent successfully');
      } catch (error) {
        console.warn('Welcome email failed to send:', error);
        // emailSent remains false
      }
      
      return { user, emailSent };
    } else {
      // Offline mode: create user locally without backend
      const user: User = {
        id: generateId(),
        email,
        displayName,
        avatarUri: undefined,
      };
      
      // Store user locally (no token needed for offline mode)
      await setStoredUser(user);
      return { user, emailSent: false };
    }
  } catch (error: any) {
    // If backend fails, fall back to offline mode
    if (error.message?.includes('Failed to fetch') || error.message?.includes('CONNECTION_REFUSED')) {
      console.log('Backend unavailable, creating account offline');
      const user: User = {
        id: generateId(),
        email,
        displayName,
        avatarUri: undefined,
      };
      await setStoredUser(user);
      return { user, emailSent: false };
    }
    throw new Error(error.message || 'Failed to sign up');
  }
}

// Helper to check if backend is available
async function checkBackendAvailable(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
    
    const response = await fetch(`${baseUrl}/api/health`, { 
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

// Helper to generate IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Sign in existing user
export async function signIn(email: string, password: string): Promise<User> {
  try {
    // Check if backend is available
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const hasBackend = apiUrl && apiUrl !== 'http://localhost:3000' && await checkBackendAvailable(apiUrl);
    
    if (hasBackend) {
      // Use backend if available
      const response = await api.post('/api/auth/login', {
        email,
        password,
      });

      const { token, user } = response;
      await setAuthToken(token);
      await setStoredUser(user);
      return user;
    } else {
      // Offline mode: check if user exists locally
      const storedUser = await getStoredUser();
      if (storedUser && storedUser.email === email) {
        // User exists locally, sign them in
        return storedUser;
      }
      throw new Error('No account found. Please create an account first.');
    }
  } catch (error: any) {
    // If backend fails, try offline mode
    if (error.message?.includes('Failed to fetch') || error.message?.includes('CONNECTION_REFUSED')) {
      const storedUser = await getStoredUser();
      if (storedUser && storedUser.email === email) {
        return storedUser;
      }
      throw new Error('No account found. Please create an account first.');
    }
    throw new Error(error.message || 'Failed to sign in');
  }
}

// Sign out current user
export async function signOut(): Promise<void> {
  await removeAuthToken();
}

// Get current authenticated user
export async function getCurrentUser(): Promise<User | null> {
  const token = await getAuthToken();
  if (!token) {
    return null;
  }

  // Try to get from storage first
  const storedUser = await getStoredUser();
  if (storedUser) {
    return storedUser;
  }

  // If not in storage, fetch from API
  try {
    const user = await api.get('/api/user/profile');
    await setStoredUser(user);
    return user;
  } catch {
    // If API call fails, clear token
    await removeAuthToken();
    return null;
  }
}

// Check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  return token !== null;
}

// Get auth token (for API client)
export async function getToken(): Promise<string | null> {
  return getAuthToken();
}
