// One search for the map: your saved places first (instant, offline), then new
// places near where the map is looking (Photon). Typing is debounced and stale
// responses are discarded so results never jump around.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import { searchNearby, PlaceSearchResult } from '../lib/maps';
import { searchSaved, searchByCuisine, foodTerm, isFoodResult, fold, distanceSq, SavedSearchContext } from '../lib/foodSearch';
import { searchGoogleText } from '../lib/googleRatings';
import { getAllCategories, getAllDishes, getAllVisits, getAllTags } from '../lib/db';
import { Place } from '../types';

interface PlaceSearchModalProps {
  visible: boolean;
  onClose: () => void;
  /** A new place/area from the web search was chosen. */
  onSelect: (result: PlaceSearchResult) => void;
  /** One of your saved places was chosen. */
  onSelectSaved: (place: Place) => void;
  savedPlaces: Place[];
  /** Bias web results to this point (the map's current center). */
  near?: { latitude: number; longitude: number };
  /** Show every new-place result as pins on the map. */
  onShowAll?: (query: string, results: PlaceSearchResult[]) => void;
}

/** Run a request with its own time limit (also cancelled if the search changes). */
function withTimeout<T>(run: (signal?: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  if (typeof AbortController === 'undefined') return run();
  const c = new AbortController();
  const onAbort = () => c.abort();
  parent?.addEventListener('abort', onAbort);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      c.abort();
      reject(new Error('timeout')); // not an AbortError: counts as a failed source
    }, ms);
    run(c.signal).then(resolve, reject).finally(() => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onAbort);
    });
  });
}

type Row = { type: 'saved'; place: Place; reason?: string } | { type: 'web'; result: PlaceSearchResult };

function iconForType(type?: string): any {
  switch (type) {
    case 'cafe': return 'coffee';
    case 'bar': case 'pub': return 'glass-cocktail';
    case 'fast_food': return 'food';
    case 'bakery': return 'baguette';
    case 'ice_cream': return 'ice-cream';
    case 'restaurant': return 'silverware-fork-knife';
    default: return 'map-marker-outline';
  }
}

