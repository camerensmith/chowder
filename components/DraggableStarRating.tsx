import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, PanResponder, Platform, Text } from 'react-native';
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

export default function DraggableStarRating({ 
  rating, 
  onRatingChange, 
  size = 32,
  disabled = false,
  showValue = false,
  maxRating = 5,
}: DraggableStarRatingProps) {
  const containerRef = useRef<View>(null);
  const [isDragging, setIsDragging] = useState(false);
  const STAR_COUNT = 5;

  const getRatingFromPosition = (x: number, containerWidth: number): number => {
    if (containerWidth <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, x / containerWidth));
    let newRating = ratio * maxRating;
    newRating = Math.max(0, Math.min(maxRating, newRating));
    return Math.round(newRating * 10) / 10;
  };

  // Add global mouse move listener for web dragging
  useEffect(() => {
    if (Platform.OS !== 'web' || disabled) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      e.preventDefault();
      const element = containerRef.current as any;
      const rect = element?.getBoundingClientRect?.();
      if (rect) {
        // Allow dragging even outside the container bounds for better UX
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const newRating = getRatingFromPosition(x, rect.width);
        onRatingChange(newRating);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      // Restore text selection
      if (typeof document !== 'undefined') {
        document.body.style.userSelect = '';
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, disabled]);

  const handleWebMouseMove = (e: any) => {
    if (!isDragging || disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const element = containerRef.current as any;
    const rect = element?.getBoundingClientRect?.();
    if (rect) {
      const x = e.clientX - rect.left;
      const newRating = getRatingFromPosition(x, rect.width);
      onRatingChange(newRating);
    }
  };
  

  const handleWebMouseDown = (e: any) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    const element = containerRef.current as any;
    const rect = element?.getBoundingClientRect?.();
    if (rect) {
      const x = e.clientX - rect.left;
      const newRating = getRatingFromPosition(x, rect.width);
      onRatingChange(newRating);
    }
    // Prevent text selection
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
    }
  };

  const handleWebMouseUp = (e: any) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setIsDragging(false);
    
    // Restore text selection
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = '';
    }
  };

  const handleWebMouseLeave = () => {
    setIsDragging(false);
    // Restore text selection
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = '';
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (evt) => {
      setIsDragging(true);
      if (!containerRef.current) return;
      // Capture pageX synchronously before the async measure callback
      const capturedPageX = evt.nativeEvent.pageX;
      containerRef.current.measure((_x, _y, width, _height, pageX, _pageY) => {
        const touchX = Math.max(0, Math.min(width, capturedPageX - pageX));
        const newRating = getRatingFromPosition(touchX, width);
        onRatingChange(newRating);
      });
    },
    onPanResponderMove: (evt) => {
      if (!containerRef.current || !isDragging) return;
      // Capture pageX synchronously before the async measure callback
      const capturedPageX = evt.nativeEvent.pageX;
      containerRef.current.measure((_x, _y, width, _height, pageX, _pageY) => {
        const touchX = Math.max(0, Math.min(width, capturedPageX - pageX));
        const newRating = getRatingFromPosition(touchX, width);
        onRatingChange(newRating);
      });
    },
    onPanResponderRelease: () => {
      setIsDragging(false);
    },
  });

  const renderStar = (index: number) => {
    const normalizedRating = (rating * STAR_COUNT) / maxRating;
    const starValue = index + 1;
    const isHalf = normalizedRating >= starValue - 0.5 && normalizedRating < starValue;
    const isFilled = normalizedRating >= starValue;
    
    let iconName: string;
    if (isFilled) {
      iconName = 'star';
    } else if (isHalf) {
      iconName = 'star-half-full';
    } else {
      iconName = 'star-outline';
    }
    
    return (
      <View key={index} style={styles.starWrapper}>
        <View style={[styles.starButton, Platform.OS === 'web' && styles.starButtonWeb]}>
          <MaterialCommunityIcons
            name={iconName as any}
            size={size}
            color={isFilled || isHalf ? theme.colors.star : theme.colors.starEmpty}
          />
        </View>
      </View>
    );
  };

  const webHandlers = Platform.OS === 'web' && !disabled ? {
    onMouseDown: handleWebMouseDown,
    onMouseMove: handleWebMouseMove,
    onMouseUp: handleWebMouseUp,
    onMouseLeave: handleWebMouseLeave,
  } : {};


  return (
    <View style={styles.wrapper}>
      <View 
        ref={containerRef}
        style={styles.container}
        {...(!disabled && Platform.OS !== 'web' ? panResponder.panHandlers : {})}
        {...webHandlers}
      >
        {[0, 1, 2, 3, 4].map(renderStar)}
      </View>
      {showValue && !disabled && (
        <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    ...(Platform.OS === 'web' ? {
      cursor: 'grab',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      MozUserSelect: 'none',
      msUserSelect: 'none',
      touchAction: 'none',
    } : {}),
  },
  starWrapper: {
    position: 'relative',
  },
  starButton: {
    padding: 4,
  },
  starButtonWeb: {
    ...(Platform.OS === 'web' ? {
      pointerEvents: 'none' as const,
    } : {}),
  },
  ratingValue: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
    minWidth: 40,
  },
});
