import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { takePendingShareCode } from './sharing';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Open the import screen if the app was launched from a share link. */
export function openPendingShare() {
  const code = takePendingShareCode();
  if (code && navigationRef.isReady()) navigationRef.navigate('ShareViewer', { code });
}
