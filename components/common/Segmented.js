import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii } from '../../config/theme';
import AppText from './AppText';

/** Control segmentado. options: [{ value, label }] */
export default function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="tablist">
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.item, active && styles.active]}>
            <AppText variant="small" color={active ? colors.text : colors.textSecondary} style={active && styles.bold} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.md, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  item: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: 4 },
  active: { backgroundColor: colors.elevated },
  bold: { fontWeight: '600' },
});
