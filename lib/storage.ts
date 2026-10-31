// Tiny key/value store for preferences: localStorage on web, AsyncStorage on native.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Listener = (key: string, value: string | null) => void;
const listeners = new Set<Listener>();

function webStorage(): Storage | null {
  try {
    return (globalThis as any).localStorage ?? null;
  } catch {
    return null;
  }
}

export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return webStorage()?.getItem(key) ?? null;
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.setItem(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
  listeners.forEach(l => l(key, value));
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.removeItem(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
  listeners.forEach(l => l(key, null));
}

/** Subscribe to preference changes made in this app session. Returns an unsubscribe fn. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
