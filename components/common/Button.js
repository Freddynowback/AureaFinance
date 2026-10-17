import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../../config/theme';
import AppText from './AppText';
import Icon from './Icon';

/** variant: primary | secondary | ghost | danger */
export default function Button({ title, onPress, variant = 'primary', icon, disabled, loading, style, small, accessibilityLabel }) {
  const v = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && { opacity: 0.8 },
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={small ? 16 : 18} color={v.fg} /> : null}
          {title ? <AppText variant={small ? 'small' : 'subtitle'} color={v.fg} style={icon && styles.gap}>{title}</AppText> : null}
        </View>
      )}
    </Pressable>
  );
}

const VARIANTS = {
  primary: { bg: colors.teal, fg: '#0B1A17', border: colors.teal },
  secondary: { bg: colors.elevated, fg: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', fg: colors.textSecondary, border: 'transparent' },
  danger: { bg: 'transparent', fg: colors.coral, border: colors.coral },
};

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 44, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  gap: { marginLeft: spacing.sm },
});
