// Settings → Cloud Backup (Dropbox). Web/PWA only.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import {
  CloudState,
  connectDropbox,
  disconnectDropbox,
  getCloudState,
  restoreFromCloud,
  subscribeCloud,
  syncNow,
} from '../lib/cloud/sync';
import { getAppKey, setAppKey } from '../lib/cloud/dropbox';

export function useCloudState(): CloudState {
  const [s, setS] = useState(getCloudState());
  useEffect(() => subscribeCloud(setS), []);
  return s;
}

function ago(ts?: number): string {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(ts).toLocaleDateString();
}

export default function CloudBackupSection({ onRestored }: { onRestored?: () => void }) {
  const cloud = useCloudState();
  const [, tick] = useState(0);
  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(!!getAppKey());

  // Keep "x min ago" fresh.
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (cloud.status === 'unsupported') return null;
  const connected = cloud.status !== 'disconnected';

  const confirmRestore = () =>
    Alert.alert('Restore from Dropbox?', "This replaces everything on this phone with your Dropbox copy (photos included).", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: async () => { if (await restoreFromCloud()) onRestored?.(); } },
    ]);

  const confirmDisconnect = () =>
    Alert.alert('Disconnect Dropbox?', 'Chowder will stop backing up. Your Dropbox copy and this phone’s data are both kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: disconnectDropbox },
    ]);

  let statusIcon: any = 'cloud-check-outline';
  let statusColor = '#2E7D32';
  let statusText = `Backed up ${ago(cloud.lastSynced)}`;
  if (cloud.status === 'syncing') { statusIcon = 'cloud-sync-outline'; statusColor = theme.colors.textSecondary; statusText = 'Backing up…'; }
  else if (cloud.status === 'offline') { statusIcon = 'cloud-off-outline'; statusColor = theme.colors.textSecondary; statusText = 'Offline — will back up when you’re online'; }
  else if (cloud.status === 'error') { statusIcon = 'cloud-alert'; statusColor = theme.colors.error; statusText = cloud.error || 'Backup failed'; }
  else if (cloud.status === 'conflict') { statusIcon = 'cloud-question'; statusColor = '#B26A00'; statusText = 'Your Dropbox copy was changed on another device'; }
  else if (cloud.dirty) { statusIcon = 'cloud-upload-outline'; statusColor = theme.colors.textSecondary; statusText = `Changes waiting to back up · last ${ago(cloud.lastSynced)}`; }
  else if (!cloud.lastSynced) { statusText = 'Connected'; }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Cloud Backup</Text>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <MaterialCommunityIcons name="dropbox" size={24} color="#0061FE" />
          <Text style={styles.provider}>Dropbox</Text>
          {connected ? <Text style={styles.connected}>Connected</Text> : null}
        </View>

        {!connected ? (
          <>
            <Text style={styles.body}>
              Keep a live copy of your places, lists and photos in your own Dropbox. It updates automatically, and you can restore it anytime — or on a new phone.
            </Text>
            {cloud.error ? <Text style={[styles.body, { color: theme.colors.error }]}>{cloud.error}</Text> : null}
            {!hasKey ? (
              <View style={styles.keyBox}>
                <Text style={styles.keyLabel}>One-time setup: Dropbox app key</Text>
                <TextInput
                  style={styles.keyInput}
                  value={keyDraft}
                  onChangeText={setKeyDraft}
                  placeholder="e.g. abc123xyz456"
                  placeholderTextColor={theme.colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.primary, !hasKey && !keyDraft.trim() && styles.disabled]}
              disabled={!hasKey && !keyDraft.trim()}
              onPress={() => {
                if (!hasKey) {
                  setAppKey(keyDraft);
                  setHasKey(true);
                }
                connectDropbox();
              }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="link-variant" size={18} color="#fff" />
              <Text style={styles.primaryText}>Connect Dropbox</Text>
            </TouchableOpacity>
            <Text style={styles.fine}>Chowder only gets access to its own folder (Apps/Chowder), not your other files.</Text>
          </>
        ) : (
          <>
            <View style={styles.statusRow}>
              {cloud.status === 'syncing' ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              ) : (
                <MaterialCommunityIcons name={statusIcon} size={18} color={statusColor} />
              )}
              <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
            </View>

            {cloud.status === 'conflict' ? (
              <View style={styles.row}>
                <TouchableOpacity style={styles.secondary} onPress={() => syncNow(true)}>
                  <Text style={styles.secondaryText}>Keep this phone’s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondary} onPress={confirmRestore}>
                  <Text style={styles.secondaryText}>Use Dropbox copy</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.row}>
                <TouchableOpacity style={styles.secondary} onPress={() => syncNow()} disabled={cloud.status === 'syncing'}>
                  <MaterialCommunityIcons name="cloud-upload-outline" size={16} color={theme.colors.primary} />
                  <Text style={styles.secondaryText}>Back Up Now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondary} onPress={confirmRestore} disabled={cloud.status === 'syncing'}>
                  <MaterialCommunityIcons name="cloud-download-outline" size={16} color={theme.colors.primary} />
                  <Text style={styles.secondaryText}>Restore</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity onPress={confirmDisconnect} style={styles.disconnect}>
              <Text style={styles.disconnectText}>Disconnect Dropbox</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: { ...theme.typography.h3, color: theme.colors.text, marginBottom: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
    ...theme.shadow,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  provider: { ...theme.typography.body, fontWeight: '600', color: theme.colors.text, flex: 1 },
  connected: { ...theme.typography.caption, color: '#2E7D32', fontWeight: '600' },
  body: { ...theme.typography.bodySmall, color: theme.colors.textSecondary, lineHeight: 20 },
  fine: { ...theme.typography.caption, color: theme.colors.textSecondary },
  keyBox: { gap: 4 },
  keyLabel: { ...theme.typography.caption, color: theme.colors.text, fontWeight: '600' },
  keyInput: {
    ...theme.typography.body,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: '#0061FE',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  primaryText: { ...theme.typography.body, color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  statusText: { ...theme.typography.bodySmall, flex: 1 },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  secondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  secondaryText: { ...theme.typography.bodySmall, color: theme.colors.primary, fontWeight: '600' },
  disconnect: { alignSelf: 'center', paddingVertical: theme.spacing.xs },
  disconnectText: { ...theme.typography.caption, color: theme.colors.textSecondary, textDecorationLine: 'underline' },
});
