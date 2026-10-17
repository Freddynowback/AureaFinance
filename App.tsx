/**
 * Aurea Finance — punto de entrada.
 * Solo configura los proveedores globales y renderiza el menú principal.
 */
import React from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider } from './hooks/DatabaseProvider';
import { ToastProvider } from './components/common/Toast';
import BootScreen from './components/BootScreen';
import LockGate from './components/LockGate';
import MENU from './MENUS/MENU';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <DatabaseProvider fallback={<BootScreen />} renderError={(e: Error) => <BootScreen error={e} />}>
          <ToastProvider>
            <LockGate>
              <MENU />
            </LockGate>
          </ToastProvider>
        </DatabaseProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#101419' } });
