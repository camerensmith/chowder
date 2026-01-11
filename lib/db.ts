// Local SQLite database for Chowder
// All data is stored locally - no backend, no sync

import { Platform } from 'react-native';
import { Author, Place, List, ListItem, Visit, Dish, Category, Tag } from '../types';

// Only import SQLite on native platforms
let SQLite: typeof import('expo-sqlite') | null = null;
if (Platform.OS !== 'web') {
  SQLite = require('expo-sqlite');
}

type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;
let db: SQLiteDatabase | null = null;

// Initialize database
export async function initializeDatabase(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('⚠️ SQLite not available on web. Using localStorage fallback.');
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
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        notes TEXT,
        photoUri TEXT,
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
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(parentId) REFERENCES categories(id) ON DELETE SET NULL
      );

      -- Tags table
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
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

    console.log('✅ Database initialized');
    
    // Initialize default categories if they don't exist
    await initializeDefaultCategories();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Initialize default place categories
async function initializeDefaultCategories(): Promise<void> {
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
            createdAt: Date.now(),
          };
          existing.push(category);
        }
      }
      localStorage.setItem('chowder_categories', JSON.stringify(existing));
      return;
    }

    if (!db) return;

    // Check which categories already exist
    const existing = await db.getAllAsync<Category>('SELECT * FROM categories WHERE type = ?', ['place']);
    const existingNames = new Set(existing.map(c => c.name));

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
    const stored = localStorage.getItem('chowder_author');
    return stored ? JSON.parse(stored) : null;
  }
  
  if (!db) throw new Error('Database not initialized');
  return await db.getFirstAsync<Author>('SELECT * FROM author LIMIT 1');
}

export async function createAuthor(displayName: string, avatarUri?: string): Promise<Author> {
  const id = generateId();
  const now = Date.now();
  const author: Author = { id, displayName, avatarUri, createdAt: now };

  if (Platform.OS === 'web') {
    localStorage.setItem('chowder_author', JSON.stringify(author));
    return author;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO author (id, displayName, avatarUri, createdAt) VALUES (?, ?, ?, ?)',
    [id, displayName, avatarUri || null, now]
  );
  return author;
}

export async function updateAuthor(updates: Partial<Pick<Author, 'displayName' | 'avatarUri'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const author = await getAuthor();
    if (!author) throw new Error('Author not found');
    const updated = { ...author, ...updates };
    localStorage.setItem('chowder_author', JSON.stringify(updated));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  await db.runAsync(`UPDATE author SET ${fields}`, values);
}

// ===== PLACE QUERIES =====

export async function createPlace(
  name: string,
  latitude: number,
  longitude: number,
  address?: string,
  categoryId?: string,
  notes?: string
): Promise<Place> {
  const id = generateId();
  const now = Date.now();
  const place: Place = { id, name, address, latitude, longitude, categoryId, notes, ratingMode: 'overall', createdAt: now, updatedAt: now };

  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_places');
    const places: Place[] = stored ? JSON.parse(stored) : [];
    places.push(place);
    localStorage.setItem('chowder_places', JSON.stringify(places));
    return place;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO places (id, name, address, latitude, longitude, categoryId, notes, overallRatingManual, ratingMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, name, address || null, latitude, longitude, categoryId || null, notes || null, null, 'overall', now, now]
  );
  return place;
}

export async function getAllPlaces(): Promise<Place[]> {
  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_places');
    if (!stored) return [];
    const places: Place[] = JSON.parse(stored);
    // Calculate ratings from visits
    const visits = await getAllVisits();
    places.forEach(place => {
      const placeVisits = visits.filter(v => v.placeId === place.id);
      if (placeVisits.length > 0) {
        place.overallRating = placeVisits.reduce((sum, v) => sum + v.rating, 0) / placeVisits.length;
      }
    });
    return places.sort((a, b) => b.createdAt - a.createdAt);
  }

  if (!db) throw new Error('Database not initialized');
  const places = await db.getAllAsync<Place>('SELECT * FROM places ORDER BY createdAt DESC');
  // Calculate ratings
  for (const place of places) {
    const visits = await getVisitsForPlace(place.id);
    if (visits.length > 0) {
      place.overallRating = visits.reduce((sum, v) => sum + v.rating, 0) / visits.length;
    }
  }
  return places;
}

