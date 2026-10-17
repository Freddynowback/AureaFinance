import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../../config/theme';
import AppText from './AppText';
import Icon from './Icon';
import Sheet from './Sheet';

/**
 * Selector con hoja inferior. options: [{ value, label, sublabel?, icon?, color?, disabled? }]
 */
export default function SelectField({ label, value, options, onChange, placeholder = 'Seleccionar', error, hint, emptyText, onCreate, createLabel }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View style={styles.wrap}>
      {label ? <AppText variant="caption" color={colors.textSecondary} style={styles.label}>{label}</AppText> : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label || 'Seleccionar'}: ${current ? current.label : placeholder}`}
        style={[styles.box, error && styles.err]}>
        {current && current.icon ? (
          <View style={[styles.iconDot, { backgroundColor: (current.color || colors.teal) + '22' }]}>
            <Icon name={current.icon} size={16} color={current.color || colors.teal} />
          </View>
        ) : null}
        <AppText style={styles.flex} color={current ? colors.text : colors.textMuted} numberOfLines={1}>
          {current ? current.label : placeholder}
        </AppText>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <AppText variant="caption" color={colors.coral} style={styles.msg}>{error}</AppText> : hint ? <AppText variant="caption" color={colors.textMuted} style={styles.msg}>{hint}</AppText> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label || placeholder}>
        {!options.length ? <AppText color={colors.textSecondary} style={styles.empty}>{emptyText || 'No hay opciones disponibles.'}</AppText> : null}
        {options.map(o => (
          <Pressable
            key={String(o.value)}
            disabled={o.disabled}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: o.value === value, disabled: !!o.disabled }}
            style={({ pressed }) => [styles.option, o.value === value && styles.selected, pressed && { opacity: 0.7 }, o.disabled && { opacity: 0.4 }]}>
            {o.icon ? (
              <View style={[styles.iconDot, { backgroundColor: (o.color || colors.teal) + '22' }]}>
                <Icon name={o.icon} size={16} color={o.color || colors.teal} />
              </View>
            ) : null}
            <View style={styles.flex}>
              <AppText>{o.label}</AppText>
              {o.sublabel ? <AppText variant="caption" color={colors.textSecondary}>{o.sublabel}</AppText> : null}
            </View>
            {o.value === value ? <Icon name="check" size={18} color={colors.teal} /> : null}
          </Pressable>
        ))}
        {onCreate ? (
          <Pressable onPress={() => { setOpen(false); onCreate(); }} style={styles.option} accessibilityRole="button" accessibilityLabel={createLabel || 'Crear nueva'}>
            <View style={[styles.iconDot, { backgroundColor: colors.tealSoft }]}><Icon name="plus" size={16} color={colors.teal} /></View>
            <AppText color={colors.teal}>{createLabel || 'Crear nueva'}</AppText>
          </Pressable>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: 6 },
  box: { minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  err: { borderColor: colors.coral },
  flex: { flex: 1 },
  msg: { marginTop: 4 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radii.md },
  selected: { backgroundColor: colors.elevated },
  iconDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  empty: { paddingVertical: spacing.lg },
});
