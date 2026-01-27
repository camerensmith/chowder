import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../lib/theme';
import { getAllPlaces, getAllVisits, getAllLists, getAllDishes } from '../lib/db';
import { Place, Visit, List, Dish } from '../types';

type TimeRange = 'Week' | 'Month' | 'Year';

interface StatCardProps {
  value: string | number;
  label: string;
  sublabel?: string;
  color?: string;
}

function CircularStatCard({ value, label, sublabel, color = theme.colors.primary }: StatCardProps) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  return (
    <View style={styles.statCard}>
      <View style={styles.circleContainer}>
        <Svg width={size} height={size}>
          {/* Background circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.colors.border}
            strokeWidth={strokeWidth}
            fill={theme.colors.background}
          />
          {/* Foreground circle (ring) */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference * 0.75} ${circumference}`}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={styles.statValueContainer}>
          <Text style={styles.statValue}>{value}</Text>
        </View>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      {sublabel && <Text style={styles.statSublabel}>{sublabel}</Text>}
    </View>
  );
}

export default function DashboardScreen() {
  const [timeRange, setTimeRange] = useState<TimeRange>('Week');
  const [places, setPlaces] = useState<Place[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [placesData, visitsData, listsData, dishesData] = await Promise.all([
        getAllPlaces(),
        getAllVisits(),
        getAllLists(),
        getAllDishes(),
      ]);
      setPlaces(placesData);
      setVisits(visitsData);
      setLists(listsData);
      setDishes(dishesData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate time range cutoff
  const getTimeRangeCutoff = (): number => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    switch (timeRange) {
      case 'Week':
        return now - 7 * day;
      case 'Month':
        return now - 30 * day;
      case 'Year':
        return now - 365 * day;
      default:
        return now - 7 * day;
    }
  };

  const cutoff = getTimeRangeCutoff();

  // Stat 1: Restaurants Added (time-filtered)
  const restaurantsAdded = places.filter(p => p.createdAt >= cutoff).length;

  // Stat 2: Check-Ins (time-filtered)
  const checkIns = visits.filter(v => v.createdAt >= cutoff).length;

  // Stat 3: Average Score (time-filtered)
  const timeFilteredVisits = visits.filter(v => v.createdAt >= cutoff);
  const timeFilteredVisitIds = new Set(timeFilteredVisits.map(v => v.id));
  const timeFilteredDishes = dishes.filter(d => timeFilteredVisitIds.has(d.visitId));
  const { sum, count } = timeFilteredDishes.reduce(
    (acc, d) => ({ sum: acc.sum + d.rating, count: acc.count + 1 }),
    { sum: 0, count: 0 }
  );
  const avgScore = count > 0 ? sum / count : 0;
  const avgScoreDisplay = count > 0 ? avgScore.toFixed(1) : '—';

  // Stat 4: Lists Created (total, no time filter)
  const listsCreated = lists.length;

  // Stat 5: Total Check-Ins (all-time)
  const totalCheckIns = visits.length;

  // Stat 6: Favorite Meal (most frequent dish name)
  const dishCounts = new Map<string, { count: number; lastDate: number }>();
  dishes.forEach(d => {
    const existing = dishCounts.get(d.name) || { count: 0, lastDate: 0 };
    dishCounts.set(d.name, {
      count: existing.count + 1,
      lastDate: Math.max(existing.lastDate, d.createdAt),
    });
  });
  
  let favoriteMeal = '—';
  let maxCount = 0;
  let maxDate = 0;
  dishCounts.forEach((data, name) => {
    if (data.count > maxCount || (data.count === maxCount && data.lastDate > maxDate)) {
      favoriteMeal = name;
      maxCount = data.count;
      maxDate = data.lastDate;
    }
  });

  // Stat 7: Top 5 Restaurants (by meal count, min 2 meals)
  // Create lookup maps for better performance
  const visitsById = new Map(visits.map(v => [v.id, v]));
  const placesById = new Map(places.map(p => [p.id, p]));
  
  const restaurantMealCounts = new Map<string, { name: string; count: number }>();
  
  // Count meals per restaurant
  dishes.forEach(dish => {
    const visit = visitsById.get(dish.visitId);
    if (visit) {
      const place = placesById.get(visit.placeId);
      if (place) {
        const existing = restaurantMealCounts.get(place.id) || { name: place.name, count: 0 };
        restaurantMealCounts.set(place.id, {
          name: place.name,
          count: existing.count + 1,
        });
      }
    }
  });

  const topRestaurants = Array.from(restaurantMealCounts.values())
    .filter(r => r.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const renderTimeRangeToggle = () => (
    <View style={styles.toggleContainer}>
      {(['Week', 'Month', 'Year'] as TimeRange[]).map((range) => (
        <TouchableOpacity
          key={range}
          style={[
            styles.toggleButton,
            timeRange === range && styles.toggleButtonActive,
          ]}
          onPress={() => setTimeRange(range)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.toggleText,
              timeRange === range && styles.toggleTextActive,
            ]}
          >
            {range}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={loadData}>
          <MaterialCommunityIcons name="refresh" size={28} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Dashboard</Text>
        </View>

        {/* Time Range Toggle */}
        {renderTimeRangeToggle()}

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <CircularStatCard
            value={restaurantsAdded}
            label="Restaurants Added"
            sublabel={timeRange}
          />
          <CircularStatCard
            value={checkIns}
            label="Check-Ins"
            sublabel={timeRange}
          />
          <CircularStatCard
            value={avgScoreDisplay}
            label="Avg Rating"
            sublabel={timeRange}
          />
          <CircularStatCard
            value={listsCreated}
            label="Lists"
            sublabel="All Time"
          />
          <CircularStatCard
            value={totalCheckIns}
            label="Total Visits"
            sublabel="All Time"
          />
          <CircularStatCard
            value={favoriteMeal}
            label="Favorite Meal"
            sublabel="All Time"
          />
        </View>

        {/* Top 5 Restaurants */}
        {topRestaurants.length > 0 && (
          <View style={styles.topRestaurantsSection}>
            <Text style={styles.sectionTitle}>Top 5 Restaurants</Text>
            {topRestaurants.map((restaurant, index) => (
              <View key={index} style={styles.restaurantRow}>
                <Text style={styles.restaurantName} numberOfLines={1}>
                  {restaurant.name}
                </Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {restaurant.count} {restaurant.count === 1 ? 'meal' : 'meals'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 157,
    height: 48,
  },
  headerSpacer: {
    width: 28,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  titleContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.text,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xs,
    ...theme.shadow,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  toggleText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: theme.colors.background,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  statCard: {
    width: '47%',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow,
  },
  circleContainer: {
    position: 'relative',
    marginBottom: theme.spacing.sm,
  },
  statValueContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    ...theme.typography.h2,
    color: theme.colors.text,
    fontWeight: '700',
  },
  statLabel: {
    ...theme.typography.bodySmall,
    color: theme.colors.text,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  statSublabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  topRestaurantsSection: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  restaurantName: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
    flex: 1,
    marginRight: theme.spacing.md,
  },
  countBadge: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  countBadgeText: {
    ...theme.typography.caption,
    color: theme.colors.onSecondary,
    fontWeight: '600',
  },
});
