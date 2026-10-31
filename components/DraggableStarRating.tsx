// Tap or drag to rate. Values are in display units (0..maxRating), snapped to 0.5.
//
// While the finger/mouse is down only the local preview changes; `onRatingChange`
// fires once on release. (It used to fire on every move, which made the parent
// write to the database dozens of times per drag and the stars jump around.)

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, Platform, Text, LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

interface DraggableStarRatingProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  size?: number;
  disabled?: boolean;
  showValue?: boolean;
  maxRating?: number;
}

const STAR_COUNT = 5;
const STEP = 0.5;

export default function DraggableStarRating({
  rating,
  onRatingChange,
  size = 32,
  disabled = false,
  showValue = false,
  maxRating = 5,
}: DraggableStarRatingProps) {
  const [preview, setPreview] = useState<number | null>(null);
  const widthRef = useRef(0);
  const containerRef = useRef<View>(null);
  const latest = useRef({ onRatingChange, maxRating, disabled });
  latest.current = { onRatingChange, maxRating, disabled };
  const previewRef = useRef<number | null>(null);

  const valueAt = (x: number): number => {
    const width = widthRef.current;
    if (width <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, x / width));
    const raw = ratio * latest.current.maxRating;
    // Round up to the next half step so the star under your finger fills,
    // with a minimum of one step (a tap on the far left = half a star).
    return Math.max(STEP, Math.min(latest.current.maxRating, Math.ceil(raw / STEP) * STEP));
  };

  const start = (x: number) => {
    previewRef.current = valueAt(x);
    setPreview(previewRef.current);
  };
  const move = (x: number) => {
    if (previewRef.current === null) return;
    const next = valueAt(x);
    if (next !== previewRef.current) {
      previewRef.current = next;
      setPreview(next);
    }
  };
  const end = (commit: boolean) => {
    const value = previewRef.current;
    previewRef.current = null;
    setPreview(null);
    if (commit && value !== null) latest.current.onRatingChange(value);
  };

  // Native: PanResponder created once; refuse to hand the gesture to a parent ScrollView mid-drag.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onMoveShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: evt => start(evt.nativeEvent.locationX),
      onPanResponderMove: evt => move(evt.nativeEvent.locationX),
      onPanResponderRelease: () => end(true),
      onPanResponderTerminate: () => end(false),
    })
  ).current;

  // Web: pointer events cover mouse, touch and pen. touch-action: pan-y keeps
  // vertical page scrolling working when a swipe starts on the stars.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = containerRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    const localX = (e: PointerEvent) => e.clientX - el.getBoundingClientRect().left;
    const down = (e: PointerEvent) => {
      if (latest.current.disabled) return;
      widthRef.current = el.getBoundingClientRect().width;
      el.setPointerCapture?.(e.pointerId);
      start(localX(e));
      e.preventDefault();
    };
    const moveH = (e: PointerEvent) => move(localX(e));
    const up = () => end(true);
    const cancel = () => end(false);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', moveH);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', moveH);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, []);

  const shown = preview ?? rating;
  const normalized = (shown * STAR_COUNT) / maxRating;

  const renderStar = (index: number) => {
    const starValue = index + 1;
    const isFilled = normalized >= starValue - 0.001;
    const isHalf = !isFilled && normalized >= starValue - 0.5 - 0.001;
    const iconName = isFilled ? 'star' : isHalf ? 'star-half-full' : 'star-outline';
    return (
      <View key={index} style={styles.starButton} pointerEvents="none">
        <MaterialCommunityIcons
          name={iconName}
          size={size}
          color={isFilled || isHalf ? theme.colors.star : theme.colors.starEmpty}
        />
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      <View
        ref={containerRef}
        style={[styles.container, Platform.OS === 'web' && !disabled ? (webStyle as any) : null]}
        onLayout={(e: LayoutChangeEvent) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        accessibilityRole="adjustable"
        accessibilityLabel={`Rating ${shown} out of ${maxRating}`}
        {...(!disabled && Platform.OS !== 'web' ? panResponder.panHandlers : {})}
      >
        {[0, 1, 2, 3, 4].map(renderStar)}
      </View>
      {showValue && !disabled && <Text style={styles.ratingValue}>{shown.toFixed(1)}</Text>}
    </View>
  );
}

const webStyle = {
  cursor: 'pointer',
  userSelect: 'none',
  touchAction: 'pan-y',
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starButton: {
    padding: 4,
  },
  ratingValue: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
    minWidth: 40,
  },
});
