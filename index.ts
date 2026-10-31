import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { installWebAlert } from './lib/dialogs';
import App from './App';

// Must run before any screen calls Alert.alert (a no-op on react-native-web otherwise).
installWebAlert();

registerRootComponent(App);
