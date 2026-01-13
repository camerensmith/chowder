// Local database for Chowder
// Supports SQLite (native) and IndexedDB (web) with sync capabilities

import { Platform } from 'react-native';
import { Author, Place, List, ListItem, Visit, Dish, Category, Tag, PlaceTag } from '../types';
import * as indexedDB from './indexeddb';

// Helper function to safely access localStorage (web only)
function getLocalStorage(): any {
  if (Platform.OS === 'web' && typeof globalThis !== 'undefined') {
    try {
      return (globalThis as any).localStorage;
    } catch {
      return null;
    }
  }
  return null;
}

// Only import SQLite on native platforms
let SQLite: typeof import('expo-sqlite') | null = null;
if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
}

// Type for SQLite database - using any to avoid strict type checking issues with expo-sqlite
type SQLiteDatabase = any;
let db: SQLiteDatabase | null = null;

// Initialize database
export async function initializeDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('📦 Initializing IndexedDB for web platform');
    await indexedDB.openDatabase();
    // Initialize default categories after database is open
    await initializeDefaultCategories();
    return;
  }

  if (!SQLite) {
    throw new Error('SQLite module not available on this platform');
  }

  try {
    db = await SQLite.openDatabaseAsync('chowder.db');
    
    // Drop and recreate list_items table if it exists with old schema (to fix 'order' column issue)
    try {
      await db.execAsync('DROP TABLE IF EXISTS list_items;');
    } catch (e) {
      // Ignore errors if table doesn't exist
    }
    
    await db.execAsync(`
      -- Author table (local profile)
      CREATE TABLE IF NOT EXISTS author (
        id TEXT PRIMARY KEY,
        displayName TEXT NOT NULL,
        avatarUri TEXT,
        email TEXT,
        apiId TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        userId TEXT,
        createdAt INTEGER NOT NULL
      );

      -- Places table
      CREATE TABLE IF NOT EXISTS places (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        categoryId TEXT,
        notes TEXT,
        overallRatingManual REAL,
        ratingMode TEXT CHECK(ratingMode IN ('aggregate', 'overall')),
        coverImageUri TEXT,
        apiId TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        lastSyncedAt INTEGER,
        userId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      -- Lists table
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        city TEXT,
        apiId TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        lastSyncedAt INTEGER,
        userId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      -- List items (join table) - using square brackets for 'order' column (reserved keyword)
      CREATE TABLE IF NOT EXISTS list_items (
        id TEXT PRIMARY KEY,
        listId TEXT NOT NULL,
        placeId TEXT NOT NULL,
        [order] INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(listId) REFERENCES lists(id) ON DELETE CASCADE,
        FOREIGN KEY(placeId) REFERENCES places(id) ON DELETE CASCADE
      );

      -- Visits table
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        placeId TEXT NOT NULL,
        notes TEXT,
        photoUri TEXT,
        apiId TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        lastSyncedAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(placeId) REFERENCES places(id) ON DELETE CASCADE
      );

      -- Dishes table
      CREATE TABLE IF NOT EXISTS dishes (
        id TEXT PRIMARY KEY,
        visitId TEXT NOT NULL,
        name TEXT NOT NULL,
        categoryId TEXT,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        notes TEXT,
        photoUri TEXT,
        apiId TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        lastSyncedAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(visitId) REFERENCES visits(id) ON DELETE CASCADE
      );

      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('place', 'dish')),
        parentId TEXT,
        orderIndex INTEGER DEFAULT 0,
        apiId TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        userId TEXT,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(parentId) REFERENCES categories(id) ON DELETE SET NULL
      );

      -- Tags table
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        apiId TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        userId TEXT,
        createdAt INTEGER NOT NULL
      );

      -- Place tags join table
      CREATE TABLE IF NOT EXISTS place_tags (
        placeId TEXT NOT NULL,
        tagId TEXT NOT NULL,
        PRIMARY KEY (placeId, tagId),
        FOREIGN KEY(placeId) REFERENCES places(id) ON DELETE CASCADE,
        FOREIGN KEY(tagId) REFERENCES tags(id) ON DELETE CASCADE
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_list_items_listId ON list_items(listId);
      CREATE INDEX IF NOT EXISTS idx_list_items_placeId ON list_items(placeId);
      CREATE INDEX IF NOT EXISTS idx_visits_placeId ON visits(placeId);
      CREATE INDEX IF NOT EXISTS idx_dishes_visitId ON dishes(visitId);
    `);

    // Migration: Add coverImageUri column to places table if it doesn't exist
    try {
      await db.execAsync('ALTER TABLE places ADD COLUMN coverImageUri TEXT;');
    } catch (e: any) {
      // Column already exists, ignore error
      if (!e.message?.includes('duplicate column')) {
        console.warn('Migration warning:', e);
      }
    }

    // Migration: Remove rating column from visits table if it exists
    try {
      await db.execAsync('ALTER TABLE visits DROP COLUMN rating;');
    } catch (e: any) {
      // Column doesn't exist or already removed, ignore error
      if (!e.message?.includes('no such column')) {
        console.warn('Migration warning:', e);
      }
    }

    // Migration: Add sync fields to existing tables
    const syncMigrations = [
      { table: 'author', columns: ['email TEXT', 'apiId TEXT', 'synced INTEGER NOT NULL DEFAULT 0', 'userId TEXT'] },
      { table: 'places', columns: ['apiId TEXT', 'synced INTEGER NOT NULL DEFAULT 0', 'lastSyncedAt INTEGER', 'userId TEXT'] },
      { table: 'lists', columns: ['apiId TEXT', 'synced INTEGER NOT NULL DEFAULT 0', 'lastSyncedAt INTEGER', 'userId TEXT'] },
      { table: 'visits', columns: ['apiId TEXT', 'synced INTEGER NOT NULL DEFAULT 0', 'lastSyncedAt INTEGER'] },
      { table: 'dishes', columns: ['apiId TEXT', 'synced INTEGER NOT NULL DEFAULT 0', 'lastSyncedAt INTEGER'] },
      { table: 'categories', columns: ['apiId TEXT', 'synced INTEGER NOT NULL DEFAULT 0', 'userId TEXT'] },
      { table: 'tags', columns: ['apiId TEXT', 'synced INTEGER NOT NULL DEFAULT 0', 'userId TEXT'] },
    ];

    for (const migration of syncMigrations) {
      for (const column of migration.columns) {
        try {
          await db.execAsync(`ALTER TABLE ${migration.table} ADD COLUMN ${column};`);
        } catch (e: any) {
          // Column already exists, ignore error
          if (!e.message?.includes('duplicate column')) {
            console.warn(`Migration warning for ${migration.table}.${column}:`, e);
          }
        }
      }
    }

    console.log('✅ Database initialized');
    
    // Initialize default categories if they don't exist (already done for web above)
    await initializeDefaultCategories();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Initialize default place categories
export async function initializeDefaultCategories(): Promise<void> {
  const defaultCategories = [
    'Cantonese',
    'Sichuan',
    'Chinese (General)',
    'Japanese (general)',
    'Thai (General)',
    'Vietnamese (General)',
    'Pho',
    'Ramen',
    'Indian (General)',
    'Bengali',
    'Halal',
    'Kosher',
    'Italian (General)',
    'Pizza',
    'Bagels',
  ];

  try {
    if (Platform.OS === 'web') {
      const existing = await getAllCategories();
      const existingNames = new Set(existing.map(c => c.name));
      
      for (let i = 0; i < defaultCategories.length; i++) {
        const name = defaultCategories[i];
        if (!existingNames.has(name)) {
          const category: Category = {
            id: generateId(),
            name,
            type: 'place',
            order: i,
            apiId: undefined,
            synced: false,
            createdAt: Date.now(),
          };
          await indexedDB.putCategory(category);
        }
      }
      return;
    }

    if (!db) return;

    // Check which categories already exist
    const existing = (await db.getAllAsync('SELECT * FROM categories WHERE type = ?', ['place'])) as Category[];
    const existingNames = new Set(existing.map((c: Category) => c.name));

    // Insert missing default categories
    for (let i = 0; i < defaultCategories.length; i++) {
      const name = defaultCategories[i];
      if (!existingNames.has(name)) {
        await db.runAsync(
          'INSERT INTO categories (id, name, type, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?)',
          [generateId(), name, 'place', i, Date.now()]
        );
      }
    }
  } catch (error) {
    console.error('Failed to initialize default categories:', error);
  }
}

// Helper to generate IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ===== AUTHOR QUERIES =====

export async function getAuthor(): Promise<Author | null> {
  if (Platform.OS === 'web') {
    return indexedDB.getAuthor();
  }
  
  if (!db) throw new Error('Database not initialized');
  const result = await db.getFirstAsync('SELECT * FROM author LIMIT 1') as any;
  if (!result) return null;
  return {
    ...result,
    synced: Boolean(result.synced),
  } as Author;
}

export async function createAuthor(displayName: string, avatarUri?: string, email?: string, userId?: string): Promise<Author> {
  const id = generateId();
  const now = Date.now();
  const author: Author = { 
    id, 
    displayName, 
    avatarUri, 
    email,
    apiId: undefined,
    synced: false,
    userId,
    createdAt: now 
  };

  if (Platform.OS === 'web') {
    await indexedDB.putAuthor(author);
    return author;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO author (id, displayName, avatarUri, email, apiId, synced, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, displayName, avatarUri || null, email || null, null, 0, userId || null, now]
  );
  return author;
}

// Mark author as synced (internal use for sync service)
export async function markAuthorAsSynced(authorId: string, apiId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const author = await indexedDB.getAuthor();
    if (author && author.id === authorId) {
      author.apiId = apiId;
      author.synced = true;
      await indexedDB.putAuthor(author);
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    await db.runAsync(
      'UPDATE author SET apiId = ?, synced = ? WHERE id = ?',
      [apiId, 1, authorId]
    );
  }
}

export async function updateAuthor(updates: Partial<Pick<Author, 'displayName' | 'avatarUri' | 'email'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const author = await getAuthor();
    if (!author) throw new Error('Author not found');
    const updated = { ...author, ...updates, synced: false };
    await indexedDB.putAuthor(updated);
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), 0]; // Set synced to false
  await db.runAsync(`UPDATE author SET ${fields}, synced = ?`, values);
}

