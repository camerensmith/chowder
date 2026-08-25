import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../lib/theme';
import { getAllPlaces, getAllVisits, getAllLists, getAllDishes, getAllListItems } from '../lib/db';
import { Place, Visit, List, Dish, ListItem } from '../types';
import { getRatingScalePreference, toDisplayRating, RatingScale } from '../lib/ratingScale';

type TimeRange = 'Week' | 'Month' | 'Year';
const INTERNAL_MAX_RATING = 5;

interface StatCardProps {
  value: string | number;
  label: string;
  sublabel?: string;
  color?: string;
  progress?: number;
}

function CircularStatCard({ value, label, sublabel, color = theme.colors.primary, progress = 0.75 }: StatCardProps) {
  const size = 100;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = Math.max(0, Math.min(1, progress)) * circumference;

  return (
    <View style={styles.statCard}>
      <View style={styles.circleContainer}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#D8D8D8" strokeWidth={strokeWidth} fill={theme.colors.background} />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${arcLength} ${circumference}`}
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
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [ratingScale, setRatingScale] = useState<RatingScale>(5);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [placesData, visitsData, listsData, dishesData, listItemsData, scale] = await Promise.all([
        getAllPlaces(),
        getAllVisits(),
        getAllLists(),
        getAllDishes(),
        getAllListItems(),
        getRatingScalePreference(),
      ]);
      setPlaces(placesData);
      setVisits(visitsData);
      setLists(listsData);
      setDishes(dishesData);
      setListItems(listItemsData);
      setRatingScale(scale);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
  const restaurantsAdded = places.filter(p => p.createdAt >= cutoff).length;
  const checkIns = visits.filter(v => v.createdAt >= cutoff).length;

  const timeFilteredVisits = visits.filter(v => v.createdAt >= cutoff);
  const timeFilteredVisitIds = new Set(timeFilteredVisits.map(v => v.id));
  const timeFilteredDishes = dishes.filter(d => timeFilteredVisitIds.has(d.visitId));
  const { sum, count } = timeFilteredDishes.reduce(
    (acc, d) => ({ sum: acc.sum + d.rating, count: acc.count + 1 }),
    { sum: 0, count: 0 }
  );
  const avgScore = count > 0 ? sum / count : 0;
  const avgScoreDisplay = count > 0 ? toDisplayRating(avgScore, ratingScale).toFixed(1) : '—';

  const listsCreated = lists.length;
  const totalCheckIns = visits.length;

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

  const visitsById = new Map(visits.map(v => [v.id, v]));
  const placesById = new Map(places.map(p => [p.id, p]));
  const restaurantMealCounts = new Map<string, { id: string; name: string; count: number }>();

  dishes.forEach(dish => {
    const visit = visitsById.get(dish.visitId);
    if (!visit) return;
    const place = placesById.get(visit.placeId);
    if (!place) return;

    const existing = restaurantMealCounts.get(place.id) || { id: place.id, name: place.name, count: 0 };
    restaurantMealCounts.set(place.id, { ...existing, count: existing.count + 1 });
  });

  const topRestaurants = Array.from(restaurantMealCounts.values())
    .filter(r => r.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recentRated = useMemo(() => {
    const memoVisitsById = new Map(visits.map(v => [v.id, v]));
    const memoPlacesById = new Map(places.map(p => [p.id, p]));
    const placeToListNames = new Map<string, string[]>();
    listItems.forEach(item => {
      const list = lists.find(l => l.id === item.listId);
      if (!list) return;
      const existing = placeToListNames.get(item.placeId) || [];
      if (!existing.includes(list.name)) existing.push(list.name);
      placeToListNames.set(item.placeId, existing);
    });

    return [...dishes]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter(d => d.rating > 0)
      .map(dish => {
        const visit = memoVisitsById.get(dish.visitId);
        if (!visit) return null;
        const place = memoPlacesById.get(visit.placeId);
        if (!place) return null;

        return {
          id: dish.id,
          dishName: dish.name,
          rating: dish.rating,
          note: dish.notes || visit.notes,
          listNames: placeToListNames.get(place.id) || [],
          placeName: place.name,
          coverImageUri: place.coverImageUri,
          createdAt: dish.createdAt,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item)
      .slice(0, 3);
  }, [dishes, listItems, lists, visits, places]);

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

  const renderRecentRated = () => {
    if (recentRated.length === 0) return null;

    return (
      <View style={styles.recentSection}>
        <View style={styles.sectionDivider} />
        <Text style={styles.sectionTitle}>Recently Rated</Text>
        {recentRated.map(item => (
          <View key={item.id} style={styles.recentRow}>
            <Image
              source={item.coverImageUri ? { uri: item.coverImageUri } : require('../assets/placeholder.png')}
              style={styles.recentImage}
              resizeMode="cover"
            />
            <View style={styles.recentTextContainer}>
              <Text style={styles.recentTitle} numberOfLines={1}>
                {item.placeName} · {item.dishName}
              </Text>
              <Text style={styles.recentRating}>
                {toDisplayRating(item.rating, ratingScale).toFixed(1)} / {ratingScale}
              </Text>
              {item.note ? <Text style={styles.recentNote} numberOfLines={2}>{item.note}</Text> : null}
              {item.listNames.length > 0 ? (
                <Text style={styles.recentList} numberOfLines={1}>In lists: {item.listNames.join(', ')}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderDetailView = () => {
    const recentVisits = [...visits]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map(visit => ({
        ...visit,
        placeName: placesById.get(visit.placeId)?.name || 'Unknown place',
      }));

    const recentPlaces = [...places]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);

    return (
      <>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowDetailedView(false)}>
            <MaterialCommunityIcons name="arrow-left" size={28} color={theme.colors.primary} />
          </TouchableOpacity>
          <View style={styles.logoContainer}>
            <Image source={require('../assets/centericon.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} tintColor={theme.colors.primary} />}
        >
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Dashboard Details</Text>
          </View>

          {renderRecentRated()}

          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>Recent Check-Ins</Text>
            {recentVisits.map(visit => (
              <View key={visit.id} style={styles.detailRow}>
                <Text style={styles.detailTitle}>{visit.placeName}</Text>
                <Text style={styles.detailMeta}>{new Date(visit.createdAt).toLocaleDateString()}</Text>
              </View>
            ))}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>Recently Added Places</Text>
            {recentPlaces.map(place => (
              <View key={place.id} style={styles.detailRow}>
                <Text style={styles.detailTitle}>{place.name}</Text>
                <Text style={styles.detailMeta}>{new Date(place.createdAt).toLocaleDateString()}</Text>
              </View>
            ))}
          </View>

          {topRestaurants.length > 0 && (
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Top Restaurants</Text>
              {topRestaurants.map((restaurant, index) => (
                <View key={restaurant.id} style={styles.detailRow}>
                  <Text style={styles.detailTitle}>#{index + 1} {restaurant.name}</Text>
                  <Text style={styles.detailMeta}>{restaurant.count} meals</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </>
    );
  };

  if (showDetailedView) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderDetailView()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <View style={styles.logoContainer}>
          <Image source={require('../assets/centericon.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} tintColor={theme.colors.primary} />}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Dashboard</Text>
        </View>

        {renderTimeRangeToggle()}

        <View style={styles.statsGrid}>
          <TouchableOpacity onPress={() => setShowDetailedView(true)} activeOpacity={0.8}>
            <CircularStatCard value={restaurantsAdded} label="Restaurants Added" sublabel={`This ${timeRange}`} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowDetailedView(true)} activeOpacity={0.8}>
            <CircularStatCard value={checkIns} label="Check-Ins" sublabel={`This ${timeRange}`} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowDetailedView(true)} activeOpacity={0.8}>
            <CircularStatCard
              value={avgScoreDisplay}
              label="Avg Rating"
              sublabel={`This ${timeRange}`}
              progress={count > 0 ? avgScore / INTERNAL_MAX_RATING : 0}
              color={theme.colors.star}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowDetailedView(true)} activeOpacity={0.8}>
            <CircularStatCard value={listsCreated} label="Lists" sublabel="All Time" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowDetailedView(true)} activeOpacity={0.8}>
            <CircularStatCard value={totalCheckIns} label="Total Visits" sublabel="All Time" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowDetailedView(true)} activeOpacity={0.8}>
            <CircularStatCard value={favoriteMeal} label="Favorite Meal" sublabel="All Time" />
          </TouchableOpacity>
        </View>

        {renderRecentRated()}

        {topRestaurants.length > 0 && (
          <TouchableOpacity style={styles.topRestaurantsSection} onPress={() => setShowDetailedView(true)} activeOpacity={0.9}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionTitle}>Top 5 Restaurants</Text>
            {topRestaurants.map((restaurant, index) => (
              <View key={restaurant.id} style={styles.restaurantRow}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>#{index + 1}</Text>
                </View>
                <Text style={styles.restaurantName} numberOfLines={1}>
                  {restaurant.name}
                </Text>
                <Text style={styles.mealCount}>
                  {restaurant.count} {restaurant.count === 1 ? 'meal' : 'meals'}
                </Text>
              </View>
            ))}
          </TouchableOpacity>
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
    width: 32,
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
    width: 160,
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
  recentSection: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  recentImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: theme.spacing.md,
  },
  recentTextContainer: {
    flex: 1,
  },
  recentTitle: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  recentRating: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  recentNote: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  recentList: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    marginTop: 2,
  },
  topRestaurantsSection: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
    opacity: 0.5,
  },
  sectionTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  rankBadge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginRight: theme.spacing.md,
    minWidth: 32,
    alignItems: 'center',
  },
  rankBadgeText: {
    ...theme.typography.caption,
    color: theme.colors.background,
    fontWeight: '700',
  },
  restaurantName: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
    flex: 1,
    marginRight: theme.spacing.md,
  },
  mealCount: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    fontWeight: '400',
  },
  detailSection: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  detailRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadow,
  },
  detailTitle: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  detailMeta: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
