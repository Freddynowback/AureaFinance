import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../../config/theme';
import AppText from './AppText';
import Icon from './Icon';

/**
 * Hoja inferior animada (aparición con fundido + deslizamiento y ligera
 * expansión). Se cierra con el botón visible, tocando fuera o con el gesto
 * Atrás de Android. Respeta "reducir movimiento".
 */
export default function Sheet({ visible, onClose, title, children, scroll = true, footer, maxHeightRatio = 0.88 }) {
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: reduce ? 0 : 280, easing: Easing.out(Easing.cubic) });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: reduce ? 0 : 200, easing: Easing.in(Easing.cubic) }, done => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const overlay = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panel = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.value * 1.4),
    transform: [{ translateY: (1 - progress.value) * 60 }, { scale: 0.97 + progress.value * 0.03 }],
  }));

  if (!mounted) return null;
  const Body = scroll ? ScrollView : View;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlay]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" accessibilityHint="Cierra esta ventana" />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View style={[styles.panel, { maxHeight: height * maxHeightRatio, paddingBottom: insets.bottom + spacing.md }, panel]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText variant="subtitle" style={styles.title} numberOfLines={1}>{title}</AppText>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar" style={styles.close}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Body
            style={scroll ? styles.flexShrink : styles.flexShrink}
            contentContainerStyle={scroll ? styles.content : undefined}
            keyboardShouldPersistTaps="handled">
            {scroll ? children : <View style={styles.content}>{children}</View>}
          </Body>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: colors.overlay },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { flex: 1 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  flexShrink: { flexShrink: 1 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
