import { Place } from '../types';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapViewProps {
  places: Place[];
  /** Pin tapped: show the info card for this place. */
  onPlaceSelect?: (place: Place) => void;
  /** Empty map area tapped. */
  onMapClick?: (lat: number, lng: number) => void;
  selectedPlaceId?: string;
  /** Temporary pin awaiting confirmation. */
  pendingPin?: { latitude: number; longitude: number } | null;
  /** Where to start. If omitted the map fits all places (or a default city). */
  initialCenter?: LatLng;
  initialZoom?: number;
  /** One-shot recenter request; MapView calls onCenterConsumed once handled. */
  center?: LatLng;
  zoom?: number;
  onCenterConsumed?: () => void;
  /** Temporary search-result pins (not saved places). The map fits to them when they change. */
  resultPins?: { id: string; name: string; latitude: number; longitude: number }[];
  onResultPress?: (id: string) => void;
  /** Called after the user pans/zooms, with the new center. */
  onViewChange?: (center: { latitude: number; longitude: number }) => void;
}

export const DEFAULT_CENTER: LatLng = { lat: 40.7128, lng: -74.006 }; // NYC
export const DEFAULT_ZOOM = 13;
