// Small "Google ★ 4.6 · 2,341 reviews" footnote under a place (if enabled and known).
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { theme } from '../lib/theme';
import { Place } from '../types';
import { getGoogleRating, GoogleRating, onGoogleSettingsChange } from '../lib/googleRatings';

export default function GoogleRatingFootnote({ place, style }: { place: Place; style?: any }) {
  const [rating, setRating] = useState<GoogleRating | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => onGoogleSettingsChange(() => setVersion(v => v + 1)), []);
  useEffect(() => {
    let alive = true;
    setRating(null);
    getGoogleRating(place).then(r => { if (alive) setRating(r); });
    return () => { alive = false; };
  }, [place.id, place.name, place.latitude, place.longitude, version]);

  if (!rating) return null;
  const label = `Google ★ ${rating.rating.toFixed(1)} · ${rating.count.toLocaleString()} review${rating.count === 1 ? '' : 's'}`;
  return (
    <TouchableOpacity
      onPress={() => rating.url && Linking.openURL(rating.url)}
      disabled={!rating.url}
      accessibilityRole="link"
      accessibilityLabel={`${label}. Opens Google Maps.`}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <Text style={[styles.text, style]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  text: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
