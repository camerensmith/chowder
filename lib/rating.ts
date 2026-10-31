// Single source of truth for how a place's rating is computed.
// Every screen should display `place.overallRating` (populated by lib/db.ts
// using this helper) instead of re-deriving it.

import { Dish, Place } from '../types';

/** Ratings are stored internally on a 0–5 scale (see lib/ratingScale.ts). */
export const MAX_INTERNAL_RATING = 5;

export function averageRating(ratings: number[]): number | undefined {
  const valid = ratings.filter(r => typeof r === 'number' && r > 0);
  if (valid.length === 0) return undefined;
  return valid.reduce((sum, r) => sum + r, 0) / valid.length;
}

/**
 * Effective rating for a place:
 *  - 'aggregate' mode: average of the place's dish ratings
 *  - 'overall' mode (default): the user's manual rating
 * Falls back to the other source when the preferred one is empty, so a place
 * with dishes but no manual rating (or vice versa) still shows something.
 */
export function getEffectiveRating(
  place: Pick<Place, 'ratingMode' | 'overallRatingManual'>,
  dishesForPlace: Pick<Dish, 'rating'>[]
): number | undefined {
  const manual = place.overallRatingManual != null && place.overallRatingManual > 0
    ? place.overallRatingManual
    : undefined;
  const dishAverage = averageRating(dishesForPlace.map(d => d.rating));
  if (place.ratingMode === 'aggregate') {
    return dishAverage ?? manual;
  }
  return manual ?? dishAverage;
}
