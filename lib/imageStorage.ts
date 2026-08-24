/**
 * Image storage utilities for Chowder.
 *
 * Flow:
 * 1. After picking/capturing an image, call `persistImageLocally` to copy the
 *    temporary picker URI to a stable path in the app's document directory.
 * 2. Call `uploadToCloudflare` (fire-and-forget) to push the image to Cloudflare
 *    Images for CDN delivery and as a backup when the local file is unavailable.
 * 3. When displaying, call `resolveImageUri` which prefers the local file and
 *    falls back to the Cloudflare CDN URL when the file is missing.
 *
 * Cloudflare configuration (optional — upload silently skipped if absent):
 *   Set the following in app.json extra OR inject via EAS Secrets / environment
 *   variables at build time (recommended — do NOT commit real credentials):
 *
 *     "cloudflareAccountId":   "<your Cloudflare account ID>"   (for API calls)
 *     "cloudflareAccountHash": "<your Cloudflare Images account hash>" (for CDN URLs)
 *     "cloudflareImagesToken": "<your Cloudflare Images API token>"
 *
 *   Account ID  — found in your Cloudflare dashboard → Right sidebar "Account ID".
 *   Account Hash — the identifier in CDN delivery URLs:
 *                  https://imagedelivery.net/<accountHash>/<imageId>/public
 *   API Token   — needs the "Cloudflare Images: Edit" permission.
 *
 * SECURITY NOTE: Never commit a real API token to source control. Use EAS Secrets
 * (https://docs.expo.dev/build-reference/variables/) so the token is injected at
 * build time and never appears in the app bundle or repository.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Only import FileSystem on native platforms where it works
let FileSystem: typeof import('expo-file-system') | null = null;
if (Platform.OS !== 'web') {
  try {
    FileSystem = require('expo-file-system');
  } catch {
    // expo-file-system not available, local persistence will be skipped
  }
}

interface CFConfig {
  accountId: string;    // Used in API endpoint URLs
  accountHash: string;  // Used in CDN delivery URLs
  token: string;        // Cloudflare Images API token
}

/** Read Cloudflare credentials from app.json extra */
function getCFConfig(): CFConfig | null {
  const extra = Constants.expoConfig?.extra ?? (Constants as any).manifest?.extra ?? {};
  const accountId: string | undefined = extra.cloudflareAccountId;
  const accountHash: string | undefined = extra.cloudflareAccountHash;
  const token: string | undefined = extra.cloudflareImagesToken;
  if (!accountId || !accountHash || !token) return null;
  return { accountId, accountHash, token };
}

/**
 * Copy a temporary image URI (from the picker) to the app's document directory
 * so it survives app restarts. Returns the stable local URI, or the original
 * URI if the copy fails / the platform does not support FileSystem.
 */
export async function persistImageLocally(tempUri: string): Promise<string> {
  if (Platform.OS === 'web' || !FileSystem) {
    // On web the URI is already a stable blob/data URL; no copy needed.
    return tempUri;
  }

  try {
    const docDir = FileSystem.documentDirectory;
    if (!docDir) return tempUri;

    // Generate a stable filename using timestamp + random suffix
    const ext = tempUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const filename = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const destUri = docDir + filename;

    await FileSystem.copyAsync({ from: tempUri, to: destUri });
    return destUri;
  } catch (err) {
    console.warn('[imageStorage] Failed to persist image locally, using original URI:', err);
    return tempUri;
  }
}

/**
 * Upload an image to Cloudflare Images.
 * Returns the Cloudflare image ID on success, or null on failure / if not configured.
 * This should be called after `persistImageLocally` and treated as best-effort.
 */
export async function uploadToCloudflare(localUri: string): Promise<string | null> {
  const cfg = getCFConfig();
  if (!cfg) return null;

  try {
    // Step 1: request a one-time direct-upload URL from Cloudflare (uses account ID)
    const initRes = await fetch(
      'https://api.cloudflare.com/client/v4/accounts/' + cfg.accountId + '/images/v2/direct_upload',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + cfg.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requireSignedURLs: false }),
      }
    );
    const initJson = await initRes.json();
    if (!initJson.success) {
      console.warn('[imageStorage] Cloudflare direct-upload init failed:', initJson.errors);
      return null;
    }
    const uploadURL: string = initJson.result.uploadURL;
    const imageId: string = initJson.result.id;

    // Step 2: POST the image binary to the upload URL
    const fd = new FormData();
    if (Platform.OS === 'web') {
      // On web, localUri may be a blob URL — fetch it to get the Blob
      const blobRes = await fetch(localUri);
      const blob = await blobRes.blob();
      fd.append('file', blob, 'image.jpg');
    } else {
      // On native, use the local file URI directly
      (fd as any).append('file', {
        uri: localUri,
        name: 'image.jpg',
        type: 'image/jpeg',
      } as any);
    }

    const uploadRes = await fetch(uploadURL, { method: 'POST', body: fd });
    if (!uploadRes.ok) {
      console.warn('[imageStorage] Cloudflare image upload failed:', uploadRes.status);
      return null;
    }
    return imageId;
  } catch (err) {
    console.warn('[imageStorage] Cloudflare upload error:', err);
    return null;
  }
}

/**
 * Return the best URI to display an image:
 * - Prefer the local file URI when the file exists.
 * - Fall back to the Cloudflare CDN URL when the file is gone (e.g., after reinstall).
 * - Returns undefined if neither option yields a valid URI.
 */
export async function resolveImageUri(
  localUri: string | undefined,
  cloudflareImageId: string | undefined
): Promise<string | undefined> {
  if (localUri) {
    if (Platform.OS === 'web') {
      // On web we can't check file existence, just return it
      return localUri;
    }
    if (FileSystem) {
      try {
        const info = await FileSystem.getInfoAsync(localUri);
        if (info.exists) return localUri;
        // Local file is gone — fall through to CDN
      } catch {
        // Fall through to CDN
      }
    } else {
      // FileSystem unavailable — trust the URI as-is
      return localUri;
    }
  }

  // Fall back to Cloudflare CDN (uses account hash for CDN delivery URLs)
  if (cloudflareImageId) {
    const cfg = getCFConfig();
    if (cfg) {
      return 'https://imagedelivery.net/' + cfg.accountHash + '/' + cloudflareImageId + '/public';
    }
  }

  // No valid URI available
  return undefined;
}
