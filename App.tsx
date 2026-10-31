import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from './lib/theme';
import { initializeDatabase, getAuthor } from './lib/db';
import { registerServiceWorker } from './lib/pwa';
import { captureShareCodeFromUrl, listenForShareLinks } from './lib/sharing';
import { navigationRef, openPendingShare } from './lib/navigation';
import { RootStackParamList, MainTabParamList } from './types';

// Screens
import CreateAccountScreen from './screens/CreateAccountScreen';
import DashboardScreen from './screens/DashboardScreen';
import ListsScreen from './screens/ListsScreen';
import MapScreen from './screens/MapScreen';
import SettingsScreen from './screens/SettingsScreen';
import ListDetailScreen from './screens/ListDetailScreen';
import PlaceDetailScreen from './screens/PlaceDetailScreen';
import ShareViewerScreen from './screens/ShareViewerScreen';
import CategoryManagementScreen from './screens/CategoryManagementScreen';
import TileProviderScreen from './screens/TileProviderScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          backgroundColor: theme.colors.background,
          paddingBottom: Platform.OS === 'web' ? theme.spacing.lg : 0,
          height: Platform.OS === 'web' ? 65 : undefined,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Lists"
        component={ListsScreen}
        options={{
          tabBarLabel: 'Lists',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="format-list-bulleted" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarLabel: 'Map',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator({ needsAccount }: { needsAccount: boolean }) {
  const initialRoute: keyof RootStackParamList = needsAccount ? 'CreateAccount' : 'Main';
  
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
      initialRouteName={initialRoute}
    >
      <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
      <Stack.Screen name="Main" component={TabNavigator} />
      <Stack.Screen name="ListDetail" component={ListDetailScreen} />
      <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
      <Stack.Screen name="ShareViewer" component={ShareViewerScreen} />
      <Stack.Screen name="CategoryManagement" component={CategoryManagementScreen} />
      <Stack.Screen name="TileProvider" component={TileProviderScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const init = async () => {
    setInitError(null);
    try {
      await initializeDatabase();
      const author = await getAuthor();
      setNeedsAccount(!author);
      setIsReady(true);
    } catch (error: unknown) {
      console.error('Failed to initialize:', error);
      setInitError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    captureShareCodeFromUrl();
    registerServiceWorker();
    init();
    return listenForShareLinks(openPendingShare);
  }, []);

  if (initError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Chowder couldn't open its database</Text>
        <Text style={styles.errorText}>{initError}</Text>
        <Text style={styles.errorText}>
          {Platform.OS === 'web'
            ? 'Private browsing or blocked site storage can cause this. Your data is not lost.'
            : 'Try closing and reopening the app.'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={init}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef} onReady={() => { if (!needsAccount) openPendingShare(); }}>
          <RootNavigator needsAccount={needsAccount} />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  errorTitle: {
    ...theme.typography.h3,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  errorText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.borderRadius.md,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});

