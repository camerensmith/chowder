// REST API client for Chowder backend
// Handles JWT authentication, request/response interceptors, and offline detection

import { Platform } from 'react-native';
import * as auth from './auth';

// Base URL for API - should be configured via environment variable
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Check if device is online
function isOnline(): boolean {
  if (Platform.OS === 'web') {
    return navigator.onLine;
  }
  // On native, assume online (can be enhanced with NetInfo)
  return true;
}

// Make HTTP request
async function request(
  method: string,
  endpoint: string,
  data?: any,
  options?: { retries?: number; timeout?: number }
): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = await auth.getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.body = JSON.stringify(data);
  }

  const retries = options?.retries ?? 3;
  const timeout = options?.timeout ?? 10000;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (!isOnline()) {
        throw new Error('Device is offline');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      config.signal = controller.signal;

      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      let responseData: any;
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          await auth.signOut();
          throw new Error('Authentication failed. Please sign in again.');
        }

        // Handle other errors
        const errorMessage = responseData?.message || responseData?.error || `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      return responseData;
    } catch (error: any) {
      // If it's the last attempt or a non-retryable error, throw
      if (attempt === retries - 1 || error.name === 'AbortError' || error.message.includes('offline')) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  throw new Error('Request failed after retries');
}

// GET request
export async function get(endpoint: string, options?: { retries?: number; timeout?: number }): Promise<any> {
  return request('GET', endpoint, undefined, options);
}

// POST request
export async function post(endpoint: string, data?: any, options?: { retries?: number; timeout?: number }): Promise<any> {
  return request('POST', endpoint, data, options);
}

// PUT request
export async function put(endpoint: string, data?: any, options?: { retries?: number; timeout?: number }): Promise<any> {
  return request('PUT', endpoint, data, options);
}

// PATCH request
export async function patch(endpoint: string, data?: any, options?: { retries?: number; timeout?: number }): Promise<any> {
  return request('PATCH', endpoint, data, options);
}

// DELETE request
export async function del(endpoint: string, options?: { retries?: number; timeout?: number }): Promise<any> {
  return request('DELETE', endpoint, undefined, options);
}

// Check if device is online
export function checkOnline(): boolean {
  return isOnline();
}

// Send welcome email to newly registered user
export async function sendWelcomeEmail(email: string, displayName: string): Promise<void> {
  try {
    await post('/api/email/welcome', {
      email,
      displayName,
    });
  } catch (error: any) {
    // Log error but don't throw - email sending failure shouldn't block signup
    console.warn('Failed to send welcome email:', error.message);
    // Silently fail - user signup should still succeed even if email fails
  }
}
