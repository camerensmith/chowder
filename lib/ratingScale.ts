import * as storage from './storage';

export type RatingScale = 5 | 10;

const RATING_SCALE_KEY = 'chowder_rating_scale';
const DEFAULT_RATING_SCALE: RatingScale = 5;

export async function getRatingScalePreference(): Promise<RatingScale> {
  const value = await storage.getItem(RATING_SCALE_KEY);
  return value === '10' ? 10 : DEFAULT_RATING_SCALE;
}

export async function setRatingScalePreference(scale: RatingScale): Promise<void> {
  await storage.setItem(RATING_SCALE_KEY, String(scale));
}

export function toDisplayRating(internalRating: number, scale: RatingScale): number {
  return (internalRating * scale) / 5;
}

export function toInternalRating(displayRating: number, scale: RatingScale): number {
  return (displayRating * 5) / scale;
}

export function getRatingScaleLabel(scale: RatingScale): string {
  return `${scale}`;
}
