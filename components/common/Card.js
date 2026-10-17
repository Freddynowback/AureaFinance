import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radii, spacing } from '../../config/theme';

/** Tarjeta de superficie. Con `onPress` es pulsable; `index` escalona la entrada. */
export default function Card({ children, style, onPress, elevated, index = 0, accessibilityLabel, animate = true }) {
  const content = onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, elevated && styles.elevated, pressed && styles.pressed, style]}>
      {children}
    </Pressable>
  ) : (
    <View style={[styles.card, elevated && styles.elevated, style]} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
  if (!animate) return content;
  // El contenedor animado hereda las propiedades de diseño (flex, márgenes) para
  // que la tarjeta se reparta bien dentro de filas.
  const flat = StyleSheet.flatten(style) || {};
  const outer = {};
  for (const k of ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'alignSelf']) if (flat[k] !== undefined) outer[k] = flat[k];
  return (
    <Animated.View style={outer} entering={FadeInDown.duration(320).delay(Math.min(index, 8) * 45)}>
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  elevated: { backgroundColor: colors.elevated },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
