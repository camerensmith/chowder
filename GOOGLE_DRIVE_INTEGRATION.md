# Google Drive API Integration Guide

This guide walks through integrating the Google Drive API into the Chowder PWA so that each user can back up and sync their data to their own Google Drive account. Because Chowder is an offline-first PWA, the sync layer is designed to work on top of the existing local storage without replacing it.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Google Cloud Setup](#google-cloud-setup)
3. [Installing the Google API Client](#installing-the-google-api-client)
4. [Initializing the gapi Client](#initializing-the-gapi-client)
5. [User Authentication](#user-authentication)
6. [Uploading Data to Google Drive](#uploading-data-to-google-drive)
7. [Downloading / Restoring Data](#downloading--restoring-data)
8. [Permissions and Collaboration](#permissions-and-collaboration)
9. [Offline Support with IndexedDB](#offline-support-with-indexeddb)
10. [Wiring It into the Chowder Settings Screen](#wiring-it-into-the-chowder-settings-screen)
11. [Summary](#summary)

---

## Prerequisites

- A Google account for each user who will sync data.
- The Chowder app running in web/PWA mode (`npm start` → press `w`).
- Node.js 18+ and npm (already required by Chowder).

---

## Google Cloud Setup

### 1. Create a Google Cloud Project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project → New Project**.
3. Enter a project name (e.g., `chowder-drive-sync`) and click **Create**.

### 2. Enable the Google Drive API

1. In the left sidebar go to **APIs & Services → Library**.
2. Search for **Google Drive API** and click **Enable**.

### 3. Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (allows any Google account to sign in) and click **Create**.
3. Fill in the required fields:
   - **App name**: Chowder
   - **User support email**: your email address
   - **Developer contact information**: your email address
4. On the **Scopes** step, add the scope:
   ```
   https://www.googleapis.com/auth/drive.file
   ```
   This scope limits access to only the files your app creates—it cannot read other Drive files belonging to the user.
5. Add any test users (your Google account and your friends') while the app is in **Testing** status.
6. Save and continue through the remaining steps.

### 4. Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Set **Application type** to **Web application**.
3. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8081` (Expo web dev server)
   - Your production PWA URL (if deployed)
4. Under **Authorized redirect URIs**, add the same URLs.
5. Click **Create** and copy the **Client ID** — you will need it in the next steps.

> **Security note:** Never commit the Client ID to a public repository if your app also uses a Client Secret. For a pure browser-side integration using the `drive.file` scope, only the Client ID is needed in the frontend.

---

## Installing the Google API Client

The easiest way to load the `gapi` client library in a web/PWA context is via a `<script>` tag added to `public/index.html`:

```html
<!-- public/index.html -->
<script src="https://apis.google.com/js/api.js" async defer></script>
```

Alternatively, install the typed wrapper for use with TypeScript:

```bash
npm install gapi-script
npm install --save-dev @types/gapi @types/gapi.auth2 @types/gapi.client.drive
```

---

## Initializing the gapi Client

Create a new file `lib/googleDrive.ts` in the Chowder project:

```typescript
// lib/googleDrive.ts

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const DISCOVERY_DOC =
  'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Load and initialize the gapi client. Call once on app start (web only). */
export async function initGoogleDriveClient(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof gapi === 'undefined') {
      // Not running in a web context (e.g. native) or the gapi script
      // has not loaded yet. Log a warning to aid debugging.
      console.warn(
        '[Chowder] Google API (gapi) is not available. ' +
          'Ensure the <script src="https://apis.google.com/js/api.js"> tag is present in public/index.html.',
      );
      resolve();
      return;
    }

    gapi.load('client:auth2', async () => {
      try {
        await gapi.client.init({
          clientId: CLIENT_ID,
          discoveryDocs: [DISCOVERY_DOC],
          scope: SCOPE,
        });
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Returns true when a user is currently signed into Google. */
export function isSignedIn(): boolean {
  if (typeof gapi === 'undefined') return false;
  return gapi.auth2.getAuthInstance().isSignedIn.get();
}
```

Add your Client ID to the environment file:

```
# .env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
```

> Add `.env` to `.gitignore` if it is not already there so the Client ID is not committed.

---

## User Authentication

Add sign-in and sign-out helpers to `lib/googleDrive.ts`:

```typescript
// lib/googleDrive.ts (continued)

/** Prompt the user to sign in with their Google account. */
export async function signIn(): Promise<void> {
  await gapi.auth2.getAuthInstance().signIn();
}

/** Sign the current user out of Google. */
export async function signOut(): Promise<void> {
  await gapi.auth2.getAuthInstance().signOut();
}

/** Returns the OAuth access token for the signed-in user. */
function getAccessToken(): string {
  return gapi.auth.getToken().access_token;
}
```

---

## Uploading Data to Google Drive

The function below serializes any JSON-serializable object (e.g., a full export of the Chowder database) and uploads it to Drive using the multipart upload endpoint:

```typescript
// lib/googleDrive.ts (continued)

const CHOWDER_FILE_NAME = 'chowder-backup.json';

/**
 * Upload (or update) the Chowder backup file in the user's Google Drive.
 * @param data - Any JSON-serializable object to persist.
 * @returns The Drive file ID of the created or updated file.
 */
export async function uploadBackup(data: unknown): Promise<string> {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  // Check whether a backup file already exists so we can update it.
  const existingFileId = await findBackupFileId();

  const metadata = {
    name: CHOWDER_FILE_NAME,
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  form.append('file', blob);

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const method = existingFileId ? 'PATCH' : 'POST';

  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Drive upload failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.id as string;
}

/** Returns the Drive file ID of the existing backup, or null if none exists. */
async function findBackupFileId(): Promise<string | null> {
  const response = await gapi.client.drive.files.list({
    q: `name='${CHOWDER_FILE_NAME}' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });

  const files = response.result.files ?? [];
  return files.length > 0 ? (files[0].id ?? null) : null;
}
```

---

## Downloading / Restoring Data

```typescript
// lib/googleDrive.ts (continued)

/**
 * Download the latest Chowder backup from Google Drive.
 * @returns The parsed JSON object, or null if no backup exists.
 */
export async function downloadBackup(): Promise<unknown | null> {
  const fileId = await findBackupFileId();
  if (!fileId) return null;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${getAccessToken()}` } },
  );

  if (!response.ok) {
    throw new Error(`Drive download failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

---

## Permissions and Collaboration

To share your backup file with a friend so they can read (or edit) your lists:

```typescript
// lib/googleDrive.ts (continued)

export type PermissionRole = 'reader' | 'writer';

/**
 * Share the Chowder backup file with a specific Google account.
 * @param fileId - The Drive file ID returned by uploadBackup().
 * @param email  - The friend's Google account email address.
 * @param role   - 'reader' (view only) or 'writer' (can edit).
 */
export async function shareBackupWithFriend(
  fileId: string,
  email: string,
  role: PermissionRole = 'reader',
): Promise<void> {
  await gapi.client.drive.permissions.create({
    fileId,
    resource: {
      type: 'user',
      role,
      emailAddress: email,
    },
    sendNotificationEmail: true,
  });
}
```

> Using the `drive.file` scope means these permissions only apply to the single backup file—not the user's entire Drive.

---

## Offline Support with IndexedDB

Because Chowder is offline-first, sync should only happen when the app is online. Use the browser's `navigator.onLine` flag and the `online` event to queue a sync:

```typescript
// lib/googleDrive.ts (continued)

/**
 * Queue a sync whenever the app comes back online.
 * Call this once during app initialization (web only).
 * @param getData - Async function that returns the current app data to back up.
 */
export function registerOnlineSyncHandler(
  getData: () => Promise<unknown>,
): void {
  if (typeof window === 'undefined') return;

  const syncWhenOnline = async () => {
    if (!isSignedIn()) return;
    try {
      const data = await getData();
      await uploadBackup(data);
      console.log('[Chowder] Drive sync complete.');
    } catch (err) {
      console.warn('[Chowder] Drive sync failed:', err);
    }
  };

  window.addEventListener('online', syncWhenOnline);

  // Also attempt an immediate sync if already online.
  if (navigator.onLine) {
    syncWhenOnline();
  }
}
```

For longer-lived offline sessions, persist the pending data in `IndexedDB` so it survives page reloads before the sync completes. Add these helpers to `lib/googleDrive.ts`:

```typescript
// lib/googleDrive.ts (continued)

// Persist pending data using IndexedDB
async function savePendingSync(data: unknown): Promise<void> {
  const db = await openPendingSyncDB();
  const tx = db.transaction('pending', 'readwrite');
  tx.objectStore('pending').put({ id: 'latest', data });
  await tx.done;
}

async function loadAndClearPendingSync(): Promise<unknown | null> {
  const db = await openPendingSyncDB();
  const tx = db.transaction('pending', 'readwrite');
  const store = tx.objectStore('pending');
  const record = await store.get('latest');
  if (record) await store.delete('latest');
  await tx.done;
  return record?.data ?? null;
}

async function openPendingSyncDB() {
  // Use the idb library (npm install idb) or the raw IndexedDB API.
  return import('idb').then(({ openDB }) =>
    openDB('chowder-drive-pending', 1, {
      upgrade(db) {
        db.createObjectStore('pending', { keyPath: 'id' });
      },
    }),
  );
}
```

Install the `idb` helper library for a cleaner IndexedDB API:

```bash
npm install idb
```

---

## Wiring It into the Chowder Settings Screen

Add backup/restore controls to `screens/SettingsScreen.tsx`:

```tsx
// screens/SettingsScreen.tsx (additions)

import {
  initGoogleDriveClient,
  isSignedIn,
  signIn,
  signOut,
  uploadBackup,
  downloadBackup,
  registerOnlineSyncHandler,
} from '../lib/googleDrive';

// In your component's useEffect (web only):
useEffect(() => {
  initGoogleDriveClient().then(() => {
    setDriveReady(true);
    if (isSignedIn()) {
      // Register the background sync handler, passing a function
      // that exports the current local database state.
      registerOnlineSyncHandler(() => exportLocalData());
    }
  });
}, []);

// UI example:
<Button
  title={driveSignedIn ? 'Sign out of Google Drive' : 'Sign in to Google Drive'}
  onPress={driveSignedIn ? handleSignOut : handleSignIn}
/>
<Button title="Back up to Google Drive" onPress={handleUpload} />
<Button title="Restore from Google Drive" onPress={handleDownload} />
```

---

## Summary

| Step | What it does |
|------|-------------|
| Google Cloud Setup | Creates credentials and enables the Drive API |
| `initGoogleDriveClient` | Loads and configures the `gapi` client on app start |
| `signIn` / `signOut` | Authenticates the user via Google OAuth |
| `uploadBackup` | Serializes app data and pushes it to the user's Drive |
| `downloadBackup` | Retrieves the latest backup from Drive |
| `shareBackupWithFriend` | Grants a friend read or write access to the backup file |
| `registerOnlineSyncHandler` | Automatically syncs data whenever the device comes online |

With these pieces in place, each Chowder user owns their data in their own Google Drive, and friends can optionally be granted access to shared lists—all without any dedicated backend server.
