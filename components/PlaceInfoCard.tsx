import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Place } from '../types';
import { theme } from '../lib/theme';

interface PlaceInfoCardProps {
  place: Place;
  categoryName?: string;
  imageUri?: string; // Optional image URI (e.g., from most recent visit)
  onPress: () => void;
}

export default function PlaceInfoCard({ place, categoryName, imageUri, onPress }: PlaceInfoCardProps) {
  const insets = useSafeAreaInsets();
  // Tab bar height is typically ~60-80px, position card pinned to bottom bar with minimal gap
  const tabBarHeight = 80;
  const bottomOffset = tabBarHeight + 2 + insets.bottom; // Minimal 2px gap for visual separation
  
  // Animation values
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entry animation: slide up and fade in
    // useNativeDriver: false on web (not supported)
    const useNative = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: useNative,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: useNative,
      }),
    ]).start();
  }, []);

  const renderStars = (rating?: number) => {
    if (!rating) return null;
    const fullStars = Math.round(rating);
    return (
      <View style={styles.starsContainer}>
        {[...Array(5)].map((_, i) => (
          <MaterialCommunityIcons
            key={i}
            name={i < fullStars ? 'star' : 'star-outline'}
            size={12}
            color={i < fullStars ? '#F5B301' : theme.colors.starEmpty}
          />
        ))}
      </View>
    );
  };

  // Get full address for subtitle
  const getSubtitle = () => {
    return place.address || null;
  };

  return (
    <Animated.View
      style={[
        styles.card,
        {
          bottom: bottomOffset,
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.touchable}
        onPress={onPress}
        activeOpacity={0.9}
        accessibilityLabel={`${place.name}, ${getSubtitle() || 'Location'}, double tap for details`}
        accessibilityRole="button"
      >
        <View style={styles.content}>
          {/* Left column: Icon container */}
          <View style={styles.iconContainer}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.iconImage} resizeMode="cover" />
            ) : (
              <Image
                source={require('../assets/placeholder.png')}
                style={styles.iconImage}
                resizeMode="cover"
              />
            )}
          </View>

          {/* Middle column: Text content stack */}
          <View style={styles.textContainer}>
            {/* Title */}
            <Text style={styles.title} numberOfLines={1}>{place.name}</Text>
            
            {/* Subtitle (city/location) */}
            {getSubtitle() && (
              <Text style={styles.subtitle} numberOfLines={1}>{getSubtitle()}</Text>
            )}
            
            {/* Optional metadata row (category + rating) */}
            {(categoryName || place.overallRating) && (
              <View style={styles.metadataRow}>
                {categoryName && (
                  <>
                    <Text style={styles.category}>{categoryName}</Text>
                    {place.overallRating && <View style={styles.metadataSpacer} />}
                  </>
                )}
                {place.overallRating && renderStars(place.overallRating)}
              </View>
            )}
          </View>

          {/* Right column: Chevron */}
          <View style={styles.chevronContainer}>
            <MaterialCommunityIcons name="chevron-right" size={16} color="#999999" />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    zIndex: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
        elevation: 8,
      },
    }),
  },
  touchable: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 13, // 12-14px
    paddingRight: 13,
    paddingTop: 11, // 10-12px
    paddingBottom: 11,
    minHeight: 88,
    maxHeight: 96,
  },
  iconContainer: {
    width: 42, // 40-44px
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginRight: 12, // Icon → text: 12px
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 9, // Text → chevron: 8-10px
  },
  title: {
    fontSize: 15.5, // 15-16px
    fontWeight: '600', // Semibold
    color: '#1A1A1A', // Near-black
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12.5, // 12-13px
    fontWeight: '400', // Regular
    color: '#666666', // Medium gray
    marginBottom: 4,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  category: {
    fontSize: 11.5, // 11-12px
    color: '#666666',
  },
  metadataSpacer: {
    width: 6,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevronContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
