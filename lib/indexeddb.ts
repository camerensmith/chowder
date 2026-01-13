// IndexedDB wrapper for web platform
// Provides CRUD operations with sync flag management

import { Author, Place, List, ListItem, Visit, Dish, Category, Tag } from '../types';

const DB_NAME = 'chowder_db';
const DB_VERSION = 3;

let db: IDBDatabase | null = null;

// Object store names
const STORES = {
  author: 'author',
  places: 'places',
  lists: 'lists',
  listItems: 'list_items',
  visits: 'visits',
  dishes: 'dishes',
  categories: 'categories',
  tags: 'tags',
  placeTags: 'place_tags',
} as const;

// Initialize IndexedDB
export async function openDatabase(): Promise<IDBDatabase> {
  if (db) return db;

  // Get indexedDB from global scope
  const idb = typeof window !== 'undefined' ? window.indexedDB : (globalThis as any).indexedDB;
  if (!idb) {
    throw new Error('IndexedDB is not available in this environment. This might be due to browser privacy settings or running in private/incognito mode.');
  }

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);
    
    // Set a timeout to detect if IndexedDB is blocked
    const timeout = setTimeout(() => {
      reject(new Error('IndexedDB request timed out. This might indicate that IndexedDB is blocked by browser settings.'));
    }, 5000);

    request.onerror = (event) => {
      clearTimeout(timeout);
      const error = (event.target as IDBOpenDBRequest).error;
      const errorMessage = error?.message || 'Unknown error';
      reject(new Error(`Failed to open IndexedDB: ${errorMessage}. This might be due to browser privacy settings, storage quota exceeded, or database corruption.`));
    };

    request.onsuccess = () => {
      clearTimeout(timeout);
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      // Handle upgrade errors
      database.onerror = (e) => {
        console.error('IndexedDB upgrade error:', e);
      };

      // Create object stores if they don't exist
      if (!database.objectStoreNames.contains(STORES.author)) {
        const authorStore = database.createObjectStore(STORES.author, { keyPath: 'id' });
        authorStore.createIndex('apiId', 'apiId', { unique: false });
        authorStore.createIndex('synced', 'synced', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.places)) {
        const placesStore = database.createObjectStore(STORES.places, { keyPath: 'id' });
        placesStore.createIndex('apiId', 'apiId', { unique: false });
        placesStore.createIndex('synced', 'synced', { unique: false });
        placesStore.createIndex('userId', 'userId', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.lists)) {
        const listsStore = database.createObjectStore(STORES.lists, { keyPath: 'id' });
        listsStore.createIndex('apiId', 'apiId', { unique: false });
        listsStore.createIndex('synced', 'synced', { unique: false });
        listsStore.createIndex('userId', 'userId', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.listItems)) {
        const listItemsStore = database.createObjectStore(STORES.listItems, { keyPath: 'id' });
        listItemsStore.createIndex('listId', 'listId', { unique: false });
        listItemsStore.createIndex('placeId', 'placeId', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.visits)) {
        const visitsStore = database.createObjectStore(STORES.visits, { keyPath: 'id' });
        visitsStore.createIndex('placeId', 'placeId', { unique: false });
        visitsStore.createIndex('apiId', 'apiId', { unique: false });
        visitsStore.createIndex('synced', 'synced', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.dishes)) {
        const dishesStore = database.createObjectStore(STORES.dishes, { keyPath: 'id' });
        dishesStore.createIndex('visitId', 'visitId', { unique: false });
        dishesStore.createIndex('apiId', 'apiId', { unique: false });
        dishesStore.createIndex('synced', 'synced', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.categories)) {
        const categoriesStore = database.createObjectStore(STORES.categories, { keyPath: 'id' });
        categoriesStore.createIndex('type', 'type', { unique: false });
        categoriesStore.createIndex('apiId', 'apiId', { unique: false });
        categoriesStore.createIndex('synced', 'synced', { unique: false });
        categoriesStore.createIndex('userId', 'userId', { unique: false });
      } else {
        // Store exists, check if we need to add the 'type' index
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        if (transaction) {
          const categoriesStore = transaction.objectStore(STORES.categories);
          if (categoriesStore && !categoriesStore.indexNames.contains('type')) {
            categoriesStore.createIndex('type', 'type', { unique: false });
          }
        }
      }

      if (!database.objectStoreNames.contains(STORES.tags)) {
        const tagsStore = database.createObjectStore(STORES.tags, { keyPath: 'id' });
        tagsStore.createIndex('name', 'name', { unique: true });
        tagsStore.createIndex('apiId', 'apiId', { unique: false });
        tagsStore.createIndex('synced', 'synced', { unique: false });
        tagsStore.createIndex('userId', 'userId', { unique: false });
      }

      if (!database.objectStoreNames.contains(STORES.placeTags)) {
        const placeTagsStore = database.createObjectStore(STORES.placeTags, { keyPath: ['placeId', 'tagId'] });
        placeTagsStore.createIndex('placeId', 'placeId', { unique: false });
        placeTagsStore.createIndex('tagId', 'tagId', { unique: false });
      }
    };
  });
}

// Generate UUID for offline-created items
export function generateUUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Generic CRUD operations
async function get<T>(storeName: string, id: string): Promise<T | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error(`Failed to get ${storeName} with id ${id}`));
    };
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error(`Failed to get all ${storeName}`));
    };
  });
}

async function put<T>(storeName: string, item: T): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to put ${storeName}`));
    };
  });
}

async function remove(storeName: string, id: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to delete ${storeName} with id ${id}`));
    };
  });
}