// ===== PLACE QUERIES =====

export async function createPlace(
  name: string,
  latitude: number,
  longitude: number,
  address?: string,
  categoryId?: string,
  notes?: string,
  userId?: string
): Promise<Place> {
  const id = generateId();
  const now = Date.now();
  const place: Place = { 
    id, 
    name, 
    address, 
    latitude, 
    longitude, 
    categoryId, 
    notes, 
    ratingMode: 'overall', 
    apiId: undefined,
    synced: false,
    userId,
    createdAt: now, 
    updatedAt: now 
  };

  if (Platform.OS === 'web') {
    await indexedDB.putPlace(place);
    return place;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO places (id, name, address, latitude, longitude, categoryId, notes, overallRatingManual, ratingMode, coverImageUri, apiId, synced, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, address || null, latitude, longitude, categoryId || null, notes || null, null, 'overall', null, null, 0, userId || null, now, now]
  );
  return place;
}

export async function getAllPlaces(): Promise<Place[]> {
  if (Platform.OS === 'web') {
    const places = await indexedDB.getAllPlaces();
    // Load tagIds for each place
    for (const place of places) {
      place.tagIds = await getPlaceTags(place.id);
    }
    return places.sort((a, b) => b.createdAt - a.createdAt);
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync('SELECT * FROM places ORDER BY createdAt DESC') as any[];
  return results.map(r => ({
    ...r,
    synced: Boolean(r.synced),
  })) as Place[];
}

export async function getPlace(placeId: string): Promise<Place | null> {
  if (Platform.OS === 'web') {
    const place = await indexedDB.getPlace(placeId);
    if (place) {
      place.tagIds = await getPlaceTags(placeId);
    }
    return place;
  }

  if (!db) throw new Error('Database not initialized');
  const result = await db.getFirstAsync('SELECT * FROM places WHERE id = ?', [placeId]) as any;
  if (!result) return null;
  const place: Place = {
    ...result,
    synced: Boolean(result.synced),
  };
  place.tagIds = await getPlaceTags(placeId);
  return place;
}

export async function updatePlace(placeId: string, updates: Partial<Pick<Place, 'name' | 'address' | 'categoryId' | 'notes' | 'overallRatingManual' | 'ratingMode' | 'coverImageUri'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const place = await indexedDB.getPlace(placeId);
    if (!place) throw new Error('Place not found');
    const updated = { ...place, ...updates, synced: false, updatedAt: Date.now() };
    await indexedDB.putPlace(updated);
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), 0, Date.now(), placeId]; // Set synced to false
  await db.runAsync(`UPDATE places SET ${fields}, synced = ?, updatedAt = ? WHERE id = ?`, values);
}

