import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { alpha, colors, radii, spacing } from '../../config/theme';
import AppText from './AppText';
import Icon from './Icon';

export default function Chip({ label, selected, onPress, color = colors.teal, icon, dot }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 5, bottom: 5 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.chip,
        selected ? { backgroundColor: alpha(color, 0.16), borderColor: color } : null,
      ]}>
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      {icon ? <Icon name={icon} size={14} color={selected ? color : colors.textSecondary} /> : null}
      <AppText variant="small" color={selected ? colors.text : colors.textSecondary} style={(icon || dot) && { marginLeft: 6 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
