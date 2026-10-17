import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../../config/theme';
import AppText from './AppText';
import Icon from './Icon';

const ToastContext = createContext(() => {});

/** Confirmaciones visuales breves, sin bloquear la interfaz ni usar alertas. */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((message, kind = 'success') => {
    clearTimeout(timer.current);
    setToast({ message, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const tone = toast && (toast.kind === 'error' ? colors.coral : toast.kind === 'warning' ? colors.gold : colors.teal);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.anchor, { bottom: insets.bottom + 90 }]}>
          <Animated.View key={toast.id} entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={[styles.toast, { borderColor: tone }]} accessibilityLiveRegion="polite">
            <Icon name={toast.kind === 'error' ? 'alert' : toast.kind === 'warning' ? 'info' : 'check'} size={18} color={tone} />
            <AppText variant="small" style={styles.text}>{toast.message}</AppText>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.elevated, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: 460 },
  text: { marginLeft: spacing.sm, flexShrink: 1 },
});
