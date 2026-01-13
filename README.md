# Chowder 🍜

A personal food and restaurant tracking app with a map-centric UI. Track your favorite restaurants, dishes, and visits—all stored locally on your device.

## Features

- **Local-Only Data**: All data stored locally using SQLite (native) or localStorage (web)
- **Lists**: Organize restaurants and dishes into custom lists
- **Map View**: See all your places on an interactive map (Leaflet on web)
- **Ratings**: Rate places and dishes with 1-5 star ratings
- **Share Codes**: Share lists via client-side generated codes (no backend required)
- **Offline-First**: Works fully offline after initial setup
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

2. (Optional) Configure backend API URL:
   - Create a `.env` file in the root directory
   - Add: `EXPO_PUBLIC_API_URL=https://your-api-url.com`
   - If not set, the app will work in offline mode (no backend required)

3. Start the development server:
```bash
npm start
```

4. Open the app:
   - Press `w` to open in web browser
   - Press `a` to open in Android emulator
   - Press `i` to open in iOS simulator
   - Scan QR code with Expo Go app on your device

### Backend Configuration

The app works in two modes:

**Offline Mode (Default):**
- No backend server required
- All data stored locally
- Sign up/sign in works without API
- Perfect for personal use

**Backend Mode:**
- Set `EXPO_PUBLIC_API_URL` environment variable
- Backend should provide:
  - `POST /api/auth/signup` - User registration
  - `POST /api/auth/login` - User authentication
  - `GET /api/health` - Health check endpoint
  - JWT token-based authentication

**Email Functionality:**
- Email sending (e.g., welcome emails) is implemented in the frontend but requires a backend server
- The frontend calls `POST /api/email/welcome` with `{ email, displayName }` when a user signs up
- Backend must implement this endpoint with email service integration (SendGrid, AWS SES, etc.)
- If the backend is unavailable or email sending fails, user signup still succeeds (offline-first design)
- When email is successfully sent, users receive a confirmation message

**Backend Email Endpoint Requirements:**
```
POST /api/email/welcome
Body: { email: string, displayName: string }
Response: 200 OK (or appropriate status code)

Example response:
{
  "success": true,
  "message": "Welcome email sent"
}
```

## Project Structure

```
chowder/
├── App.tsx                 # Root component and navigation
├── screens/                # Screen components
│   ├── CreateAccountScreen.tsx
│   ├── ListsScreen.tsx
│   ├── MapScreen.tsx
│   ├── ListDetailScreen.tsx
│   ├── PlaceDetailScreen.tsx
│   ├── SettingsScreen.tsx
│   └── ShareViewerScreen.tsx
├── components/             # Reusable components
│   ├── MapView.tsx
│   ├── PlaceSearchModal.tsx
│   └── ShareCodeGenerator.tsx
├── lib/                    # Utilities and services
│   ├── db.ts              # Database operations
│   ├── theme.ts           # Design system
│   ├── maps.ts            # Map/search utilities
│   └── sharing.ts         # Share code generation
└── types/                  # TypeScript types
    └── index.ts
```

## Core Principles

- **Local Ownership**: All data belongs to the device owner
- **Author, Not Account**: Profile exists only to name the author of shared recommendations
- **Sharing Is Copy-Only**: Sharing produces a snapshot, importing creates a new list
- **Offline-First**: App works fully offline after initial setup

## Tech Stack

- React Native
- Expo
- SQLite (expo-sqlite)
- React Navigation
- Leaflet (web map)
- TypeScript

## License

Private project