// Mark place as synced (internal use for sync service)
export async function markPlaceAsSynced(placeId: string, apiId: string, lastSyncedAt: number): Promise<void> {
  if (Platform.OS === 'web') {
    const place = await indexedDB.getPlace(placeId);
    if (place) {
      place.apiId = apiId;
      place.synced = true;
      place.lastSyncedAt = lastSyncedAt;
      await indexedDB.putPlace(place);
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    await db.runAsync(
      'UPDATE places SET apiId = ?, synced = ?, lastSyncedAt = ? WHERE id = ?',
      [apiId, 1, lastSyncedAt, placeId]
    );
  }
}

export async function deletePlace(placeId: string): Promise<void> {
  if (Platform.OS === 'web') {
    await indexedDB.deletePlace(placeId);
    // Also remove list items and visits (cascade handled by sync service)
    const listItems = await indexedDB.getAllListItems();
    for (const item of listItems.filter(li => li.placeId === placeId)) {
      await indexedDB.deleteListItem(item.id);
    }
    const visits = await indexedDB.getAllVisits();
    for (const visit of visits.filter(v => v.placeId === placeId)) {
      await indexedDB.deleteVisit(visit.id);
    }
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM places WHERE id = ?', [placeId]);
}

// ===== LIST QUERIES =====

export async function createList(name: string, description?: string, category?: string, city?: string, userId?: string): Promise<List> {
  const id = generateId();
  const now = Date.now();
  const list: List = { 
    id, 
    name, 
    description, 
    category, 
    city, 
    apiId: undefined,
    synced: false,
    userId,
    createdAt: now, 
    updatedAt: now 
  };

  if (Platform.OS === 'web') {
    await indexedDB.putList(list);
    return list;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO lists (id, name, description, category, city, apiId, synced, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, description || null, category || null, city || null, null, 0, userId || null, now, now]
  );
  return list;
}

export async function getAllLists(): Promise<List[]> {
  if (Platform.OS === 'web') {
    const lists = await indexedDB.getAllLists();
    // Calculate ratings from places
    const places = await getAllPlaces();
    const listItems = await indexedDB.getAllListItems();
    lists.forEach(list => {
      const items = listItems.filter(li => li.listId === list.id);
      const listPlaces = items.map(li => places.find(p => p.id === li.placeId)).filter(Boolean) as Place[];
      if (listPlaces.length > 0 && listPlaces.some(p => p.overallRating)) {
        const ratings = listPlaces.map(p => p.overallRating || 0).filter(r => r > 0);
        if (ratings.length > 0) {
          list.overallRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
        }
      }
    });
    return lists.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync('SELECT * FROM lists ORDER BY updatedAt DESC') as any[];
  const lists = results.map(r => ({
    ...r,
    synced: Boolean(r.synced),
  })) as List[];
  // Calculate ratings
  for (const list of lists) {
    const items = await getListItems(list.id);
    if (items.length > 0) {
      const placeIds = items.map((li: ListItem) => li.placeId);
      const places = await Promise.all(placeIds.map((id: string) => getPlace(id)));
      const ratings = places.map((p: Place | null) => p?.overallRating).filter((r: number | undefined): r is number => r !== undefined);
      if (ratings.length > 0) {
        list.overallRating = ratings.reduce((sum: number, r: number) => sum + r, 0) / ratings.length;
      }
    }
  }
  return lists;
}

export async function getList(listId: string): Promise<List | null> {
  if (Platform.OS === 'web') {
    return indexedDB.getList(listId);
  }

  if (!db) throw new Error('Database not initialized');
  const result = await db.getFirstAsync('SELECT * FROM lists WHERE id = ?', [listId]) as any;
  if (!result) return null;
  return {
    ...result,
    synced: Boolean(result.synced),
  } as List;
}

export async function updateList(listId: string, updates: Partial<Pick<List, 'name' | 'description' | 'category' | 'city'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const list = await indexedDB.getList(listId);
    if (!list) throw new Error('List not found');
    const updated = { ...list, ...updates, synced: false, updatedAt: Date.now() };
    await indexedDB.putList(updated);
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), 0, Date.now(), listId]; // Set synced to false
  await db.runAsync(`UPDATE lists SET ${fields}, synced = ?, updatedAt = ? WHERE id = ?`, values);
}

// Mark list as synced (internal use for sync service)
export async function markListAsSynced(listId: string, apiId: string, lastSyncedAt: number): Promise<void> {
  if (Platform.OS === 'web') {
    const list = await indexedDB.getList(listId);
    if (list) {
      list.apiId = apiId;
      list.synced = true;
      list.lastSyncedAt = lastSyncedAt;
      await indexedDB.putList(list);
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    await db.runAsync(
      'UPDATE lists SET apiId = ?, synced = ?, lastSyncedAt = ? WHERE id = ?',
      [apiId, 1, lastSyncedAt, listId]
    );
  }
}

export async function deleteList(listId: string): Promise<void> {
  if (Platform.OS === 'web') {
    await indexedDB.deleteList(listId);
    // Also remove list items
    const listItems = await indexedDB.getAllListItems();
    for (const item of listItems.filter(li => li.listId === listId)) {
      await indexedDB.deleteListItem(item.id);
    }
    return;
  }

  if (!db) throw new Error('Database not initialized');
  // Delete list items first (CASCADE should handle this, but being explicit)
  await db.runAsync('DELETE FROM list_items WHERE listId = ?', [listId]);
  // Then delete the list
  await db.runAsync('DELETE FROM lists WHERE id = ?', [listId]);
}

// ===== LIST ITEM QUERIES =====

export async function addPlaceToList(listId: string, placeId: string): Promise<void> {
  const newItem: ListItem = {
    id: generateId(),
    listId,
    placeId,
    order: 0, // Will be calculated
    createdAt: Date.now()
  };

  if (Platform.OS === 'web') {
    const listItems = await indexedDB.getAllListItems();
    const existing = listItems.filter(li => li.listId === listId);
    newItem.order = existing.length > 0 ? Math.max(...existing.map(li => li.order)) + 1 : 0;
    await indexedDB.putListItem(newItem);
    // Update list updatedAt
    const list = await getList(listId);
    if (list) await updateList(listId, {});
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const existing = (await db.getAllAsync(
    'SELECT * FROM list_items WHERE listId = ? ORDER BY [order] DESC LIMIT 1',
    [listId]
  )) as ListItem[];
  newItem.order = existing.length > 0 ? (existing[0].order + 1) : 0;
  await db.runAsync(
    'INSERT INTO list_items (id, listId, placeId, [order], createdAt) VALUES (?, ?, ?, ?, ?)',
    [newItem.id, listId, placeId, newItem.order, newItem.createdAt]
  );
  await updateList(listId, {});
}

export async function removePlaceFromList(listId: string, placeId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const listItems = await indexedDB.getAllListItems();
    const item = listItems.find(li => li.listId === listId && li.placeId === placeId);
    if (item) {
      await indexedDB.deleteListItem(item.id);
    }
    await updateList(listId, {});
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM list_items WHERE listId = ? AND placeId = ?', [listId, placeId]);
  await updateList(listId, {});
}

export async function getListItems(listId: string): Promise<ListItem[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getListItems(listId);
  }

  if (!db) throw new Error('Database not initialized');
  return (await db.getAllAsync(
    'SELECT * FROM list_items WHERE listId = ? ORDER BY [order] ASC',
    [listId]
  )) as ListItem[];
}

export async function getAllListItems(): Promise<ListItem[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getAllListItems();
  }

  if (!db) throw new Error('Database not initialized');
  return (await db.getAllAsync('SELECT * FROM list_items')) as ListItem[];
}

// ===== VISIT QUERIES =====

export async function createVisit(placeId: string, notes?: string, photoUri?: string): Promise<Visit> {
  const id = generateId();
  const now = Date.now();
  const visit: Visit = { 
    id, 
    placeId, 
    notes, 
    photoUri, 
    apiId: undefined,
    synced: false,
    createdAt: now, 
    updatedAt: now 
  };

  if (Platform.OS === 'web') {
    await indexedDB.putVisit(visit);
    return visit;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO visits (id, placeId, notes, photoUri, apiId, synced, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, placeId, notes || null, photoUri || null, null, 0, now, now]
  );
  return visit;
}

export async function getVisitsForPlace(placeId: string): Promise<Visit[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getVisitsForPlace(placeId);
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync(
    'SELECT * FROM visits WHERE placeId = ? ORDER BY createdAt DESC',
    [placeId]
  ) as any[];
  return results.map(r => ({
    ...r,
    synced: Boolean(r.synced),
  })) as Visit[];
}

export async function updateVisit(visitId: string, updates: Partial<Pick<Visit, 'notes' | 'photoUri'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const visit = await indexedDB.getVisit(visitId);
    if (!visit) throw new Error('Visit not found');
    const updated = { ...visit, ...updates, synced: false, updatedAt: Date.now() };
    await indexedDB.putVisit(updated);
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), 0, Date.now(), visitId]; // Set synced to false
  await db.runAsync(`UPDATE visits SET ${fields}, synced = ?, updatedAt = ? WHERE id = ?`, values);
}

