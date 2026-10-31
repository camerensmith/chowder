/**
 * Image picking + persistence.
 *
 * - Native: the picker returns a cache file that the OS may delete, so we copy
 *   it into the app's document directory.
 * - Web: the picker returns a `blob:` URL that dies on reload, so we downscale
 *   the image and store it as a JPEG data URL (saved in IndexedDB with the
 *   record that references it).
 *
 * Use `pickImage()` everywhere instead of calling expo-image-picker directly.
 */

import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const MAX_WEB_DIMENSION = 1280;
const WEB_JPEG_QUALITY = 0.8;

let LegacyFS: typeof import('expo-file-system/legacy') | null = null;
if (Platform.OS !== 'web') {
  try {
    LegacyFS = require('expo-file-system/legacy');
  } catch {
    LegacyFS = null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new (globalThis as any).Image() as HTMLImageElement;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = src;
  });
}

async function persistWebImage(uri: string): Promise<string> {
  if (/^https?:/.test(uri)) return uri;
  const img = await loadImage(uri);
  const scale = Math.min(1, MAX_WEB_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return uri;
  ctx.drawImage(img, 0, 0, width, height);
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
  return canvas.toDataURL('image/jpeg', WEB_JPEG_QUALITY);
}

async function persistNativeImage(uri: string): Promise<string> {
  if (!LegacyFS?.documentDirectory) return uri;
  const dir = `${LegacyFS.documentDirectory}images/`;
  if (uri.startsWith(dir)) return uri;
  try {
    const info = await LegacyFS.getInfoAsync(dir);
    if (!info.exists) await LegacyFS.makeDirectoryAsync(dir, { intermediates: true });
    const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
    const safeExt = ext && ext.length <= 4 ? ext : 'jpg';
    const dest = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    await LegacyFS.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (error) {
    console.warn('Failed to persist image locally; using original URI', error);
    return uri;
  }
}

/** Turn a temporary picker URI into one that survives app restarts / page reloads. */
export async function persistImageLocally(uri: string): Promise<string> {
  return Platform.OS === 'web' ? persistWebImage(uri) : persistNativeImage(uri);
}

type Source = 'camera' | 'library';

function chooseSource(): Promise<Source | null> {
  // On web the browser's file picker already offers the camera on phones.
  if (Platform.OS === 'web') return Promise.resolve('library');
  return new Promise(resolve => {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: () => resolve('camera') },
      { text: 'Choose from Library', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

/**
 * Let the user pick (or take) a photo and return a persisted URI,
 * or null if they cancelled / denied permission.
 */
export async function pickImage(options: { aspect?: [number, number] } = {}): Promise<string | null> {
  const source = await chooseSource();
  if (!source) return null;

  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: Platform.OS !== 'web',
    aspect: options.aspect ?? [4, 3],
    quality: 0.7,
  };

  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to take photos.');
      return null;
    }
    result = await ImagePicker.launchCameraAsync(pickerOptions);
  } else {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Photo access needed', 'Allow photo library access in Settings to add photos.');
        return null;
      }
    }
    result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  }

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  try {
    return await persistImageLocally(result.assets[0].uri);
  } catch (error) {
    Alert.alert('Photo error', error instanceof Error ? error.message : 'Could not save that photo.');
    return null;
  }
}
