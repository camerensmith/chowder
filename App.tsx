import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from './lib/theme';
import { initializeDatabase, getAuthor } from './lib/db';
import { registerServiceWorker } from './lib/pwa';
import { RootStackParamList, MainTabParamList } from './types';

// Screens
import CreateAccountScreen from './screens/CreateAccountScreen';
import LoginScreen from './screens/LoginScreen';
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
        },
      }}
    >
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
      <Stack.Screen name="Login" component={LoginScreen} />
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

  useEffect(() => {
    // Register service worker for PWA functionality
    registerServiceWorker();

    (async () => {
      try {
        await initializeDatabase();
        const author = await getAuthor();
        setNeedsAccount(!author);
        setIsReady(true);
      } catch (error: unknown) {
        console.error('Failed to initialize:', error);
        setIsReady(true);
      }
    })();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator needsAccount={needsAccount} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