// Mark visit as synced (internal use for sync service)
export async function markVisitAsSynced(visitId: string, apiId: string, lastSyncedAt: number): Promise<void> {
  if (Platform.OS === 'web') {
    const visit = await indexedDB.getVisit(visitId);
    if (visit) {
      visit.apiId = apiId;
      visit.synced = true;
      visit.lastSyncedAt = lastSyncedAt;
      await indexedDB.putVisit(visit);
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    await db.runAsync(
      'UPDATE visits SET apiId = ?, synced = ?, lastSyncedAt = ? WHERE id = ?',
      [apiId, 1, lastSyncedAt, visitId]
    );
  }
}

export async function getAllVisits(): Promise<Visit[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getAllVisits();
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync('SELECT * FROM visits') as any[];
  return results.map(r => ({
    ...r,
    synced: Boolean(r.synced),
  })) as Visit[];
}

// ===== CATEGORY QUERIES =====

export async function createCategory(name: string, type: 'place' | 'dish', parentId?: string, order?: number, userId?: string): Promise<Category> {
  const id = generateId();
  const now = Date.now();
  const category: Category = { 
    id, 
    name, 
    type, 
    parentId, 
    order, 
    apiId: undefined,
    synced: false,
    userId,
    createdAt: now 
  };

  if (Platform.OS === 'web') {
    await indexedDB.putCategory(category);
    return category;
  }

  if (!db) throw new Error('Database not initialized');
  const orderIndex = order ?? 0;
  await db.runAsync(
    'INSERT INTO categories (id, name, type, parentId, orderIndex, apiId, synced, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, type, parentId || null, orderIndex, null, 0, userId || null, now]
  );
  return category;
}

export async function getCategory(categoryId: string): Promise<Category | null> {
  if (Platform.OS === 'web') {
    return indexedDB.getCategory(categoryId);
  }

  if (!db) throw new Error('Database not initialized');
  const result = await db.getFirstAsync(
    'SELECT * FROM categories WHERE id = ?',
    [categoryId]
  ) as any;
  if (!result) return null;
  return {
    ...result,
    order: result.orderIndex,
    synced: Boolean(result.synced),
  } as Category;
}

export async function getCategoriesByType(type: 'place' | 'dish'): Promise<Category[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getCategoriesByType(type);
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync(
    'SELECT * FROM categories WHERE type = ? ORDER BY orderIndex ASC, name ASC',
    [type]
  ) as any[];
  return results.map(r => ({
    ...r,
    order: r.orderIndex,
    synced: Boolean(r.synced),
  })) as Category[];
}

export async function updateCategoryOrder(categoryId: string, newOrder: number): Promise<void> {
  if (Platform.OS === 'web') {
    const category = await indexedDB.getCategory(categoryId);
    if (!category) throw new Error('Category not found');
    const updated = { ...category, order: newOrder, synced: false };
    await indexedDB.putCategory(updated);
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('UPDATE categories SET orderIndex = ?, synced = ? WHERE id = ?', [newOrder, 0, categoryId]);
}

// Mark category as synced (internal use for sync service)
export async function markCategoryAsSynced(categoryId: string, apiId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const category = await indexedDB.getCategory(categoryId);
    if (category) {
      category.apiId = apiId;
      category.synced = true;
      await indexedDB.putCategory(category);
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    await db.runAsync(
      'UPDATE categories SET apiId = ?, synced = ? WHERE id = ?',
      [apiId, 1, categoryId]
    );
  }
}

export async function deleteCategory(categoryId: string): Promise<void> {
  if (Platform.OS === 'web') {
    await indexedDB.deleteCategory(categoryId);
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM categories WHERE id = ?', [categoryId]);
}

async function getAllCategories(): Promise<Category[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getAllCategories();
  }

  if (!db) throw new Error('Database not initialized');
  const results = (await db.getAllAsync(
    'SELECT *, orderIndex as order FROM categories'
  )) as any[];
  return results.map((r: any) => ({ 
    ...r, 
    order: r.orderIndex,
    synced: Boolean(r.synced),
  })) as Category[];
}

// ===== TAG QUERIES =====

export async function createTag(name: string, color?: string, userId?: string): Promise<Tag> {
  const id = generateId();
  const now = Date.now();
  const tag: Tag = { 
    id, 
    name, 
    color, 
    apiId: undefined,
    synced: false,
    userId,
    createdAt: now 
  };

  if (Platform.OS === 'web') {
    const tags = await indexedDB.getAllTags();
    // Check for duplicate name
    if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Tag with this name already exists');
    }
    await indexedDB.putTag(tag);
    return tag;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO tags (id, name, color, apiId, synced, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, color || null, null, 0, userId || null, now]
  );
  return tag;
}

export async function getAllTags(): Promise<Tag[]> {
  if (Platform.OS === 'web') {
    const storage = getLocalStorage();
    const stored = storage ? storage.getItem('chowder_tags') : null;
    return stored ? JSON.parse(stored) : [];
  }

  if (!db) throw new Error('Database not initialized');
  return (await db.getAllAsync('SELECT * FROM tags ORDER BY name ASC')) as Tag[];
}

export async function getTagsForPlace(placeId: string): Promise<Tag[]> {
  if (Platform.OS === 'web') {
    const tags = await indexedDB.getAllTags();
    const placeTags = await getPlaceTags(placeId);
    return tags.filter(t => placeTags.includes(t.id));
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync(
    `SELECT t.* FROM tags t
     INNER JOIN place_tags pt ON t.id = pt.tagId
     WHERE pt.placeId = ?
     ORDER BY t.name ASC`,
    [placeId]
  ) as any[];
  return results.map(r => ({
    ...r,
    synced: Boolean(r.synced),
  })) as Tag[];
}

export async function addTagToPlace(placeId: string, tagId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const placeTags = await getPlaceTags(placeId);
    if (!placeTags.includes(tagId)) {
      placeTags.push(tagId);
      const storage = getLocalStorage();
      if (storage) storage.setItem(`chowder_place_tags_${placeId}`, JSON.stringify(placeTags));
    }
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('INSERT OR IGNORE INTO place_tags (placeId, tagId) VALUES (?, ?)', [placeId, tagId]);
}

export async function removeTagFromPlace(placeId: string, tagId: string): Promise<void> {
  if (Platform.OS === 'web') {
    await indexedDB.removeTagFromPlace(placeId, tagId);
    // Mark place as unsynced
    const place = await indexedDB.getPlace(placeId);
    if (place) {
      place.synced = false;
      await indexedDB.putPlace(place);
    }
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM place_tags WHERE placeId = ? AND tagId = ?', [placeId, tagId]);
  // Mark place as unsynced
  await db.runAsync('UPDATE places SET synced = ? WHERE id = ?', [0, placeId]);
}

// Mark tag as synced (internal use for sync service)
export async function markTagAsSynced(tagId: string, apiId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const tag = await indexedDB.getTag(tagId);
    if (tag) {
      tag.apiId = apiId;
      tag.synced = true;
      await indexedDB.putTag(tag);
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    await db.runAsync(
      'UPDATE tags SET apiId = ?, synced = ? WHERE id = ?',
      [apiId, 1, tagId]
    );
  }
}

export async function deleteTag(tagId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const tags = await getAllTags();
    const filtered = tags.filter(t => t.id !== tagId);
    const storage = getLocalStorage();
    if (storage) storage.setItem('chowder_tags', JSON.stringify(filtered));
    // Also remove from all places
    const allPlaces = await getAllPlaces();
    for (const place of allPlaces) {
      if (place.tagIds) {
        const filteredTagIds = place.tagIds.filter((id: string) => id !== tagId);
        // Update place in storage
        const places = await getAllPlaces();
        const placeIndex = places.findIndex(p => p.id === place.id);
        if (placeIndex !== -1) {
          places[placeIndex].tagIds = filteredTagIds;
          const storage2 = getLocalStorage();
          if (storage2) storage2.setItem('chowder_places', JSON.stringify(places));
        }
      }
    }
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM tags WHERE id = ?', [tagId]);
  // CASCADE will handle place_tags
}

async function getPlaceTags(placeId: string): Promise<string[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getPlaceTags(placeId);
  }
  if (!db) throw new Error('Database not initialized');
  const results = (await db.getAllAsync('SELECT tagId FROM place_tags WHERE placeId = ?', [placeId])) as { tagId: string }[];
  return results.map((r: { tagId: string }) => r.tagId);
}

async function getAllPlaceTags(): Promise<PlaceTag[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getAllPlaceTags();
  }
  if (!db) throw new Error('Database not initialized');
  return (await db.getAllAsync('SELECT placeId, tagId FROM place_tags')) as PlaceTag[];
}

// ===== DISH QUERIES =====

export async function createDish(visitId: string, name: string, rating: number, categoryId?: string, notes?: string, photoUri?: string): Promise<Dish> {
  const id = generateId();
  const now = Date.now();
  const dish: Dish = { 
    id, 
    visitId, 
    name, 
    categoryId, 
    rating, 
    notes, 
    photoUri, 
    apiId: undefined,
    synced: false,
    createdAt: now, 
    updatedAt: now 
  };

  if (Platform.OS === 'web') {
    await indexedDB.putDish(dish);
    return dish;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO dishes (id, visitId, name, categoryId, rating, notes, photoUri, apiId, synced, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, visitId, name, categoryId || null, rating, notes || null, photoUri || null, null, 0, now, now]
  );
  return dish;
}

export async function getDishesForVisit(visitId: string): Promise<Dish[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getDishesForVisit(visitId);
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync(
    'SELECT * FROM dishes WHERE visitId = ? ORDER BY createdAt DESC',
    [visitId]
  ) as any[];
  return results.map(r => ({
    ...r,
    synced: Boolean(r.synced),
  })) as Dish[];
}

export async function getDishesForPlace(placeId: string): Promise<Dish[]> {
  if (Platform.OS === 'web') {
    const visits = await indexedDB.getVisitsForPlace(placeId);
    const visitIds = visits.map(v => v.id);
    const allDishes = await indexedDB.getAllDishes();
    return allDishes.filter(d => visitIds.includes(d.visitId)).sort((a, b) => b.createdAt - a.createdAt);
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync(
    `SELECT d.* FROM dishes d 
     INNER JOIN visits v ON d.visitId = v.id 
     WHERE v.placeId = ? 
     ORDER BY d.createdAt DESC`,
    [placeId]
  ) as any[];
  return results.map(r => ({
    ...r,
    synced: Boolean(r.synced),
  })) as Dish[];
}

export async function updateDish(dishId: string, updates: Partial<Pick<Dish, 'name' | 'categoryId' | 'rating' | 'notes' | 'photoUri'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const dish = await indexedDB.getDish(dishId);
    if (!dish) throw new Error('Dish not found');
    const updated = { ...dish, ...updates, synced: false, updatedAt: Date.now() };
    await indexedDB.putDish(updated);
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), 0, Date.now(), dishId]; // Set synced to false
  await db.runAsync(`UPDATE dishes SET ${fields}, synced = ?, updatedAt = ? WHERE id = ?`, values);
}