export async function getPlace(placeId: string): Promise<Place | null> {
  if (Platform.OS === 'web') {
    const places = await getAllPlaces();
    const place = places.find(p => p.id === placeId);
    if (place) {
      // Load tagIds
      place.tagIds = await getPlaceTags(placeId);
      const visits = await getVisitsForPlace(placeId);
      if (visits.length > 0) {
        place.overallRating = visits.reduce((sum, v) => sum + v.rating, 0) / visits.length;
      }
    }
    return place || null;
  }

  if (!db) throw new Error('Database not initialized');
  const place = await db.getFirstAsync<Place>('SELECT * FROM places WHERE id = ?', [placeId]);
  if (place) {
    // Load tagIds
    const tagIds = await getPlaceTags(placeId);
    place.tagIds = tagIds;
    const visits = await getVisitsForPlace(placeId);
    if (visits.length > 0) {
      place.overallRating = visits.reduce((sum, v) => sum + v.rating, 0) / visits.length;
    }
  }
  return place;
}

export async function updatePlace(placeId: string, updates: Partial<Pick<Place, 'name' | 'address' | 'categoryId' | 'notes' | 'overallRatingManual' | 'ratingMode'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const places = await getAllPlaces();
    const index = places.findIndex(p => p.id === placeId);
    if (index === -1) throw new Error('Place not found');
    places[index] = { ...places[index], ...updates, updatedAt: Date.now() };
    localStorage.setItem('chowder_places', JSON.stringify(places));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), Date.now(), placeId];
  await db.runAsync(`UPDATE places SET ${fields}, updatedAt = ? WHERE id = ?`, values);
}

export async function deletePlace(placeId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const places = await getAllPlaces();
    const filtered = places.filter(p => p.id !== placeId);
    localStorage.setItem('chowder_places', JSON.stringify(filtered));
    // Also remove list items and visits (cascade)
    const listItems = await getAllListItems();
    const filteredItems = listItems.filter(li => li.placeId !== placeId);
    localStorage.setItem('chowder_list_items', JSON.stringify(filteredItems));
    const visits = await getAllVisits();
    const filteredVisits = visits.filter(v => v.placeId !== placeId);
    localStorage.setItem('chowder_visits', JSON.stringify(filteredVisits));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM places WHERE id = ?', [placeId]);
}

// ===== LIST QUERIES =====

export async function createList(name: string, description?: string, category?: string, city?: string): Promise<List> {
  const id = generateId();
  const now = Date.now();
  const list: List = { id, name, description, category, city, createdAt: now, updatedAt: now };

  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_lists');
    const lists: List[] = stored ? JSON.parse(stored) : [];
    lists.push(list);
    localStorage.setItem('chowder_lists', JSON.stringify(lists));
    return list;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO lists (id, name, description, category, city, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, description || null, category || null, city || null, now, now]
  );
  return list;
}

export async function getAllLists(): Promise<List[]> {
  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_lists');
    if (!stored) return [];
    const lists: List[] = JSON.parse(stored);
    // Calculate ratings from places
    const places = await getAllPlaces();
    const listItems = await getAllListItems();
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
  const lists = await db.getAllAsync<List>('SELECT * FROM lists ORDER BY updatedAt DESC');
  // Calculate ratings
  for (const list of lists) {
    const items = await getListItems(list.id);
    if (items.length > 0) {
      const placeIds = items.map(li => li.placeId);
      const places = await Promise.all(placeIds.map(id => getPlace(id)));
      const ratings = places.map(p => p?.overallRating).filter((r): r is number => r !== undefined);
      if (ratings.length > 0) {
        list.overallRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      }
    }
  }
  return lists;
}

export async function getList(listId: string): Promise<List | null> {
  if (Platform.OS === 'web') {
    const lists = await getAllLists();
    return lists.find(l => l.id === listId) || null;
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getFirstAsync<List>('SELECT * FROM lists WHERE id = ?', [listId]);
}

export async function updateList(listId: string, updates: Partial<Pick<List, 'name' | 'description' | 'category' | 'city'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const lists = await getAllLists();
    const index = lists.findIndex(l => l.id === listId);
    if (index === -1) throw new Error('List not found');
    lists[index] = { ...lists[index], ...updates, updatedAt: Date.now() };
    localStorage.setItem('chowder_lists', JSON.stringify(lists));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), Date.now(), listId];
  await db.runAsync(`UPDATE lists SET ${fields}, updatedAt = ? WHERE id = ?`, values);
}

