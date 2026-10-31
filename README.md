# Chowder 🍜

A personal food and restaurant tracking app with a map-centric UI. Track your favorite restaurants, dishes, and visits—all stored locally on your device.

## Features

- **Local-Only Data**: All data stored locally using SQLite (native) or IndexedDB (web)
- **Lists**: Organize restaurants and dishes into custom lists
- **Map View**: See all your places on an interactive map (Leaflet on web)
- **Ratings**: Rate places and dishes with 1-5 star ratings
- **Share Codes**: Share lists via self-contained codes or links (no backend required)
- **Offline-First**: Your data works offline; map tiles and place search need a connection
- **Place Search**: Search for restaurants using Nominatim (OpenStreetMap)
- **Visit Tracking**: Record visits to places with notes and photos
- **Dish Tracking**: Track individual dishes eaten at each place

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (installed globally or via npx)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open the app:
   - Press `w` to open in web browser
   - Press `a` to open in Android emulator
   - Press `i` to open in iOS simulator
   - Scan QR code with Expo Go app on your device

### Checks

```bash
npm run typecheck   # TypeScript (also runs in the deploy workflow)
npm run build:web   # Production web build into dist/, paths fixed for GitHub Pages (/chowder)
```

### How data works

There is no server and no account. Your name/avatar is just a local profile used
as the author on lists you share. Everything else lives on the device
(SQLite on iOS/Android, IndexedDB on web), so **Settings → Backup Data** is the
only copy outside the device — use it, and **Restore** to move to a new phone.

Share codes (`chowder1:…`) contain the whole list, so they import on any device.
On web, the share link (`…/chowder/#share=…`) opens straight into the import screen.

## Project Structure

```
chowder/
├── App.tsx                 # Root component, navigation, startup error screen
├── index.ts                # Entry; installs the web Alert implementation
├── screens/                # Screen components
├── components/
│   ├── MapView.tsx         # Native map (react-native-maps)
│   ├── MapView.web.tsx     # Web map (Leaflet)
│   ├── BottomSheet.tsx     # Shared modal sheet (keyboard-safe)
│   └── ...
├── lib/
│   ├── db.ts               # All data access (SQLite native / IndexedDB web)
│   ├── rating.ts           # The one place a place's rating is computed
│   ├── dialogs.ts          # Alert.alert for web (react-native-web's is a no-op)
│   ├── imageStorage.ts     # pickImage() + persisting photos
│   ├── backup.ts           # Backup/restore to a JSON file
│   ├── sharing.ts          # Share codes and links
│   ├── storage.ts          # Preferences (localStorage / AsyncStorage)
│   ├── tileProviders.ts    # Web map tile styles
│   └── pwa.ts              # Service worker registration
├── public/sw.js            # Service worker (build id stamped by fix-paths.js)
└── types/
```

## Core Principles

- **Local Ownership**: All data belongs to the device owner
- **Author, Not Account**: Profile exists only to name the author of shared recommendations
- **Sharing Is Copy-Only**: Sharing produces a snapshot, importing creates a new list
- **Offline-First**: Your data works offline; map tiles and place search need a connection

## Tech Stack

- React Native
- Expo
- SQLite (expo-sqlite) on native, IndexedDB on web
- React Navigation
- Leaflet (web map)
- TypeScript

## License

Private project