// Mark dish as synced (internal use for sync service)
export async function markDishAsSynced(dishId: string, apiId: string, lastSyncedAt: number): Promise<void> {
  if (Platform.OS === 'web') {
    const dish = await indexedDB.getDish(dishId);
    if (dish) {
      dish.apiId = apiId;
      dish.synced = true;
      dish.lastSyncedAt = lastSyncedAt;
      await indexedDB.putDish(dish);
    }
  } else {
    if (!db) throw new Error('Database not initialized');
    await db.runAsync(
      'UPDATE dishes SET apiId = ?, synced = ?, lastSyncedAt = ? WHERE id = ?',
      [apiId, 1, lastSyncedAt, dishId]
    );
  }
}

export async function deleteDish(dishId: string): Promise<void> {
  if (Platform.OS === 'web') {
    await indexedDB.deleteDish(dishId);
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM dishes WHERE id = ?', [dishId]);
}

export async function getAllDishes(): Promise<Dish[]> {
  if (Platform.OS === 'web') {
    return indexedDB.getAllDishes();
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync('SELECT * FROM dishes') as any[];
  return results.map(r => ({
    ...r,
    synced: Boolean(r.synced),
  })) as Dish[];
}

// ===== BACKUP & RESTORE =====

export interface BackupData {
  version: string;
  exportedAt: number;
  author: Author | null;
  places: Place[];
  lists: List[];
  listItems: ListItem[];
  visits: Visit[];
  dishes: Dish[];
  categories: Category[];
  tags: Tag[];
  placeTags: PlaceTag[];
}

// Export all data as JSON backup
export async function exportBackup(): Promise<BackupData> {
  const author = await getAuthor();
  const places = await getAllPlaces();
  const lists = await getAllLists();
  const listItems = await getAllListItems();
  const visits = await getAllVisits();
  const dishes = await getAllDishes();
  const categories = await getAllCategories();
  const tags = await getAllTags();
  const placeTags = await getAllPlaceTags();

  return {
    version: '1.0',
    exportedAt: Date.now(),
    author,
    places,
    lists,
    listItems,
    visits,
    dishes,
    categories,
    tags,
    placeTags,
  };
}

// Import data from backup
export async function importBackup(backup: BackupData): Promise<void> {
  if (Platform.OS === 'web') {
    // Clear existing data
    const allPlaceTags = await indexedDB.getAllPlaceTags();
    const allPlaces = await indexedDB.getAllPlaces();
    const allLists = await indexedDB.getAllLists();
    const allListItems = await indexedDB.getAllListItems();
    const allVisits = await indexedDB.getAllVisits();
    const allDishes = await indexedDB.getAllDishes();
    const allCategories = await indexedDB.getAllCategories();
    const allTags = await indexedDB.getAllTags();

    // Delete join tables first
    for (const placeTag of allPlaceTags) {
      await indexedDB.removeTagFromPlace(placeTag.placeId, placeTag.tagId);
    }
    for (const dish of allDishes) {
      await indexedDB.deleteDish(dish.id);
    }
    for (const visit of allVisits) {
      await indexedDB.deleteVisit(visit.id);
    }
    for (const item of allListItems) {
      await indexedDB.deleteListItem(item.id);
    }
    // Delete entities
    for (const place of allPlaces) {
      await indexedDB.deletePlace(place.id);
    }
    for (const list of allLists) {
      await indexedDB.deleteList(list.id);
    }
    for (const category of allCategories) {
      await indexedDB.deleteCategory(category.id);
    }
    for (const tag of allTags) {
      await indexedDB.deleteTag(tag.id);
    }

    // Import new data
    if (backup.author) {
      await indexedDB.putAuthor(backup.author);
    }
    for (const place of backup.places) {
      await indexedDB.putPlace(place);
    }
    for (const list of backup.lists) {
      await indexedDB.putList(list);
    }
    for (const item of backup.listItems) {
      await indexedDB.putListItem(item);
    }
    for (const visit of backup.visits) {
      await indexedDB.putVisit(visit);
    }
    for (const dish of backup.dishes) {
      await indexedDB.putDish(dish);
    }
    for (const category of backup.categories) {
      await indexedDB.putCategory(category);
    }
    for (const tag of backup.tags) {
      await indexedDB.putTag(tag);
    }
    // Restore place-tag relationships
    if (backup.placeTags) {
      for (const placeTag of backup.placeTags) {
        await indexedDB.addTagToPlace(placeTag.placeId, placeTag.tagId);
      }
    }
    return;
  }

  if (!db) throw new Error('Database not initialized');

  // Clear existing data
  await db.execAsync('DELETE FROM place_tags');
  await db.execAsync('DELETE FROM dishes');
  await db.execAsync('DELETE FROM visits');
  await db.execAsync('DELETE FROM list_items');
  await db.execAsync('DELETE FROM lists');
  await db.execAsync('DELETE FROM places');
  await db.execAsync('DELETE FROM categories');
  await db.execAsync('DELETE FROM tags');
  await db.execAsync('DELETE FROM author');

  // Import new data
  if (backup.author) {
    await db.runAsync(
      'INSERT INTO author (id, displayName, avatarUri, email, apiId, synced, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        backup.author.id,
        backup.author.displayName,
        backup.author.avatarUri || null,
        backup.author.email || null,
        backup.author.apiId || null,
        backup.author.synced ? 1 : 0,
        backup.author.userId || null,
        backup.author.createdAt,
      ]
    );
  }

  for (const place of backup.places) {
    await db.runAsync(
      'INSERT INTO places (id, name, address, latitude, longitude, categoryId, notes, overallRatingManual, ratingMode, coverImageUri, apiId, synced, lastSyncedAt, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        place.id,
        place.name,
        place.address || null,
        place.latitude,
        place.longitude,
        place.categoryId || null,
        place.notes || null,
        place.overallRatingManual || null,
        place.ratingMode || null,
        place.coverImageUri || null,
        place.apiId || null,
        place.synced ? 1 : 0,
        place.lastSyncedAt || null,
        place.userId || null,
        place.createdAt,
        place.updatedAt,
      ]
    );
  }

  for (const list of backup.lists) {
    await db.runAsync(
      'INSERT INTO lists (id, name, description, category, city, apiId, synced, lastSyncedAt, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        list.id,
        list.name,
        list.description || null,
        list.category || null,
        list.city || null,
        list.apiId || null,
        list.synced ? 1 : 0,
        list.lastSyncedAt || null,
        list.userId || null,
        list.createdAt,
        list.updatedAt,
      ]
    );
  }

  for (const item of backup.listItems) {
    await db.runAsync(
      'INSERT INTO list_items (id, listId, placeId, [order], createdAt) VALUES (?, ?, ?, ?, ?)',
      [item.id, item.listId, item.placeId, item.order, item.createdAt]
    );
  }

  for (const visit of backup.visits) {
    await db.runAsync(
      'INSERT INTO visits (id, placeId, notes, photoUri, apiId, synced, lastSyncedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        visit.id,
        visit.placeId,
        visit.notes || null,
        visit.photoUri || null,
        visit.apiId || null,
        visit.synced ? 1 : 0,
        visit.lastSyncedAt || null,
        visit.createdAt,
        visit.updatedAt,
      ]
    );
  }

  for (const dish of backup.dishes) {
    await db.runAsync(
      'INSERT INTO dishes (id, visitId, name, categoryId, rating, notes, photoUri, apiId, synced, lastSyncedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        dish.id,
        dish.visitId,
        dish.name,
        dish.categoryId || null,
        dish.rating,
        dish.notes || null,
        dish.photoUri || null,
        dish.apiId || null,
        dish.synced ? 1 : 0,
        dish.lastSyncedAt || null,
        dish.createdAt,
        dish.updatedAt,
      ]
    );
  }

  for (const category of backup.categories) {
    await db.runAsync(
      'INSERT INTO categories (id, name, type, parentId, orderIndex, apiId, synced, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        category.id,
        category.name,
        category.type,
        category.parentId || null,
        category.order ?? 0,
        category.apiId || null,
        category.synced ? 1 : 0,
        category.userId || null,
        category.createdAt,
      ]
    );
  }

  for (const tag of backup.tags) {
    await db.runAsync(
      'INSERT INTO tags (id, name, color, apiId, synced, userId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        tag.id,
        tag.name,
        tag.color || null,
        tag.apiId || null,
        tag.synced ? 1 : 0,
        tag.userId || null,
        tag.createdAt,
      ]
    );
  }

  // Restore place-tag relationships
  if (backup.placeTags) {
    for (const placeTag of backup.placeTags) {
      await db.runAsync(
        'INSERT INTO place_tags (placeId, tagId) VALUES (?, ?)',
        [placeTag.placeId, placeTag.tagId]
      );
    }
  }
}