export default function PlaceSearchModal({ visible, onClose, onSelect, onSelectSaved, savedPlaces, near, onShowAll }: PlaceSearchModalProps) {
  const [query, setQuery] = useState('');
  // Each source fills in independently, so a slow one never blocks the others.
  const [bySource, setBySource] = useState<{ photon: PlaceSearchResult[]; cuisine: PlaceSearchResult[]; google: PlaceSearchResult[] }>({ photon: [], cuisine: [], google: [] });
  const [isLoading, setIsLoading] = useState(false); // primary (name) search in flight
  const [cuisinePending, setCuisinePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const nearRef = useRef(near);
  const [ctx, setCtx] = useState<SavedSearchContext | null>(null);

  // Freeze the bias point when the sheet opens, and load what saved-place search needs.
  useEffect(() => {
    if (visible) {
      nearRef.current = near;
      Promise.all([getAllCategories(), getAllDishes(), getAllVisits(), getAllTags()]).then(([cats, dishes, visits, tags]) => {
        const catName = new Map(cats.map(c => [c.id, c.name]));
        const placeOfVisit = new Map(visits.map(v => [v.id, v.placeId]));
        const dishesByPlace = new Map<string, { name: string; categoryName?: string }[]>();
        for (const d of dishes) {
          const pid = placeOfVisit.get(d.visitId);
          if (!pid) continue;
          if (!dishesByPlace.has(pid)) dishesByPlace.set(pid, []);
          dishesByPlace.get(pid)!.push({ name: d.name, categoryName: d.categoryId ? catName.get(d.categoryId) : undefined });
        }
        const tagName = new Map(tags.map(t => [t.id, t.name]));
        setCtx({
          categoryName: id => (id ? catName.get(id) : undefined),
          dishesFor: pid => dishesByPlace.get(pid) ?? [],
          tagNames: ids => (ids ?? []).map(i => tagName.get(i)).filter((n): n is string => !!n),
        });
      }).catch(() => setCtx(null));
    } else {
      setQuery('');
      setBySource({ photon: [], cuisine: [], google: [] });
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setBySource({ photon: [], cuisine: [], google: [] });
      setIsLoading(false);
      setCuisinePending(false);
      setError(null);
      return;
    }
    const id = ++requestRef.current;
    const current = () => id === requestRef.current;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const where = nearRef.current;
    const food = !!foodTerm(q) && !!where;
    setBySource({ photon: [], cuisine: [], google: [] });
    setIsLoading(true);
    setCuisinePending(food);
    setError(null);
    let failures = 0;
    const sources = 2 + (food ? 1 : 0);
    const failed = () => {
      failures++;
      if (failures >= sources && current()) setError('Couldn’t search right now. Check your connection.');
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    // Name search + Google: start after a short pause in typing.
    timers.push(setTimeout(() => {
      withTimeout(signal => searchNearby(q, where, signal), 8000, controller?.signal)
        .then(r => { if (current()) setBySource(s => ({ ...s, photon: food ? r.filter(isFoodResult) : r })); })
        .catch(e => { if (e?.name !== 'AbortError') failed(); })
        .finally(() => { if (current()) setIsLoading(false); });
      if (where) {
        withTimeout(signal => searchGoogleText(q, where, signal), 8000, controller?.signal)
          .then(r => { if (current()) setBySource(s => ({ ...s, google: r })); })
          .catch(e => { if (e?.name !== 'AbortError') failed(); });
      }
    }, 300));
    // Cuisine search (OpenStreetMap) is slower: wait until typing has settled, cap the wait.
    if (food) {
      timers.push(setTimeout(() => {
        withTimeout(signal => searchByCuisine(q, where!, signal), 12000, controller?.signal)
          .then(r => { if (current()) setBySource(s => ({ ...s, cuisine: r })); })
          .catch(e => { if (e?.name !== 'AbortError') failed(); })
          .finally(() => { if (current()) setCuisinePending(false); });
      }, 700));
    }
    return () => {
      timers.forEach(clearTimeout);
      controller?.abort();
    };
  }, [query]);

  // Merge sources: Google first (best names), then OSM cuisine, then name search; nearest first.
  const webResults = useMemo(() => {
    const where = nearRef.current;
    const merged: PlaceSearchResult[] = [];
    for (const r of [...bySource.google, ...bySource.cuisine, ...bySource.photon]) {
      const dupe = merged.some(m => fold(m.name) === fold(r.name) && Math.abs(m.latitude - r.latitude) < 0.001 && Math.abs(m.longitude - r.longitude) < 0.001);
      if (!dupe) merged.push(r);
    }
    if (!where) return merged.slice(0, 40);
    const places = merged.filter(r => r.kind === 'place').sort((a, b) => distanceSq(a, where) - distanceSq(b, where));
    return [...places, ...merged.filter(r => r.kind === 'area')].slice(0, 40);
  }, [bySource]);

  const savedMatches = useMemo(() => {
    if (!query.trim()) return [];
    const context: SavedSearchContext = ctx ?? { categoryName: () => undefined, dishesFor: () => [], tagNames: () => [] };
    return searchSaved(query, savedPlaces, context);
  }, [query, savedPlaces, ctx]);

  // Hide web results that are already saved.
  const newResults = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase();
    return webResults.filter(r => !savedPlaces.some(p =>
      norm(p.name) === norm(r.name) && Math.abs(p.latitude - r.latitude) < 0.0005 && Math.abs(p.longitude - r.longitude) < 0.0005
    ));
  }, [webResults, savedPlaces]);

  const sections = [
    ...(savedMatches.length ? [{ title: 'Your places', data: savedMatches.map(m => ({ type: 'saved', place: m.place, reason: m.reason }) as Row) }] : []),
    ...(newResults.length ? [{ title: near ? 'Nearby' : 'Places', data: newResults.map(result => ({ type: 'web', result }) as Row) }] : []),
  ];

  const renderRow = ({ item }: { item: Row }) => {
    if (item.type === 'saved') {
      const p = item.place;
      return (
        <TouchableOpacity style={styles.resultItem} onPress={() => onSelectSaved(p)} activeOpacity={0.7}>
          <View style={[styles.resultIcon, styles.savedIcon]}>
            <MaterialCommunityIcons name="heart" size={16} color="#fff" />
          </View>
          <View style={styles.resultInfo}>
            <Text style={styles.resultName} numberOfLines={1}>{p.name}</Text>
            {item.reason ? (
              <Text style={styles.resultReason} numberOfLines={1}>{item.reason}</Text>
            ) : p.address ? (
              <Text style={styles.resultAddress} numberOfLines={1}>{p.address}</Text>
            ) : null}
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      );
    }
    const r = item.result;
    return (
      <TouchableOpacity style={styles.resultItem} onPress={() => onSelect(r)} activeOpacity={0.7}>
        <View style={styles.resultIcon}>
          <MaterialCommunityIcons name={r.kind === 'area' ? 'map-outline' : iconForType(r.type)} size={18} color={theme.colors.primary} />
        </View>
        <View style={styles.resultInfo}>
          <Text style={styles.resultName} numberOfLines={1}>{r.name}</Text>
          {r.address ? <Text style={styles.resultAddress} numberOfLines={1}>{r.address}</Text> : null}
        </View>
        {r.kind === 'place' ? (
          <MaterialCommunityIcons name="plus-circle-outline" size={22} color={theme.colors.primary} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const q = query.trim();
  let empty: string | null = null;
  if (!q) empty = 'Search your saved places, or find a new restaurant to add.\n\nTip: you can also tap anywhere on the map to drop a pin.';
  else if (q.length >= 2 && !isLoading && !cuisinePending && sections.length === 0) empty = error ?? `No places found for “${q}”.`;
  else if (q.length >= 2 && sections.length === 0) empty = 'Searching…';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search places"
              placeholderTextColor={theme.colors.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search places"
            />
            {isLoading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
            {query && !isLoading ? (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {empty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{empty}</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => (item.type === 'saved' ? `s-${item.place.id}` : `w-${item.result.id}`)}
            renderItem={renderRow}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>{section.title}</Text>
                {section.title !== 'Your places' && onShowAll && newResults.filter(r => r.kind === 'place').length >= 2 ? (
                  <TouchableOpacity
                    onPress={() => onShowAll(query.trim(), newResults.filter(r => r.kind === 'place'))}
                    style={styles.showAll}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name="map-marker-multiple" size={16} color={theme.colors.primary} />
                    <Text style={styles.showAllText}>Show all on map</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            ListFooterComponent={cuisinePending ? (
              <View style={styles.moreRow}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                <Text style={styles.moreText}>Looking for more nearby…</Text>
              </View>
            ) : null}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  searchContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECEAE6',
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    height: 40,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0, // let the field shrink on web so the clear button doesn't overlap Cancel
    ...theme.typography.body,
    color: theme.colors.text,
    paddingVertical: 0,
    outlineStyle: 'none',
  } as any,
  cancelButton: {
    paddingVertical: theme.spacing.sm,
  },
  cancelText: {
    ...theme.typography.body,
    color: theme.colors.primary,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  moreText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingRight: theme.spacing.lg,
  },
  showAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: theme.spacing.sm,
  },
  showAllText: {
    ...theme.typography.bodySmall,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  resultReason: {
    ...theme.typography.bodySmall,
    color: theme.colors.primary,
    marginTop: 2,
  },
  sectionHeader: {
    ...theme.typography.bodySmall,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FCE8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedIcon: {
    backgroundColor: theme.colors.primary,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  resultAddress: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
