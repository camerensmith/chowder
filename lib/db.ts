// Local database for Chowder.
// Native: SQLite (expo-sqlite). Web: IndexedDB (lib/indexeddb.ts).
//
// Both backends expose the same behaviour from this module. Anything that is
// derived (place ratings, list ratings, tag ids) is computed here once so the
// screens never have to re-derive it.

import { Platform } from 'react-native';
import { Author, Place, List, ListItem, Visit, Dish, Category, Tag, PlaceTag } from '../types';
import * as idb from './indexeddb';
import { averageRating, getEffectiveRating } from './rating';

const isWeb = Platform.OS === 'web';

// Only load SQLite on native platforms
let SQLite: typeof import('expo-sqlite') | null = null;
if (!isWeb) {
  SQLite = require('expo-sqlite');
}

type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;
let db: SQLiteDatabase | null = null;

function sqlite(): SQLiteDatabase {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** SQLite can't bind `undefined`; convert to null and booleans to 0/1. */
function bindValue(v: unknown): string | number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** Convert SQLite NULLs back to undefined so objects match the web shape. */
function fromRow<T>(row: any): T {
  const out: any = {};
  for (const key of Object.keys(row)) {
    out[key] = row[key] === null ? undefined : row[key];
  }
  if ('orderIndex' in out) {
    out.order = out.orderIndex;
    delete out.orderIndex;
  }
  return out as T;
}

/** `order` is a reserved word: categories store it as orderIndex, list_items as [order]. */
function columnFor(table: string, key: string): string {
  if (key !== 'order') return key;
  return table === 'categories' ? 'orderIndex' : '[order]';
}

async function sqlUpdate(table: string, id: string, updates: Record<string, unknown>, touchUpdatedAt: boolean) {
  const entries: (readonly [string, unknown])[] = Object.entries(updates).map(([k, v]) => [columnFor(table, k), v] as const);
  if (touchUpdatedAt) entries.push(['updatedAt', Date.now()]);
  if (entries.length === 0) return;
  const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
  await sqlite().runAsync(
    `UPDATE ${table} SET ${setClause} WHERE id = ?`,
    [...entries.map(([, v]) => bindValue(v)), id]
  );
}

async function sqlInsert(table: string, row: Record<string, unknown>) {
  const entries = Object.entries(row).map(([k, v]) => [columnFor(table, k), v] as const);
  const cols = entries.map(([k]) => k).join(', ');
  const placeholders = entries.map(() => '?').join(', ');
  await sqlite().runAsync(
    `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`,
    entries.map(([, v]) => bindValue(v))
  );
}

// ===== INITIALIZATION =====

const SCHEMA_VERSION = 2;

export async function initializeDatabase(): Promise<void> {
  if (isWeb) {
    await idb.openDatabase();
    await migrateLegacyWebTags();
    await initializeDefaultCategories();
    return;
  }

  if (!SQLite) throw new Error('SQLite module not available on this platform');

  db = await SQLite.openDatabaseAsync('chowder.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS author (
      id TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      avatarUri TEXT,
      email TEXT,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      categoryId TEXT,
      notes TEXT,
      overallRatingManual REAL,
      ratingMode TEXT,
      coverImageUri TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      city TEXT,
      importedFrom TEXT,
      importedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_items (
      id TEXT PRIMARY KEY,
      listId TEXT NOT NULL,
      placeId TEXT NOT NULL,
      [order] INTEGER NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY(listId) REFERENCES lists(id) ON DELETE CASCADE,
      FOREIGN KEY(placeId) REFERENCES places(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      placeId TEXT NOT NULL,
      notes TEXT,
      photoUri TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY(placeId) REFERENCES places(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS dishes (
      id TEXT PRIMARY KEY,
      visitId TEXT NOT NULL,
      name TEXT NOT NULL,
      categoryId TEXT,
      rating REAL NOT NULL,
      notes TEXT,
      photoUri TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY(visitId) REFERENCES visits(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('place', 'dish')),
      parentId TEXT,
      orderIndex INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS place_tags (
      placeId TEXT NOT NULL,
      tagId TEXT NOT NULL,
      PRIMARY KEY (placeId, tagId),
      FOREIGN KEY(placeId) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY(tagId) REFERENCES tags(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_list_items_listId ON list_items(listId);
    CREATE INDEX IF NOT EXISTS idx_list_items_placeId ON list_items(placeId);
    CREATE INDEX IF NOT EXISTS idx_visits_placeId ON visits(placeId);
    CREATE INDEX IF NOT EXISTS idx_dishes_visitId ON dishes(visitId);
  `);

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = versionRow?.user_version ?? 0;
  if (version < SCHEMA_VERSION) {
    await migrateNative(version);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }

  await initializeDefaultCategories();
}

async function columnNames(table: string): Promise<Set<string>> {
  const rows = await sqlite().getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map(r => r.name));
}

async function migrateNative(fromVersion: number) {
  const d = sqlite();
  // Older installs may be missing columns that were added over time.
  const wanted: Record<string, string[]> = {
    places: ['coverImageUri TEXT', 'overallRatingManual REAL', 'ratingMode TEXT', 'notes TEXT'],
    lists: ['importedFrom TEXT', 'importedAt INTEGER', 'description TEXT', 'category TEXT', 'city TEXT'],
    author: ['avatarUri TEXT', 'email TEXT'],
  };
  for (const [table, cols] of Object.entries(wanted)) {
    const existing = await columnNames(table);
    for (const col of cols) {
      if (!existing.has(col.split(' ')[0])) {
        await d.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col};`);
      }
    }
  }

  if (fromVersion < 2) {
    // The old dishes table had `rating INTEGER CHECK(rating >= 1 AND rating <= 5)`,
    // which rejected half-stars below 1 and anything on the 10-point scale's low end.
    // Rebuild it without the CHECK, keeping all rows.
    const dishSql = await d.getFirstAsync<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dishes'"
    );
    if (dishSql?.sql?.includes('CHECK')) {
      await d.execAsync(`
        PRAGMA foreign_keys = OFF;
        BEGIN;
        CREATE TABLE dishes_new (
          id TEXT PRIMARY KEY,
          visitId TEXT NOT NULL,
          name TEXT NOT NULL,
          categoryId TEXT,
          rating REAL NOT NULL,
          notes TEXT,
          photoUri TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          FOREIGN KEY(visitId) REFERENCES visits(id) ON DELETE CASCADE
        );
        INSERT INTO dishes_new (id, visitId, name, categoryId, rating, notes, photoUri, createdAt, updatedAt)
          SELECT id, visitId, name, categoryId, rating, notes, photoUri, createdAt, updatedAt FROM dishes;
        DROP TABLE dishes;
        ALTER TABLE dishes_new RENAME TO dishes;
        CREATE INDEX IF NOT EXISTS idx_dishes_visitId ON dishes(visitId);
        COMMIT;
        PRAGMA foreign_keys = ON;
      `);
    }

    // Foreign keys were never enabled before, so deletes left orphans behind.
    await d.execAsync(`
      DELETE FROM list_items WHERE placeId NOT IN (SELECT id FROM places) OR listId NOT IN (SELECT id FROM lists);
      DELETE FROM visits WHERE placeId NOT IN (SELECT id FROM places);
      DELETE FROM dishes WHERE visitId NOT IN (SELECT id FROM visits);
      DELETE FROM place_tags WHERE placeId NOT IN (SELECT id FROM places) OR tagId NOT IN (SELECT id FROM tags);
    `);
  }
}

/**
 * Earlier web builds wrote tags to localStorage while reading them from
 * IndexedDB, so tags appeared to vanish. Recover anything stranded there.
 */
async function migrateLegacyWebTags() {
  const storage: Storage | undefined = (globalThis as any).localStorage;
  if (!storage) return;
  try {
    const legacyTags = storage.getItem('chowder_tags');
    const existing = await idb.getAllTags();
    const byName = new Map(existing.map(t => [t.name.toLowerCase(), t]));
    const idRemap = new Map<string, string>();

    if (legacyTags) {
      for (const tag of JSON.parse(legacyTags) as Tag[]) {
        const dupe = byName.get(tag.name.toLowerCase());
        if (dupe) {
          idRemap.set(tag.id, dupe.id);
        } else {
          await idb.putTag(tag);
          byName.set(tag.name.toLowerCase(), tag);
        }
      }
      storage.removeItem('chowder_tags');
    }

    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith('chowder_place_tags_')) keys.push(key);
    }
    for (const key of keys) {
      const placeId = key.slice('chowder_place_tags_'.length);
      const tagIds = JSON.parse(storage.getItem(key) || '[]') as string[];
      for (const tagId of tagIds) {
        await idb.addTagToPlace(placeId, idRemap.get(tagId) ?? tagId);
      }
      storage.removeItem(key);
    }
  } catch (error) {
    console.warn('Legacy tag migration skipped:', error);
  }
}

const DEFAULT_PLACE_CATEGORIES = [
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

const DEFAULTS_SEEDED_KEY = 'chowder_default_categories_seeded';

/**
 * Seed default place categories once. Previously this ran on every launch,
 * so categories the user deleted kept coming back.
 * Pass `force` to restore any missing defaults on demand.
 */
export async function initializeDefaultCategories(force = false): Promise<void> {
  try {
    const existing = await getAllCategories();
    if (!force) {
      if (isWeb) {
        const storage: Storage | undefined = (globalThis as any).localStorage;
        if (storage?.getItem(DEFAULTS_SEEDED_KEY)) return;
        // Existing installs already have their categories; don't resurrect deleted ones.
        if (existing.length > 0) {
          storage?.setItem(DEFAULTS_SEEDED_KEY, '1');
          return;
        }
      } else if (existing.length > 0) {
        return;
      }
    }
    const existingNames = new Set(existing.filter(c => c.type === 'place').map(c => c.name));
    for (let i = 0; i < DEFAULT_PLACE_CATEGORIES.length; i++) {
      const name = DEFAULT_PLACE_CATEGORIES[i];
      if (!existingNames.has(name)) {
        await createCategory(name, 'place', undefined, i);
      }
    }
    if (isWeb) (globalThis as any).localStorage?.setItem(DEFAULTS_SEEDED_KEY, '1');
  } catch (error) {
    console.error('Failed to initialize default categories:', error);
  }
}

// ===== AUTHOR =====

export async function getAuthor(): Promise<Author | null> {
  if (isWeb) return idb.getAuthor();
  const row = await sqlite().getFirstAsync('SELECT * FROM author ORDER BY createdAt ASC LIMIT 1');
  return row ? fromRow<Author>(row) : null;
}

export async function createAuthor(displayName: string, avatarUri?: string): Promise<Author> {
  const existing = await getAuthor();
  if (existing) {
    // Only ever one local profile.
    await updateAuthor({ displayName, avatarUri });
    return { ...existing, displayName, avatarUri };
  }
  const author: Author = { id: generateId(), displayName, avatarUri, createdAt: Date.now() };
  if (isWeb) {
    await idb.putAuthor(author);
  } else {
    await sqlInsert('author', { ...author });
  }
  return author;
}

export async function updateAuthor(updates: Partial<Pick<Author, 'displayName' | 'avatarUri'>>): Promise<void> {
  const author = await getAuthor();
  if (!author) throw new Error('Author not found');
  if (isWeb) {
    await idb.putAuthor({ ...author, ...updates });
    return;
  }
  await sqlUpdate('author', author.id, updates, false);
}

// ===== PLACES =====

/** Attach derived fields (tagIds, overallRating) to raw place rows. */
async function hydratePlaces(places: Place[]): Promise<Place[]> {
  if (places.length === 0) return places;
  const [visits, dishes, placeTags] = await Promise.all([getAllVisits(), getAllDishes(), getAllPlaceTags()]);
  const placeIdByVisit = new Map(visits.map(v => [v.id, v.placeId]));
  const dishesByPlace = new Map<string, Dish[]>();
  for (const dish of dishes) {
    const placeId = placeIdByVisit.get(dish.visitId);
    if (!placeId) continue;
    if (!dishesByPlace.has(placeId)) dishesByPlace.set(placeId, []);
    dishesByPlace.get(placeId)!.push(dish);
  }
  const visitStats = new Map<string, { count: number; last: number }>();
  for (const v of visits) {
    const st = visitStats.get(v.placeId) ?? { count: 0, last: 0 };
    visitStats.set(v.placeId, { count: st.count + 1, last: Math.max(st.last, v.createdAt) });
  }
  const tagsByPlace = new Map<string, string[]>();
  for (const pt of placeTags) {
    if (!tagsByPlace.has(pt.placeId)) tagsByPlace.set(pt.placeId, []);
    tagsByPlace.get(pt.placeId)!.push(pt.tagId);
  }
  return places.map(p => ({
    ...p,
    tagIds: tagsByPlace.get(p.id) ?? [],
    overallRating: getEffectiveRating(p, dishesByPlace.get(p.id) ?? []),
    visitCount: visitStats.get(p.id)?.count ?? 0,
    lastVisitedAt: visitStats.get(p.id)?.last || undefined,
  }));
}

async function getRawPlaces(): Promise<Place[]> {
  if (isWeb) return idb.getAllPlaces();
  const rows = await sqlite().getAllAsync('SELECT * FROM places');
  return rows.map(r => fromRow<Place>(r));
}

async function getRawPlace(placeId: string): Promise<Place | null> {
  if (isWeb) return idb.getPlace(placeId);
  const row = await sqlite().getFirstAsync('SELECT * FROM places WHERE id = ?', [placeId]);
  return row ? fromRow<Place>(row) : null;
}

/** Strip derived fields before persisting. */
function storablePlace(place: Place): Place {
  const { overallRating, tagIds, visitCount, lastVisitedAt, ...rest } = place;
  return rest as Place;
}

export async function createPlace(
  name: string,
  latitude: number,
  longitude: number,
  address?: string,
  categoryId?: string,
  notes?: string
): Promise<Place> {
  const now = Date.now();
  const place: Place = {
    id: generateId(),
    name,
    address,
    latitude,
    longitude,
    categoryId,
    notes,
    ratingMode: 'overall',
    createdAt: now,
    updatedAt: now,
  };
  if (isWeb) {
    await idb.putPlace(place);
  } else {
    await sqlInsert('places', { ...place });
  }
  return { ...place, tagIds: [] };
}

export async function getAllPlaces(): Promise<Place[]> {
  const places = await hydratePlaces(await getRawPlaces());
  return places.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPlace(placeId: string): Promise<Place | null> {
  const place = await getRawPlace(placeId);
  if (!place) return null;
  const [hydrated] = await hydratePlaces([place]);
  return hydrated;
}

export type PlaceUpdates = Partial<Pick<Place, 'name' | 'address' | 'categoryId' | 'notes' | 'overallRatingManual' | 'ratingMode' | 'coverImageUri'>>;

export async function updatePlace(placeId: string, updates: PlaceUpdates): Promise<void> {
  if (isWeb) {
    const place = await idb.getPlace(placeId);
    if (!place) throw new Error('Place not found');
    await idb.putPlace(storablePlace({ ...place, ...updates, updatedAt: Date.now() }));
    return;
  }
  await sqlUpdate('places', placeId, updates, true);
}

export async function deletePlace(placeId: string): Promise<void> {
  if (isWeb) {
    const visits = await idb.getVisitsForPlace(placeId);
    for (const visit of visits) await deleteVisit(visit.id);
    for (const item of (await idb.getAllListItems()).filter(li => li.placeId === placeId)) {
      await idb.deleteListItem(item.id);
    }
    for (const tagId of await idb.getPlaceTags(placeId)) {
      await idb.removeTagFromPlace(placeId, tagId);
    }
    await idb.deletePlace(placeId);
    return;
  }
  // ON DELETE CASCADE handles list items, visits → dishes, and place tags.
  await sqlite().runAsync('DELETE FROM places WHERE id = ?', [placeId]);
}

// ===== LISTS =====

async function getRawLists(): Promise<List[]> {
  if (isWeb) return idb.getAllLists();
  const rows = await sqlite().getAllAsync('SELECT * FROM lists');
  return rows.map(r => fromRow<List>(r));
}

export async function createList(
  name: string,
  description?: string,
  category?: string,
  city?: string,
  importedFrom?: string,
  importedAt?: number
): Promise<List> {
  const now = Date.now();
  const list: List = {
    id: generateId(),
    name,
    description,
    category,
    city,
    importedFrom,
    importedAt,
    createdAt: now,
    updatedAt: now,
  };
  if (isWeb) {
    await idb.putList(list);
  } else {
    await sqlInsert('lists', { ...list });
  }
  return list;
}

export async function getAllLists(): Promise<List[]> {
  const [lists, items, places] = await Promise.all([getRawLists(), getAllListItems(), getAllPlaces()]);
  const ratingByPlace = new Map(places.map(p => [p.id, p.overallRating]));
  return lists
    .map(list => {
      const listItems = items.filter(li => li.listId === list.id && ratingByPlace.has(li.placeId));
      const ratings = listItems
        .map(li => ratingByPlace.get(li.placeId))
        .filter((r): r is number => r !== undefined);
      return { ...list, overallRating: averageRating(ratings), placeCount: listItems.length };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getList(listId: string): Promise<List | null> {
  if (isWeb) return idb.getList(listId);
  const row = await sqlite().getFirstAsync('SELECT * FROM lists WHERE id = ?', [listId]);
  return row ? fromRow<List>(row) : null;
}

export async function updateList(listId: string, updates: Partial<Pick<List, 'name' | 'description' | 'category' | 'city'>>): Promise<void> {
  if (isWeb) {
    const list = await idb.getList(listId);
    if (!list) throw new Error('List not found');
    const { overallRating, placeCount, ...stored } = { ...list, ...updates, updatedAt: Date.now() };
    await idb.putList(stored);
    return;
  }
  await sqlUpdate('lists', listId, updates, true);
}

export async function deleteList(listId: string): Promise<void> {
  if (isWeb) {
    await idb.deleteList(listId); // also removes its list items
    return;
  }
  await sqlite().runAsync('DELETE FROM lists WHERE id = ?', [listId]);
}

export async function getImportedFriendLists(): Promise<List[]> {
  const lists = await getRawLists();
  return lists.filter(l => !!l.importedFrom).sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
}

// ===== LIST ITEMS =====

export async function addPlaceToList(listId: string, placeId: string): Promise<void> {
  const existing = await getListItems(listId);
  if (existing.some(li => li.placeId === placeId)) return; // already there
  const item: ListItem = {
    id: generateId(),
    listId,
    placeId,
    order: existing.length > 0 ? Math.max(...existing.map(li => li.order)) + 1 : 0,
    createdAt: Date.now(),
  };
  if (isWeb) {
    await idb.putListItem(item);
  } else {
    await sqlInsert('list_items', { ...item });
  }
  await updateList(listId, {});
}

export async function removePlaceFromList(listId: string, placeId: string): Promise<void> {
  if (isWeb) {
    for (const item of (await idb.getListItems(listId)).filter(li => li.placeId === placeId)) {
      await idb.deleteListItem(item.id);
    }
  } else {
    await sqlite().runAsync('DELETE FROM list_items WHERE listId = ? AND placeId = ?', [listId, placeId]);
  }
  await updateList(listId, {});
}

export async function getListItems(listId: string): Promise<ListItem[]> {
  if (isWeb) {
    return (await idb.getListItems(listId)).sort((a, b) => a.order - b.order);
  }
  const rows = await sqlite().getAllAsync('SELECT * FROM list_items WHERE listId = ? ORDER BY [order] ASC', [listId]);
  return rows.map(r => fromRow<ListItem>(r));
}

export async function getAllListItems(): Promise<ListItem[]> {
  if (isWeb) return idb.getAllListItems();
  const rows = await sqlite().getAllAsync('SELECT * FROM list_items');
  return rows.map(r => fromRow<ListItem>(r));
}

/** Ids of every list that contains the given place. */
export async function getListIdsForPlace(placeId: string): Promise<string[]> {
  const items = await getAllListItems();
  return [...new Set(items.filter(li => li.placeId === placeId).map(li => li.listId))];
}

// ===== VISITS =====

export async function createVisit(placeId: string, notes?: string, photoUri?: string): Promise<Visit> {
  const now = Date.now();
  const visit: Visit = { id: generateId(), placeId, notes, photoUri, createdAt: now, updatedAt: now };
  if (isWeb) {
    await idb.putVisit(visit);
  } else {
    await sqlInsert('visits', { ...visit });
  }
  return visit;
}

/** Newest first. */
export async function getVisitsForPlace(placeId: string): Promise<Visit[]> {
  if (isWeb) {
    return (await idb.getVisitsForPlace(placeId)).sort((a, b) => b.createdAt - a.createdAt);
  }
  const rows = await sqlite().getAllAsync('SELECT * FROM visits WHERE placeId = ? ORDER BY createdAt DESC', [placeId]);
  return rows.map(r => fromRow<Visit>(r));
}

export async function updateVisit(visitId: string, updates: Partial<Pick<Visit, 'notes' | 'photoUri'>>): Promise<void> {
  if (isWeb) {
    const visit = await idb.getVisit(visitId);
    if (!visit) throw new Error('Visit not found');
    await idb.putVisit({ ...visit, ...updates, updatedAt: Date.now() });
    return;
  }
  await sqlUpdate('visits', visitId, updates, true);
}

export async function deleteVisit(visitId: string): Promise<void> {
  if (isWeb) {
    for (const dish of await idb.getDishesForVisit(visitId)) await idb.deleteDish(dish.id);
    await idb.deleteVisit(visitId);
    return;
  }
  await sqlite().runAsync('DELETE FROM visits WHERE id = ?', [visitId]);
}

export async function getAllVisits(): Promise<Visit[]> {
  if (isWeb) return idb.getAllVisits();
  const rows = await sqlite().getAllAsync('SELECT * FROM visits');
  return rows.map(r => fromRow<Visit>(r));
}

// ===== CATEGORIES =====

export async function createCategory(name: string, type: 'place' | 'dish', parentId?: string, order?: number): Promise<Category> {
  const category: Category = { id: generateId(), name, type, parentId, order: order ?? 0, createdAt: Date.now() };
  if (isWeb) {
    await idb.putCategory(category);
  } else {
    await sqlInsert('categories', { ...category });
  }
  return category;
}

export async function getCategory(categoryId: string): Promise<Category | null> {
  if (isWeb) return idb.getCategory(categoryId);
  const row = await sqlite().getFirstAsync('SELECT * FROM categories WHERE id = ?', [categoryId]);
  return row ? fromRow<Category>(row) : null;
}

function sortCategories(categories: Category[]): Category[] {
  return categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

export async function getCategoriesByType(type: 'place' | 'dish'): Promise<Category[]> {
  if (isWeb) return sortCategories(await idb.getCategoriesByType(type));
  const rows = await sqlite().getAllAsync('SELECT * FROM categories WHERE type = ?', [type]);
  return sortCategories(rows.map(r => fromRow<Category>(r)));
}

export async function getAllCategories(): Promise<Category[]> {
  if (isWeb) return sortCategories(await idb.getAllCategories());
  const rows = await sqlite().getAllAsync('SELECT * FROM categories');
  return sortCategories(rows.map(r => fromRow<Category>(r)));
}

export async function updateCategory(categoryId: string, updates: Partial<Pick<Category, 'name' | 'order' | 'parentId'>>): Promise<void> {
  if (isWeb) {
    const category = await idb.getCategory(categoryId);
    if (!category) throw new Error('Category not found');
    await idb.putCategory({ ...category, ...updates });
    return;
  }
  await sqlUpdate('categories', categoryId, updates, false);
}

export async function updateCategoryOrder(categoryId: string, newOrder: number): Promise<void> {
  await updateCategory(categoryId, { order: newOrder });
}

/** Deletes a category and clears it from any place/dish/child category using it. */
export async function deleteCategory(categoryId: string): Promise<void> {
  if (isWeb) {
    for (const place of await idb.getAllPlaces()) {
      if (place.categoryId === categoryId) await idb.putPlace({ ...place, categoryId: undefined });
    }
    for (const dish of await idb.getAllDishes()) {
      if (dish.categoryId === categoryId) await idb.putDish({ ...dish, categoryId: undefined });
    }
    for (const cat of await idb.getAllCategories()) {
      if (cat.parentId === categoryId) await idb.putCategory({ ...cat, parentId: undefined });
    }
    await idb.deleteCategory(categoryId);
    return;
  }
  const d = sqlite();
  await d.runAsync('UPDATE places SET categoryId = NULL WHERE categoryId = ?', [categoryId]);
  await d.runAsync('UPDATE dishes SET categoryId = NULL WHERE categoryId = ?', [categoryId]);
  await d.runAsync('UPDATE categories SET parentId = NULL WHERE parentId = ?', [categoryId]);
  await d.runAsync('DELETE FROM categories WHERE id = ?', [categoryId]);
}

// ===== TAGS =====

export async function createTag(name: string, color?: string): Promise<Tag> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Tag name is required');
  const existing = await getAllTags();
  if (existing.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`A tag named "${trimmed}" already exists`);
  }
  const tag: Tag = { id: generateId(), name: trimmed, color, createdAt: Date.now() };
  if (isWeb) {
    await idb.putTag(tag);
  } else {
    await sqlInsert('tags', { ...tag });
  }
  return tag;
}

export async function getAllTags(): Promise<Tag[]> {
  if (isWeb) return (await idb.getAllTags()).sort((a, b) => a.name.localeCompare(b.name));
  const rows = await sqlite().getAllAsync('SELECT * FROM tags ORDER BY name ASC');
  return rows.map(r => fromRow<Tag>(r));
}

export async function getTagsForPlace(placeId: string): Promise<Tag[]> {
  const [tags, tagIds] = await Promise.all([getAllTags(), getPlaceTagIds(placeId)]);
  const ids = new Set(tagIds);
  return tags.filter(t => ids.has(t.id));
}

export async function addTagToPlace(placeId: string, tagId: string): Promise<void> {
  if (isWeb) {
    await idb.addTagToPlace(placeId, tagId);
    return;
  }
  await sqlite().runAsync('INSERT OR IGNORE INTO place_tags (placeId, tagId) VALUES (?, ?)', [placeId, tagId]);
}

export async function removeTagFromPlace(placeId: string, tagId: string): Promise<void> {
  if (isWeb) {
    await idb.removeTagFromPlace(placeId, tagId);
    return;
  }
  await sqlite().runAsync('DELETE FROM place_tags WHERE placeId = ? AND tagId = ?', [placeId, tagId]);
}

export async function deleteTag(tagId: string): Promise<void> {
  if (isWeb) {
    for (const pt of (await idb.getAllPlaceTags()).filter(pt => pt.tagId === tagId)) {
      await idb.removeTagFromPlace(pt.placeId, pt.tagId);
    }
    await idb.deleteTag(tagId);
    return;
  }
  await sqlite().runAsync('DELETE FROM tags WHERE id = ?', [tagId]); // cascades place_tags
}

async function getPlaceTagIds(placeId: string): Promise<string[]> {
  if (isWeb) return idb.getPlaceTags(placeId);
  const rows = await sqlite().getAllAsync<{ tagId: string }>('SELECT tagId FROM place_tags WHERE placeId = ?', [placeId]);
  return rows.map(r => r.tagId);
}

async function getAllPlaceTags(): Promise<PlaceTag[]> {
  if (isWeb) return idb.getAllPlaceTags();
  return sqlite().getAllAsync<PlaceTag>('SELECT placeId, tagId FROM place_tags');
}

// ===== DISHES =====

export async function createDish(visitId: string, name: string, rating: number, categoryId?: string, notes?: string, photoUri?: string): Promise<Dish> {
  const now = Date.now();
  const dish: Dish = { id: generateId(), visitId, name, categoryId, rating, notes, photoUri, createdAt: now, updatedAt: now };
  if (isWeb) {
    await idb.putDish(dish);
  } else {
    await sqlInsert('dishes', { ...dish });
  }
  return dish;
}

export async function getDishesForPlace(placeId: string): Promise<Dish[]> {
  const visits = await getVisitsForPlace(placeId);
  const visitIds = new Set(visits.map(v => v.id));
  const dishes = await getAllDishes();
  return dishes.filter(d => visitIds.has(d.visitId)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateDish(dishId: string, updates: Partial<Pick<Dish, 'name' | 'categoryId' | 'rating' | 'notes' | 'photoUri'>>): Promise<void> {
  if (isWeb) {
    const dish = await idb.getDish(dishId);
    if (!dish) throw new Error('Dish not found');
    await idb.putDish({ ...dish, ...updates, updatedAt: Date.now() });
    return;
  }
  await sqlUpdate('dishes', dishId, updates, true);
}

export async function deleteDish(dishId: string): Promise<void> {
  if (isWeb) {
    await idb.deleteDish(dishId);
    return;
  }
  await sqlite().runAsync('DELETE FROM dishes WHERE id = ?', [dishId]);
}

export async function getAllDishes(): Promise<Dish[]> {
  if (isWeb) return idb.getAllDishes();
  const rows = await sqlite().getAllAsync('SELECT * FROM dishes');
  return rows.map(r => fromRow<Dish>(r));
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

export async function exportBackup(): Promise<BackupData> {
  const [author, places, lists, listItems, visits, dishes, categories, tags, placeTags] = await Promise.all([
    getAuthor(),
    getRawPlaces(),
    getRawLists(),
    getAllListItems(),
    getAllVisits(),
    getAllDishes(),
    getAllCategories(),
    getAllTags(),
    getAllPlaceTags(),
  ]);
  return {
    version: '2.0',
    exportedAt: Date.now(),
    author,
    places: places.map(storablePlace),
    lists,
    listItems,
    visits,
    dishes,
    categories,
    tags,
    placeTags,
  };
}

/** Pick only known columns so stray/legacy fields in a backup don't break inserts. */
function pick<T extends object>(obj: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = (obj as any)[key];
  return out;
}

const COLUMNS = {
  author: ['id', 'displayName', 'avatarUri', 'email', 'createdAt'],
  places: ['id', 'name', 'address', 'latitude', 'longitude', 'categoryId', 'notes', 'overallRatingManual', 'ratingMode', 'coverImageUri', 'createdAt', 'updatedAt'],
  lists: ['id', 'name', 'description', 'category', 'city', 'importedFrom', 'importedAt', 'createdAt', 'updatedAt'],
  list_items: ['id', 'listId', 'placeId', 'order', 'createdAt'],
  visits: ['id', 'placeId', 'notes', 'photoUri', 'createdAt', 'updatedAt'],
  dishes: ['id', 'visitId', 'name', 'categoryId', 'rating', 'notes', 'photoUri', 'createdAt', 'updatedAt'],
  categories: ['id', 'name', 'type', 'parentId', 'order', 'createdAt'],
  tags: ['id', 'name', 'color', 'createdAt'],
};

export function validateBackup(data: any): asserts data is BackupData {
  if (!data || typeof data !== 'object') throw new Error('Backup file is not valid JSON data');
  for (const key of ['places', 'lists', 'listItems', 'visits', 'dishes', 'categories', 'tags']) {
    if (!Array.isArray(data[key])) throw new Error(`Backup is missing "${key}"`);
  }
}

/** Replaces all local data with the backup's contents. */
export async function importBackup(backup: BackupData): Promise<void> {
  validateBackup(backup);
  const placeTags = backup.placeTags ?? [];

  if (isWeb) {
    // Clear everything
    for (const pt of await idb.getAllPlaceTags()) await idb.removeTagFromPlace(pt.placeId, pt.tagId);
    for (const d of await idb.getAllDishes()) await idb.deleteDish(d.id);
    for (const v of await idb.getAllVisits()) await idb.deleteVisit(v.id);
    for (const li of await idb.getAllListItems()) await idb.deleteListItem(li.id);
    for (const p of await idb.getAllPlaces()) await idb.deletePlace(p.id);
    for (const l of await idb.getAllLists()) await idb.deleteList(l.id);
    for (const c of await idb.getAllCategories()) await idb.deleteCategory(c.id);
    for (const t of await idb.getAllTags()) await idb.deleteTag(t.id);
    await idb.clearAuthors();

    if (backup.author) await idb.putAuthor(backup.author);
    for (const p of backup.places) await idb.putPlace(storablePlace(p));
    for (const l of backup.lists) await idb.putList(l);
    for (const li of backup.listItems) await idb.putListItem(li);
    for (const v of backup.visits) await idb.putVisit(v);
    for (const d of backup.dishes) await idb.putDish(d);
    for (const c of backup.categories) await idb.putCategory(c);
    for (const t of backup.tags) await idb.putTag(t);
    for (const pt of placeTags) await idb.addTagToPlace(pt.placeId, pt.tagId);
    return;
  }

  const d = sqlite();
  await d.withTransactionAsync(async () => {
    await d.execAsync(`
      DELETE FROM place_tags; DELETE FROM dishes; DELETE FROM visits; DELETE FROM list_items;
      DELETE FROM lists; DELETE FROM places; DELETE FROM categories; DELETE FROM tags; DELETE FROM author;
    `);
    if (backup.author) await sqlInsert('author', pick(backup.author, COLUMNS.author));
    for (const p of backup.places) await sqlInsert('places', pick(p, COLUMNS.places));
    for (const l of backup.lists) await sqlInsert('lists', pick(l, COLUMNS.lists));
    for (const c of backup.categories) await sqlInsert('categories', pick(c, COLUMNS.categories));
    for (const t of backup.tags) await sqlInsert('tags', pick(t, COLUMNS.tags));
    for (const li of backup.listItems) await sqlInsert('list_items', pick(li, COLUMNS.list_items));
    for (const v of backup.visits) await sqlInsert('visits', pick(v, COLUMNS.visits));
    for (const dish of backup.dishes) await sqlInsert('dishes', pick(dish, COLUMNS.dishes));
    for (const pt of placeTags) {
      await d.runAsync('INSERT OR IGNORE INTO place_tags (placeId, tagId) VALUES (?, ?)', [pt.placeId, pt.tagId]);
    }
  });
}