export async function deleteList(listId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const lists = await getAllLists();
    const filtered = lists.filter(l => l.id !== listId);
    localStorage.setItem('chowder_lists', JSON.stringify(filtered));
    // Also remove list items
    const listItems = await getAllListItems();
    const filteredItems = listItems.filter(li => li.listId !== listId);
    localStorage.setItem('chowder_list_items', JSON.stringify(filteredItems));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM lists WHERE id = ?', [listId]);
}

// ===== LIST ITEM QUERIES =====

export async function addPlaceToList(listId: string, placeId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const listItems = await getAllListItems();
    const existing = listItems.filter(li => li.listId === listId);
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(li => li.order)) : -1;
    const newItem: ListItem = {
      id: generateId(),
      listId,
      placeId,
      order: maxOrder + 1,
      createdAt: Date.now()
    };
    listItems.push(newItem);
    localStorage.setItem('chowder_list_items', JSON.stringify(listItems));
    // Update list updatedAt
    const list = await getList(listId);
    if (list) await updateList(listId, {});
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const existing = await db.getAllAsync<ListItem>(
    'SELECT * FROM list_items WHERE listId = ? ORDER BY [order] DESC LIMIT 1',
    [listId]
  );
  const nextOrder = existing.length > 0 ? (existing[0].order + 1) : 0;
  await db.runAsync(
    'INSERT INTO list_items (id, listId, placeId, [order], createdAt) VALUES (?, ?, ?, ?, ?)',
    [generateId(), listId, placeId, nextOrder, Date.now()]
  );
  await updateList(listId, {});
}

export async function removePlaceFromList(listId: string, placeId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const listItems = await getAllListItems();
    const filtered = listItems.filter(li => !(li.listId === listId && li.placeId === placeId));
    localStorage.setItem('chowder_list_items', JSON.stringify(filtered));
    await updateList(listId, {});
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM list_items WHERE listId = ? AND placeId = ?', [listId, placeId]);
  await updateList(listId, {});
}

