// Design system for Chowder
// Matches mockup: Red primary, Yellow secondary, White background

import { Platform } from 'react-native';

export const theme = {
  colors: {
    primary: '#DC143C', // Red
    secondary: '#FFD700', // Yellow
    background: '#FFFFFF',
    surface: '#F9F9F9',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#E0E0E0',
    error: '#EF4444',
    star: '#FFD700',
    starEmpty: '#E5E7EB',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 999,
  },
  typography: {
    h1: { fontSize: 28, fontWeight: '700' as const },
    h2: { fontSize: 24, fontWeight: '700' as const },
    h3: { fontSize: 20, fontWeight: '600' as const },
    body: { fontSize: 16, fontWeight: '400' as const },
    bodySmall: { fontSize: 14, fontWeight: '400' as const },
    caption: { fontSize: 12, fontWeight: '400' as const },
  },
  shadow: Platform.select({
    web: {
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
    },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
  }),
};