async function queryByIndex<T>(storeName: string, indexName: string, value: any): Promise<T[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(new Error(`Failed to query ${storeName} by ${indexName}`));
    };
  });
}

// Get all unsynced items
export async function getAllUnsynced<T extends { synced: boolean }>(storeName: string): Promise<T[]> {
  return queryByIndex<T>(storeName, 'synced', false);
}

// Mark item as synced
export async function markAsSynced<T extends { id: string; apiId?: string; synced: boolean; lastSyncedAt?: number }>(
  storeName: string,
  localId: string,
  apiId: string
): Promise<void> {
  const item = await get<T>(storeName, localId);
  if (!item) {
    throw new Error(`Item not found: ${localId}`);
  }
  item.apiId = apiId;
  item.synced = true;
  item.lastSyncedAt = Date.now();
  await put(storeName, item);
}

// Author operations
export async function getAuthor(): Promise<Author | null> {
  const authors = await getAll<Author>(STORES.author);
  return authors[0] || null;
}

export async function putAuthor(author: Author): Promise<void> {
  await put(STORES.author, author);
}

// Place operations
export async function getPlace(placeId: string): Promise<Place | null> {
  return get<Place>(STORES.places, placeId);
}

export async function getAllPlaces(): Promise<Place[]> {
  return getAll<Place>(STORES.places);
}

export async function putPlace(place: Place): Promise<void> {
  await put(STORES.places, place);
}

export async function deletePlace(placeId: string): Promise<void> {
  await remove(STORES.places, placeId);
}

// List operations
export async function getList(listId: string): Promise<List | null> {
  return get<List>(STORES.lists, listId);
}

export async function getAllLists(): Promise<List[]> {
  return getAll<List>(STORES.lists);
}

export async function putList(list: List): Promise<void> {
  await put(STORES.lists, list);
}

export async function deleteList(listId: string): Promise<void> {
  await remove(STORES.lists, listId);
}

// ListItem operations
export async function getListItems(listId: string): Promise<ListItem[]> {
  return queryByIndex<ListItem>(STORES.listItems, 'listId', listId);
}

export async function getAllListItems(): Promise<ListItem[]> {
  return getAll<ListItem>(STORES.listItems);
}

export async function putListItem(item: ListItem): Promise<void> {
  await put(STORES.listItems, item);
}

export async function deleteListItem(itemId: string): Promise<void> {
  await remove(STORES.listItems, itemId);
}

// Visit operations
export async function getVisit(visitId: string): Promise<Visit | null> {
  return get<Visit>(STORES.visits, visitId);
}

export async function getVisitsForPlace(placeId: string): Promise<Visit[]> {
  return queryByIndex<Visit>(STORES.visits, 'placeId', placeId);
}

export async function getAllVisits(): Promise<Visit[]> {
  return getAll<Visit>(STORES.visits);
}

export async function putVisit(visit: Visit): Promise<void> {
  await put(STORES.visits, visit);
}

export async function deleteVisit(visitId: string): Promise<void> {
  await remove(STORES.visits, visitId);
}

// Dish operations
export async function getDish(dishId: string): Promise<Dish | null> {
  return get<Dish>(STORES.dishes, dishId);
}

export async function getDishesForVisit(visitId: string): Promise<Dish[]> {
  return queryByIndex<Dish>(STORES.dishes, 'visitId', visitId);
}

export async function getAllDishes(): Promise<Dish[]> {
  return getAll<Dish>(STORES.dishes);
}

export async function putDish(dish: Dish): Promise<void> {
  await put(STORES.dishes, dish);
}

export async function deleteDish(dishId: string): Promise<void> {
  await remove(STORES.dishes, dishId);
}

// Category operations
export async function getCategory(categoryId: string): Promise<Category | null> {
  return get<Category>(STORES.categories, categoryId);
}

export async function getCategoriesByType(type: 'place' | 'dish'): Promise<Category[]> {
  return queryByIndex<Category>(STORES.categories, 'type', type);
}

export async function getAllCategories(): Promise<Category[]> {
  return getAll<Category>(STORES.categories);
}

export async function putCategory(category: Category): Promise<void> {
  await put(STORES.categories, category);
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await remove(STORES.categories, categoryId);
}

// Tag operations
export async function getTag(tagId: string): Promise<Tag | null> {
  return get<Tag>(STORES.tags, tagId);
}

export async function getAllTags(): Promise<Tag[]> {
  return getAll<Tag>(STORES.tags);
}

export async function putTag(tag: Tag): Promise<void> {
  await put(STORES.tags, tag);
}

export async function deleteTag(tagId: string): Promise<void> {
  await remove(STORES.tags, tagId);
}

// Place-Tag relationship operations
export async function getPlaceTags(placeId: string): Promise<string[]> {
  const placeTags = await queryByIndex<{ placeId: string; tagId: string }>(STORES.placeTags, 'placeId', placeId);
  return placeTags.map(pt => pt.tagId);
}

export async function addTagToPlace(placeId: string, tagId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.placeTags], 'readwrite');
    const store = transaction.objectStore(STORES.placeTags);
    const request = store.put({ placeId, tagId });

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to add tag to place`));
    };
  });
}

export async function removeTagFromPlace(placeId: string, tagId: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.placeTags], 'readwrite');
    const store = transaction.objectStore(STORES.placeTags);
    const request = store.delete([placeId, tagId]);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error(`Failed to remove tag from place`));
    };
  });
}
