// Share code generation and parsing
// Client-side only - no backend

import { SharePayload, SharePlace } from '../types';

// Base62 encoding for compact share codes
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62Encode(num: number): string {
  if (num === 0) return '0';
  let result = '';
  while (num > 0) {
    result = BASE62[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result;
}

function base62Decode(str: string): number {
  let num = 0;
  for (let i = 0; i < str.length; i++) {
    num = num * 62 + BASE62.indexOf(str[i]);
  }
  return num;
}

// Simple compression: remove whitespace and use short keys
function compressPayload(payload: SharePayload): string {
  const compressed = {
    t: payload.type,
    n: payload.title,
    a: payload.authorName,
    p: payload.places.map(place => ({
      i: place.id,
      n: place.name,
      a: place.address,
      lat: place.lat,
      lng: place.lng,
      c: place.category,
    })),
    m: payload.mapViewport,
    f: payload.filters,
  };
  return JSON.stringify(compressed);
}

function decompressPayload(compressed: string): SharePayload {
  const data = JSON.parse(compressed);
  return {
    type: data.t,
    title: data.n,
    authorName: data.a,
    places: data.p.map((p: any) => ({
      id: p.i,
      name: p.n,
      address: p.a,
      lat: p.lat,
      lng: p.lng,
      category: p.c,
    })),
    mapViewport: data.m,
    filters: data.f,
  };
}

// Generate share code from payload
export function generateShareCode(payload: SharePayload): string {
  const json = compressPayload(payload);
  // Convert to base62
  let code = '';
  for (let i = 0; i < json.length; i++) {
    code += base62Encode(json.charCodeAt(i));
    if (i < json.length - 1) code += '-';
  }
  // Take first 20-30 chars for readability
  return code.substring(0, 30).replace(/-/g, '');
}

// Parse share code to payload
export function parseShareCode(code: string): SharePayload {
  try {
    if (typeof window === 'undefined') {
      throw new Error('Not available in this environment');
    }
    // Store the payload directly in localStorage and use the code as a key
    // This is a simplified implementation - in production you'd use proper encoding/decoding
    const stored = localStorage.getItem(`share_${code}`);
    if (stored) {
      return JSON.parse(stored);
    }
    throw new Error('Invalid share code');
  } catch (error) {
    throw new Error('Invalid or corrupted share code');
  }
}

// Store share code temporarily (for demo - in production you'd use proper encoding)
export function storeShareCode(code: string, payload: SharePayload): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`share_${code}`, JSON.stringify(payload));
    } catch (error) {
      console.error('Failed to store share code:', error);
    }
  }
}
