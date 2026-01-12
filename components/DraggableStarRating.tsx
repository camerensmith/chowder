import React, { useRef, useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, PanResponder, Platform, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';

interface DraggableStarRatingProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  size?: number;
  disabled?: boolean;
  showValue?: boolean;
}

export default function DraggableStarRating({ 
  rating, 
  onRatingChange, 
  size = 32,
  disabled = false,
  showValue = false
}: DraggableStarRatingProps) {
  const containerRef = useRef<View>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const getRatingFromPosition = (x: number, containerWidth: number): number => {
    const starWidth = containerWidth / 5;
    const starIndex = Math.floor(x / starWidth);
    const positionInStar = (x % starWidth) / starWidth;
    
    // Calculate rating with 0.1 precision
    const baseRating = starIndex;
    const fractional = Math.round(positionInStar * 10) / 10; // Round to 0.1
    
    let newRating = baseRating + fractional + 0.1; // Start from 0.1, not 0
    
    // Clamp between 0.1 and 5.0
    newRating = Math.max(0.1, Math.min(5.0, newRating));
    
    // Round to nearest 0.1
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
      dragStartPosRef.current = null;
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
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
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
    const wasDragging = isDragging;
    setIsDragging(false);
    
    // If it was just a click (not a drag), handle as click
    if (wasDragging && dragStartPosRef.current) {
      const moved = Math.abs(e.clientX - dragStartPosRef.current.x) > 3 || 
                    Math.abs(e.clientY - dragStartPosRef.current.y) > 3;
      if (!moved) {
        // It was a click, not a drag - handle click
        const element = containerRef.current as any;
        const rect = element?.getBoundingClientRect?.();
        if (rect) {
          const x = e.clientX - rect.left;
          const starIndex = Math.floor(x / (rect.width / 5));
          const positionInStar = (x % (rect.width / 5)) / (rect.width / 5);
          // Left half = 0.5, right half = 1.0
          const newRating = positionInStar < 0.5 ? starIndex + 0.5 : starIndex + 1;
          onRatingChange(Math.max(0.5, Math.min(5.0, newRating)));
        }
      }
    }
    dragStartPosRef.current = null;
    
    // Restore text selection
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = '';
    }
  };

  const handleWebMouseLeave = () => {
    setIsDragging(false);
    // Restore text selection
    if (document) {
      document.body.style.userSelect = '';
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (evt) => {
      setIsDragging(true);
      if (!containerRef.current) return;
      
      containerRef.current.measure((x, y, width, height, pageX, pageY) => {
        const touchX = evt.nativeEvent.locationX;
        const newRating = getRatingFromPosition(touchX, width);
        onRatingChange(newRating);
      });
    },
    onPanResponderMove: (evt) => {
      if (!containerRef.current || !isDragging) return;
      
      containerRef.current.measure((x, y, width, height, pageX, pageY) => {
        const touchX = evt.nativeEvent.locationX;
        const newRating = getRatingFromPosition(touchX, width);
        onRatingChange(newRating);
      });
    },
    onPanResponderRelease: () => {
      setIsDragging(false);
    },
  });

  const handleStarPress = (starIndex: number, isHalf: boolean = false, e?: any) => {
    if (disabled) return;
    // Prevent drag if it was a click
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    
    // Tapping gives 0.5 increments
    const newRating = isHalf ? starIndex + 0.5 : starIndex + 1;
    onRatingChange(newRating);
  };

  const renderStar = (index: number) => {
    const starValue = index + 1;
    const isHalf = rating >= starValue - 0.5 && rating < starValue;
    const isFilled = rating >= starValue;
    
    let iconName: string;
    if (isFilled) {
      iconName = 'star';
    } else if (isHalf) {
      iconName = 'star-half-full';
    } else {
      iconName = 'star-outline';
    }
    
    if (disabled) {
      return (
        <MaterialCommunityIcons
          key={index}
          name={iconName as any}
          size={size}
          color={isFilled || isHalf ? theme.colors.star : theme.colors.starEmpty}
        />
      );
    }

    // Interactive mode
    if (Platform.OS === 'web') {
      // Web: Use View - mouse handlers are on container for dragging
      return (
        <View key={index} style={styles.starWrapper}>
          <View style={[styles.starButton, styles.starButtonWeb]}>
            <MaterialCommunityIcons
              name={iconName as any}
              size={size}
              color={isFilled || isHalf ? theme.colors.star : theme.colors.starEmpty}
            />
          </View>
        </View>
      );
    }

    // Mobile: Use TouchableOpacity for tap interactions
    return (
      <View key={index} style={styles.starWrapper}>
        <TouchableOpacity
          onPress={(e) => {
            if (isDragging) return;
            handleStarPress(index, false, e);
          }}
          activeOpacity={0.7}
          style={styles.starButton}
        >
          <MaterialCommunityIcons
            name={iconName as any}
            size={size}
            color={isFilled || isHalf ? theme.colors.star : theme.colors.starEmpty}
          />
        </TouchableOpacity>
        {/* Half star tap area (left half) */}
        <TouchableOpacity
          onPress={(e) => {
            if (isDragging) return;
            handleStarPress(index, true, e);
          }}
          activeOpacity={0.7}
          style={[styles.starButton, styles.halfStarButton]}
          hitSlop={{ left: 0, right: 0, top: 10, bottom: 10 }}
        />
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
  halfStarButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '50%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  ratingValue: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
    minWidth: 40,
  },
});
