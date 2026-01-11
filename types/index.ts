// Core data types for Chowder

export interface Author {
  id: string;
  displayName: string;
  avatarUri?: string;
  createdAt: number;
}

export interface Place {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  categoryId?: string;
  overallRating?: number; // Calculated from visits (when ratingMode is 'overall')
  overallRatingManual?: number; // Manually set overall rating
  ratingMode?: 'aggregate' | 'overall'; // 'aggregate' = average of dish ratings, 'overall' = manual rating
  notes?: string;
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
  rating: number; // 1-5
  notes?: string;
  photoUri?: string;
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
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: 'place' | 'dish';
  parentId?: string;
  order?: number; // For custom ordering
  createdAt: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string; // Optional color for tag chips
  createdAt: number;
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
  ShareViewer: { code?: string };
  CategoryManagement: undefined;
};

export type MainTabParamList = {
  Lists: undefined;
  Map: undefined;
  Settings: undefined;
};
