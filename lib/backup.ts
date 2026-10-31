// Backup / restore of all local data as a JSON file.
import { Alert, Platform } from 'react-native';
import { BackupData, exportBackup, importBackup, validateBackup } from './db';
import { confirmAsync } from './dialogs';

function backupFilename(): string {
  return `chowder-backup-${new Date().toISOString().split('T')[0]}.json`;
}

/** Save a backup file: browser download on web, share sheet on native. */
export async function exportBackupToFile(): Promise<void> {
  try {
    const backup = await exportBackup();
    const json = JSON.stringify(backup);
    const filename = backupFilename();

    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    const FS = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const path = `${FS.cacheDirectory}${filename}`;
    await FS.writeAsStringAsync(path, json);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Save Chowder backup', UTI: 'public.json' });
    } else {
      Alert.alert('Backup saved', `Saved to ${path}`);
    }
  } catch (error: any) {
    console.error('Failed to export backup:', error);
    Alert.alert('Backup failed', error?.message || 'Could not create a backup.');
  }
}

async function readBackupFile(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve(file ? await file.text() : null);
      };
      // Some browsers never fire change on cancel; the promise simply stays pending,
      // which is harmless since nothing awaits it after the screen moves on.
      input.click();
    });
  }
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  const FS = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  return FS.readAsStringAsync(result.assets[0].uri);
}

/**
 * Ask for a backup file, confirm, and replace all local data with it.
 * Resolves true if data was restored.
 */
export async function pickAndRestoreBackup(): Promise<boolean> {
  let backup: BackupData;
  try {
    const text = await readBackupFile();
    if (!text) return false;
    const parsed = JSON.parse(text);
    validateBackup(parsed);
    backup = parsed;
  } catch (error: any) {
    Alert.alert('Invalid backup', error?.message || 'That file is not a Chowder backup.');
    return false;
  }

  const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : 'an unknown date';
  const ok = await confirmAsync(
    'Restore backup?',
    `This replaces everything on this device with the backup from ${when} (${backup.places.length} places, ${backup.lists.length} lists).`,
    'Restore',
    true
  );
  if (!ok) return false;

  try {
    await importBackup(backup);
    Alert.alert('Restored', 'Your data has been restored.');
    return true;
  } catch (error: any) {
    console.error('Failed to import backup:', error);
    Alert.alert('Restore failed', error?.message || 'Could not restore that backup.');
    return false;
  }
}
