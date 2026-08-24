import { Platform } from 'react-native';

export type RatingScale = 5 | 10;

const RATING_SCALE_KEY = 'chowder_rating_scale';
const DEFAULT_RATING_SCALE: RatingScale = 5;

let AsyncStorage: any = null;
if (Platform.OS !== 'web') {
  try {
    AsyncStorage = require('@react-native-async-storage/async-storage').default;
  } catch {
    AsyncStorage = null;
  }
}

export async function getRatingScalePreference(): Promise<RatingScale> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(RATING_SCALE_KEY);
      return value === '10' ? 10 : DEFAULT_RATING_SCALE;
    }
    if (AsyncStorage) {
      const value = await AsyncStorage.getItem(RATING_SCALE_KEY);
      return value === '10' ? 10 : DEFAULT_RATING_SCALE;
    }
  } catch {}
  return DEFAULT_RATING_SCALE;
}

export async function setRatingScalePreference(scale: RatingScale): Promise<void> {
  const value = String(scale);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(RATING_SCALE_KEY, value);
    window.dispatchEvent(new CustomEvent('chowder_rating_scale_changed', { detail: scale }));
    return;
  }
  if (AsyncStorage) {
    await AsyncStorage.setItem(RATING_SCALE_KEY, value);
  }
}

export function toDisplayRating(internalRating: number, scale: RatingScale): number {
  return (internalRating * scale) / 5;
}

export function toInternalRating(displayRating: number, scale: RatingScale): number {
  return (displayRating * 5) / scale;
}

export function getRatingScaleLabel(scale: RatingScale): string {
  return `${scale}`;
}