export async function getListItems(listId: string): Promise<ListItem[]> {
  if (Platform.OS === 'web') {
    const listItems = await getAllListItems();
    return listItems.filter(li => li.listId === listId).sort((a, b) => a.order - b.order);
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<ListItem>(
    'SELECT * FROM list_items WHERE listId = ? ORDER BY [order] ASC',
    [listId]
  );
}

async function getAllListItems(): Promise<ListItem[]> {
  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_list_items');
    return stored ? JSON.parse(stored) : [];
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<ListItem>('SELECT * FROM list_items');
}

// ===== VISIT QUERIES =====

export async function createVisit(placeId: string, rating: number, notes?: string, photoUri?: string): Promise<Visit> {
  const id = generateId();
  const now = Date.now();
  const visit: Visit = { id, placeId, rating, notes, photoUri, createdAt: now, updatedAt: now };

  if (Platform.OS === 'web') {
    const visits = await getAllVisits();
    visits.push(visit);
    localStorage.setItem('chowder_visits', JSON.stringify(visits));
    return visit;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO visits (id, placeId, rating, notes, photoUri, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, placeId, rating, notes || null, photoUri || null, now, now]
  );
  return visit;
}

export async function getVisitsForPlace(placeId: string): Promise<Visit[]> {
  if (Platform.OS === 'web') {
    const visits = await getAllVisits();
    return visits.filter(v => v.placeId === placeId).sort((a, b) => b.createdAt - a.createdAt);
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<Visit>(
    'SELECT * FROM visits WHERE placeId = ? ORDER BY createdAt DESC',
    [placeId]
  );
}

async function getAllVisits(): Promise<Visit[]> {
  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_visits');
    return stored ? JSON.parse(stored) : [];
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<Visit>('SELECT * FROM visits');
}

// ===== CATEGORY QUERIES =====

export async function createCategory(name: string, type: 'place' | 'dish', parentId?: string, order?: number): Promise<Category> {
  const id = generateId();
  const now = Date.now();
  const category: Category = { id, name, type, parentId, order, createdAt: now };

  if (Platform.OS === 'web') {
    const categories = await getAllCategories();
    categories.push(category);
    localStorage.setItem('chowder_categories', JSON.stringify(categories));
    return category;
  }

  if (!db) throw new Error('Database not initialized');
  const orderIndex = order ?? 0;
  await db.runAsync(
    'INSERT INTO categories (id, name, type, parentId, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, type, parentId || null, orderIndex, now]
  );
  return category;
}

export async function getCategory(categoryId: string): Promise<Category | null> {
  if (Platform.OS === 'web') {
    const categories = await getAllCategories();
    return categories.find(c => c.id === categoryId) || null;
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getFirstAsync<Category>(
    'SELECT * FROM categories WHERE id = ?',
    [categoryId]
  );
}

export async function getCategoriesByType(type: 'place' | 'dish'): Promise<Category[]> {
  if (Platform.OS === 'web') {
    const categories = await getAllCategories();
    const filtered = categories.filter(c => c.type === type);
    // Sort by order if available, otherwise by name
    return filtered.sort((a, b) => {
      const orderA = a.order ?? 999;
      const orderB = b.order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<Category>(
    'SELECT * FROM categories WHERE type = ? ORDER BY orderIndex ASC, name ASC',
    [type]
  );
}

export async function updateCategoryOrder(categoryId: string, newOrder: number): Promise<void> {
  if (Platform.OS === 'web') {
    const categories = await getAllCategories();
    const index = categories.findIndex(c => c.id === categoryId);
    if (index !== -1) {
      categories[index].order = newOrder;
      localStorage.setItem('chowder_categories', JSON.stringify(categories));
    }
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('UPDATE categories SET orderIndex = ? WHERE id = ?', [newOrder, categoryId]);
}

export async function deleteCategory(categoryId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const categories = await getAllCategories();
    const filtered = categories.filter(c => c.id !== categoryId);
    localStorage.setItem('chowder_categories', JSON.stringify(filtered));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM categories WHERE id = ?', [categoryId]);
}

async function getAllCategories(): Promise<Category[]> {
  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_categories');
    return stored ? JSON.parse(stored) : [];
  }

  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync<Category & { orderIndex: number }>(
    'SELECT *, orderIndex as order FROM categories'
  );
  return results.map(c => ({ ...c, order: c.orderIndex }));
}

// ===== TAG QUERIES =====

export async function createTag(name: string, color?: string): Promise<Tag> {
  const id = generateId();
  const now = Date.now();
  const tag: Tag = { id, name, color, createdAt: now };

  if (Platform.OS === 'web') {
    const tags = await getAllTags();
    // Check for duplicate name
    if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Tag with this name already exists');
    }
    tags.push(tag);
    localStorage.setItem('chowder_tags', JSON.stringify(tags));
    return tag;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO tags (id, name, color, createdAt) VALUES (?, ?, ?, ?)',
    [id, name, color || null, now]
  );
  return tag;
}

export async function getAllTags(): Promise<Tag[]> {
  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_tags');
    return stored ? JSON.parse(stored) : [];
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<Tag>('SELECT * FROM tags ORDER BY name ASC');
}

export async function getTagsForPlace(placeId: string): Promise<Tag[]> {
  if (Platform.OS === 'web') {
    const tags = await getAllTags();
    const placeTags = await getPlaceTags(placeId);
    return tags.filter(t => placeTags.includes(t.id));
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<Tag>(
    `SELECT t.* FROM tags t
     INNER JOIN place_tags pt ON t.id = pt.tagId
     WHERE pt.placeId = ?
     ORDER BY t.name ASC`,
    [placeId]
  );
}

export async function addTagToPlace(placeId: string, tagId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const placeTags = await getPlaceTags(placeId);
    if (!placeTags.includes(tagId)) {
      placeTags.push(tagId);
      localStorage.setItem(`chowder_place_tags_${placeId}`, JSON.stringify(placeTags));
    }
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('INSERT OR IGNORE INTO place_tags (placeId, tagId) VALUES (?, ?)', [placeId, tagId]);
}

export async function removeTagFromPlace(placeId: string, tagId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const placeTags = await getPlaceTags(placeId);
    const filtered = placeTags.filter(id => id !== tagId);
    localStorage.setItem(`chowder_place_tags_${placeId}`, JSON.stringify(filtered));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM place_tags WHERE placeId = ? AND tagId = ?', [placeId, tagId]);
}

export async function deleteTag(tagId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const tags = await getAllTags();
    const filtered = tags.filter(t => t.id !== tagId);
    localStorage.setItem('chowder_tags', JSON.stringify(filtered));
    // Also remove from all places
    const allPlaces = await getAllPlaces();
    for (const place of allPlaces) {
      if (place.tagIds) {
        const filteredTagIds = place.tagIds.filter(id => id !== tagId);
        // Update place in storage
        const places = await getAllPlaces();
        const placeIndex = places.findIndex(p => p.id === place.id);
        if (placeIndex !== -1) {
          places[placeIndex].tagIds = filteredTagIds;
          localStorage.setItem('chowder_places', JSON.stringify(places));
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
    const stored = localStorage.getItem(`chowder_place_tags_${placeId}`);
    return stored ? JSON.parse(stored) : [];
  }
  if (!db) throw new Error('Database not initialized');
  const results = await db.getAllAsync<{ tagId: string }>('SELECT tagId FROM place_tags WHERE placeId = ?', [placeId]);
  return results.map(r => r.tagId);
}

// ===== DISH QUERIES =====

export async function createDish(visitId: string, name: string, rating: number, categoryId?: string, notes?: string, photoUri?: string): Promise<Dish> {
  const id = generateId();
  const now = Date.now();
  const dish: Dish = { id, visitId, name, categoryId, rating, notes, photoUri, createdAt: now, updatedAt: now };

  if (Platform.OS === 'web') {
    const dishes = await getAllDishes();
    dishes.push(dish);
    localStorage.setItem('chowder_dishes', JSON.stringify(dishes));
    return dish;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync(
    'INSERT INTO dishes (id, visitId, name, categoryId, rating, notes, photoUri, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, visitId, name, categoryId || null, rating, notes || null, photoUri || null, now, now]
  );
  return dish;
}

export async function getDishesForVisit(visitId: string): Promise<Dish[]> {
  if (Platform.OS === 'web') {
    const dishes = await getAllDishes();
    return dishes.filter(d => d.visitId === visitId).sort((a, b) => b.createdAt - a.createdAt);
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<Dish>(
    'SELECT * FROM dishes WHERE visitId = ? ORDER BY createdAt DESC',
    [visitId]
  );
}

export async function getDishesForPlace(placeId: string): Promise<Dish[]> {
  if (Platform.OS === 'web') {
    const visits = await getAllVisits();
    const visitIds = visits.filter(v => v.placeId === placeId).map(v => v.id);
    const dishes = await getAllDishes();
    return dishes.filter(d => visitIds.includes(d.visitId)).sort((a, b) => b.createdAt - a.createdAt);
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<Dish>(
    `SELECT d.* FROM dishes d 
     INNER JOIN visits v ON d.visitId = v.id 
     WHERE v.placeId = ? 
     ORDER BY d.createdAt DESC`,
    [placeId]
  );
}

export async function updateDish(dishId: string, updates: Partial<Pick<Dish, 'name' | 'categoryId' | 'rating' | 'notes' | 'photoUri'>>): Promise<void> {
  if (Platform.OS === 'web') {
    const dishes = await getAllDishes();
    const index = dishes.findIndex(d => d.id === dishId);
    if (index === -1) throw new Error('Dish not found');
    dishes[index] = { ...dishes[index], ...updates, updatedAt: Date.now() };
    localStorage.setItem('chowder_dishes', JSON.stringify(dishes));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), Date.now(), dishId];
  await db.runAsync(`UPDATE dishes SET ${fields}, updatedAt = ? WHERE id = ?`, values);
}

export async function deleteDish(dishId: string): Promise<void> {
  if (Platform.OS === 'web') {
    const dishes = await getAllDishes();
    const filtered = dishes.filter(d => d.id !== dishId);
    localStorage.setItem('chowder_dishes', JSON.stringify(filtered));
    return;
  }

  if (!db) throw new Error('Database not initialized');
  await db.runAsync('DELETE FROM dishes WHERE id = ?', [dishId]);
}

async function getAllDishes(): Promise<Dish[]> {
  if (Platform.OS === 'web') {
    const stored = localStorage.getItem('chowder_dishes');
    return stored ? JSON.parse(stored) : [];
  }

  if (!db) throw new Error('Database not initialized');
  return await db.getAllAsync<Dish>('SELECT * FROM dishes');
}
