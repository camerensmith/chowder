// Core data types for Chowder

export interface Author {
  id: string;
  displayName: string;
  avatarUri?: string;
  email?: string;
  apiId?: string;
  synced?: boolean;
  userId?: string;
  createdAt: number;
}

export interface Place {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  categoryId?: string;
  overallRating?: number; // Only from overallRatingManual (visits no longer have ratings)
  overallRatingManual?: number; // Manually set overall rating
  ratingMode?: 'aggregate' | 'overall'; // 'aggregate' = average of dish ratings, 'overall' = manual rating
  notes?: string;
  coverImageUri?: string; // Cover image for the place
  cloudflareImageId?: string; // Cloudflare Images ID for CDN fallback
  tagIds?: string[]; // Array of tag IDs (not stored in DB, loaded separately)
  visitCount?: number; // Derived in lib/db.ts
  lastVisitedAt?: number; // Derived in lib/db.ts
  apiId?: string;
  synced?: boolean;
  lastSyncedAt?: number;
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface List {
  id: string;
  name: string;
  description?: string;
  category?: string; // e.g., "Pho", "Pizza"
  city?: string; // e.g., "NYC", "Bay Area"
  overallRating?: number; // Calculated from places
  placeCount?: number; // Derived in lib/db.ts
  importedFrom?: string; // Friend's display name if this list was imported
  importedAt?: number; // Timestamp when imported
  apiId?: string;
  synced?: boolean;
  lastSyncedAt?: number;
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ListItem {
  id: string;
  listId: string;
  placeId: string;
  order: number;
  createdAt: number;
}

export interface Visit {
  id: string;
  placeId: string;
  /**
   * true = you tapped Check In. false = created behind the scenes to hold dishes
   * logged without checking in (doesn't count as a visit). Undefined on visits
   * from before this field existed; those count as check-ins.
   */
  checkIn?: boolean;
  notes?: string;
  photoUri?: string;
  apiId?: string;
  synced?: boolean;
  lastSyncedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Dish {
  id: string;
  visitId: string;
  name: string;
  categoryId?: string;
  rating: number; // 1-5
  notes?: string;
  photoUri?: string;
  apiId?: string;
  synced?: boolean;
  lastSyncedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: 'place' | 'dish';
  parentId?: string;
  order?: number; // For custom ordering
  apiId?: string;
  synced?: boolean;
  userId?: string;
  createdAt: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string; // Optional color for tag chips
  apiId?: string;
  synced?: boolean;
  userId?: string;
  createdAt: number;
}

export interface PlaceTag {
  placeId: string;
  tagId: string;
}

// Share payload types
export interface SharePayload {
  type: 'list' | 'map';
  title: string;
  authorName: string;
  places: SharePlace[];
  mapViewport?: {
    center: { lat: number; lng: number };
    zoom: number;
  };
  filters?: {
    categories?: string[];
    minRating?: number;
  };
}

export interface SharePlace {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  category?: string;
}

// Navigation types
export type RootStackParamList = {
  Main: undefined;
  CreateAccount: undefined;
  ListDetail: { listId: string };
  PlaceDetail: { placeId: string };
  ShareViewer: { code?: string; friendName?: string; listId?: string };
  CategoryManagement: undefined;
  TileProvider: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Lists: undefined;
  Map: undefined;
  Settings: undefined;
};
