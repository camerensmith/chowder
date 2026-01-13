// Background sync service for Chowder
// Monitors network connectivity and syncs unsynced items to backend

import { Platform } from 'react-native';
import * as api from './api';
import * as auth from './auth';
import * as db from './db';
import * as indexedDB from './indexeddb';
import { Place, List, Visit, Dish, Category, Tag, Author } from '../types';

const SYNC_INTERVAL = 30000; // 30 seconds
let syncIntervalId: NodeJS.Timeout | null = null;
let isSyncing = false;

// Get all unsynced items from database
async function getAllUnsyncedItems(): Promise<{
  places: Place[];
  lists: List[];
  visits: Visit[];
  dishes: Dish[];
  categories: Category[];
  tags: Tag[];
  author: Author | null;
}> {
  if (Platform.OS === 'web') {
    return {
      places: await indexedDB.getAllUnsynced<Place>('places'),
      lists: await indexedDB.getAllUnsynced<List>('lists'),
      visits: await indexedDB.getAllUnsynced<Visit>('visits'),
      dishes: await indexedDB.getAllUnsynced<Dish>('dishes'),
      categories: await indexedDB.getAllUnsynced<Category>('categories'),
      tags: await indexedDB.getAllUnsynced<Tag>('tags'),
      author: (await indexedDB.getAllUnsynced<Author>('author'))[0] || null,
    };
  }

  // For SQLite, query unsynced items
  const places = await db.getAllPlaces();
  const lists = await db.getAllLists();
  const visits = await db.getAllVisits();
  const dishes = await db.getAllDishes();
  const categories = await db.getAllCategories();
  const tags = await db.getAllTags();
  const author = await db.getAuthor();

  return {
    places: places.filter(p => !p.synced),
    lists: lists.filter(l => !l.synced),
    visits: visits.filter((v: Visit) => !v.synced),
    dishes: dishes.filter((d: Dish) => !d.synced),
    categories: categories.filter((c: Category) => !c.synced),
    tags: tags.filter(t => !t.synced),
    author: author && !author.synced ? author : null,
  };
}

// Sync a single place
async function syncPlace(place: Place): Promise<void> {
  try {
    if (place.apiId) {
      // Update existing place
      await api.put(`/api/places/${place.apiId}`, {
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        categoryId: place.categoryId,
        notes: place.notes,
        overallRatingManual: place.overallRatingManual,
        ratingMode: place.ratingMode,
        coverImageUri: place.coverImageUri,
      });
    } else {
      // Create new place
      const response = await api.post('/api/places', {
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        categoryId: place.categoryId,
        notes: place.notes,
        overallRatingManual: place.overallRatingManual,
        ratingMode: place.ratingMode,
        coverImageUri: place.coverImageUri,
      });
      place.apiId = response.id;
    }

    // Mark as synced
    const lastSyncedAt = Date.now();
    await db.markPlaceAsSynced(place.id, place.apiId!, lastSyncedAt);
  } catch (error) {
    console.error('Failed to sync place:', error);
    throw error;
  }
}

// Sync a single list
async function syncList(list: List): Promise<void> {
  try {
    if (list.apiId) {
      await api.put(`/api/lists/${list.apiId}`, {
        name: list.name,
        description: list.description,
        category: list.category,
        city: list.city,
      });
    } else {
      const response = await api.post('/api/lists', {
        name: list.name,
        description: list.description,
        category: list.category,
        city: list.city,
      });
      list.apiId = response.id;
    }

    // Mark as synced
    const lastSyncedAt = Date.now();
    await db.markListAsSynced(list.id, list.apiId!, lastSyncedAt);
  } catch (error) {
    console.error('Failed to sync list:', error);
    throw error;
  }
}

// Sync a single visit
async function syncVisit(visit: Visit): Promise<void> {
  try {
    if (visit.apiId) {
      await api.put(`/api/visits/${visit.apiId}`, {
        placeId: visit.placeId,
        notes: visit.notes,
        photoUri: visit.photoUri,
      });
    } else {
      const response = await api.post('/api/visits', {
        placeId: visit.placeId,
        notes: visit.notes,
        photoUri: visit.photoUri,
      });
      visit.apiId = response.id;
    }

    // Mark as synced
    const lastSyncedAt = Date.now();
    await db.markVisitAsSynced(visit.id, visit.apiId!, lastSyncedAt);
  } catch (error) {
    console.error('Failed to sync visit:', error);
    throw error;
  }
}

// Sync a single dish
async function syncDish(dish: Dish): Promise<void> {
  try {
    if (dish.apiId) {
      await api.put(`/api/dishes/${dish.apiId}`, {
        visitId: dish.visitId,
        name: dish.name,
        categoryId: dish.categoryId,
        rating: dish.rating,
        notes: dish.notes,
        photoUri: dish.photoUri,
      });
    } else {
      const response = await api.post('/api/dishes', {
        visitId: dish.visitId,
        name: dish.name,
        categoryId: dish.categoryId,
        rating: dish.rating,
        notes: dish.notes,
        photoUri: dish.photoUri,
      });
      dish.apiId = response.id;
    }

    // Mark as synced
    const lastSyncedAt = Date.now();
    await db.markDishAsSynced(dish.id, dish.apiId!, lastSyncedAt);
  } catch (error) {
    console.error('Failed to sync dish:', error);
    throw error;
  }
}

