import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../config/theme';
import AppText from './AppText';
import Icon from './Icon';

/** Fila de lista/ajustes con icono, título, detalle y chevron. */
export default function ListRow({ icon, iconColor = colors.teal, title, subtitle, right, onPress, last, danger }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [styles.row, !last && styles.border, pressed && { opacity: 0.7 }]}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: iconColor + '1F' }]}><Icon name={icon} size={18} color={iconColor} /></View>
      ) : null}
      <View style={styles.flex}>
        <AppText color={danger ? colors.coral : colors.text}>{title}</AppText>
        {subtitle ? <AppText variant="caption" color={colors.textSecondary} style={styles.sub}>{subtitle}</AppText> : null}
      </View>
      {typeof right === 'string' ? <AppText variant="small" color={colors.textSecondary}>{right}</AppText> : right}
      {onPress ? <Icon name="chevron-right" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, minHeight: 56 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  flex: { flex: 1, marginRight: spacing.sm },
  sub: { marginTop: 2 },
});
