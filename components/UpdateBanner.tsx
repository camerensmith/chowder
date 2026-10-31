// "A new version is ready" pill shown on top of any screen (web/PWA only).
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { applyUpdate, dismissUpdate, getUpdateState, subscribeToUpdates, UpdateState } from '../lib/pwa';

export function useUpdateState(): UpdateState {
  const [s, setS] = useState<UpdateState>(getUpdateState());
  useEffect(() => subscribeToUpdates(setS), []);
  return s;
}

export default function UpdateBanner() {
  const s = useUpdateState();
  const insets = useSafeAreaInsets();
  const show = (s.status === 'available' && s.dismissedBuild !== s.latestBuild) || s.status === 'updating';
  if (Platform.OS !== 'web' || !show) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={styles.pill} accessibilityRole="alert">
        <MaterialCommunityIcons name="arrow-up-circle" size={20} color="#fff" />
        <Text style={styles.text} numberOfLines={1}>
          {s.status === 'updating' ? 'Updating…' : 'New version of Chowder ready'}
        </Text>
        {s.status === 'available' ? (
          <>
            <TouchableOpacity onPress={dismissUpdate} style={styles.later} accessibilityRole="button">
              <Text style={styles.laterText}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={applyUpdate} style={styles.update} accessibilityRole="button">
              <Text style={styles.updateText}>Update</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1F1F1F',
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    maxWidth: 440,
    marginHorizontal: 12,
    ...Platform.select({
      web: { boxShadow: '0 4px 14px rgba(0,0,0,0.25)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
    }),
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  later: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  laterText: {
    color: '#BDBDBD',
    fontSize: 14,
  },
  update: {
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  updateText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