// Sync a single category
async function syncCategory(category: Category): Promise<void> {
  try {
    if (category.apiId) {
      await api.put(`/api/categories/${category.apiId}`, {
        name: category.name,
        type: category.type,
        parentId: category.parentId,
        order: category.order,
      });
    } else {
      const response = await api.post('/api/categories', {
        name: category.name,
        type: category.type,
        parentId: category.parentId,
        order: category.order,
      });
      category.apiId = response.id;
    }

    // Mark as synced
    await db.markCategoryAsSynced(category.id, category.apiId!);
  } catch (error) {
    console.error('Failed to sync category:', error);
    throw error;
  }
}

// Sync a single tag
async function syncTag(tag: Tag): Promise<void> {
  try {
    if (tag.apiId) {
      await api.put(`/api/tags/${tag.apiId}`, {
        name: tag.name,
        color: tag.color,
      });
    } else {
      const response = await api.post('/api/tags', {
        name: tag.name,
        color: tag.color,
      });
      tag.apiId = response.id;
    }

    // Mark as synced
    await db.markTagAsSynced(tag.id, tag.apiId!);
  } catch (error) {
    console.error('Failed to sync tag:', error);
    throw error;
  }
}

// Sync author
async function syncAuthor(author: Author): Promise<void> {
  try {
    if (author.apiId) {
      await api.put(`/api/user/profile`, {
        displayName: author.displayName,
        avatarUri: author.avatarUri,
        email: author.email,
      });
    } else {
      const response = await api.put('/api/user/profile', {
        displayName: author.displayName,
        avatarUri: author.avatarUri,
        email: author.email,
      });
      author.apiId = response.id;
    }

    // Mark as synced
    await db.markAuthorAsSynced(author.id, author.apiId!);
  } catch (error) {
    console.error('Failed to sync author:', error);
    throw error;
  }
}

// Perform sync of all unsynced items
export async function performSync(): Promise<void> {
  if (isSyncing) {
    console.log('Sync already in progress, skipping...');
    return;
  }

  // Check if authenticated
  const authenticated = await auth.isAuthenticated();
  if (!authenticated) {
    console.log('Not authenticated, skipping sync');
    return;
  }

  // Check if online
  if (!api.checkOnline()) {
    console.log('Device is offline, skipping sync');
    return;
  }

  isSyncing = true;
  console.log('Starting sync...');

  try {
    const unsynced = await getAllUnsyncedItems();

    // Sync in order: author, places, lists, visits, dishes, categories, tags
    if (unsynced.author) {
      await syncAuthor(unsynced.author);
    }

    for (const place of unsynced.places) {
      try {
        await syncPlace(place);
      } catch (error) {
        console.error(`Failed to sync place ${place.id}:`, error);
      }
    }

    for (const list of unsynced.lists) {
      try {
        await syncList(list);
      } catch (error) {
        console.error(`Failed to sync list ${list.id}:`, error);
      }
    }

    for (const visit of unsynced.visits) {
      try {
        await syncVisit(visit);
      } catch (error) {
        console.error(`Failed to sync visit ${visit.id}:`, error);
      }
    }

    for (const dish of unsynced.dishes) {
      try {
        await syncDish(dish);
      } catch (error) {
        console.error(`Failed to sync dish ${dish.id}:`, error);
      }
    }

    for (const category of unsynced.categories) {
      try {
        await syncCategory(category);
      } catch (error) {
        console.error(`Failed to sync category ${category.id}:`, error);
      }
    }

    for (const tag of unsynced.tags) {
      try {
        await syncTag(tag);
      } catch (error) {
        console.error(`Failed to sync tag ${tag.id}:`, error);
      }
    }

    console.log('Sync completed successfully');
  } catch (error) {
    console.error('Sync failed:', error);
  } finally {
    isSyncing = false;
  }
}

// Start background sync service
export function startSyncService(): void {
  if (syncIntervalId) {
    console.log('Sync service already running');
    return;
  }

  console.log('Starting sync service...');
  
  // Perform initial sync
  performSync();

  // Set up interval for periodic sync
  syncIntervalId = setInterval(() => {
    performSync();
  }, SYNC_INTERVAL);

  // Listen for online events (web only)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('Device came online, triggering sync');
      performSync();
    });
  }
}

// Stop background sync service
export function stopSyncService(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('Sync service stopped');
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.removeEventListener('online', performSync);
  }
}

// Manual sync trigger
export async function triggerSync(): Promise<void> {
  await performSync();
}
