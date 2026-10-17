import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radii, spacing } from '../../config/theme';
import { dateTimeToDate, dateToDateTime, formatDate, timePart } from '../../utils/dates';
import AppText from './AppText';
import Icon from './Icon';

/**
 * Fecha (y hora opcional) en texto local 'YYYY-MM-DD HH:MM:SS'.
 * mode: 'datetime' | 'date'. En modo 'date' el valor es 'YYYY-MM-DD'.
 */
export default function DateTimeField({ label, value, onChange, mode = 'datetime', error, optional, onClear }) {
  const [picker, setPicker] = useState(null);
  const asDate = value ? dateTimeToDate(mode === 'date' ? `${value} 12:00:00` : value) : new Date();
  const apply = (event, selected) => {
    const step = picker;
    setPicker(null);
    if (event.type !== 'set' || !selected) return;
    if (mode === 'date') {
      onChange(dateToDateTime(selected).slice(0, 10));
    } else if (step === 'date') {
      const merged = new Date(asDate);
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      onChange(dateToDateTime(merged));
    } else {
      const merged = new Date(asDate);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      onChange(dateToDateTime(merged));
    }
  };
  return (
    <View style={styles.wrap}>
      {label ? <AppText variant="caption" color={colors.textSecondary} style={styles.label}>{label}</AppText> : null}
      <View style={styles.row}>
        <Pressable style={[styles.box, styles.flex, error && styles.err]} onPress={() => setPicker('date')} accessibilityRole="button" accessibilityLabel={`${label || 'Fecha'}: ${value ? formatDate(value) : 'sin fecha'}`}>
          <Icon name="calendar" size={18} color={colors.textSecondary} />
          <AppText style={styles.text} color={value ? colors.text : colors.textMuted} numberOfLines={1}>{value ? formatDate(value, { withWeekday: true }) : 'Sin fecha'}</AppText>
          {optional && value ? (
            <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Quitar fecha"><Icon name="close" size={16} color={colors.textMuted} /></Pressable>
          ) : null}
        </Pressable>
        {mode === 'datetime' ? (
          <Pressable style={[styles.box, styles.time]} onPress={() => setPicker('time')} accessibilityRole="button" accessibilityLabel={`Hora: ${timePart(value || '')}`}>
            <Icon name="clock" size={18} color={colors.textSecondary} />
            <AppText style={styles.text}>{value ? timePart(value) : '--:--'}</AppText>
          </Pressable>
        ) : null}
      </View>
      {error ? <AppText variant="caption" color={colors.coral} style={styles.msg}>{error}</AppText> : null}
      {picker ? <DateTimePicker value={asDate} mode={picker === 'time' ? 'time' : 'date'} is24Hour onChange={apply} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: 6 },
  row: { flexDirection: 'row', gap: spacing.sm },
  box: { minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  flex: { flex: 1 },
  time: { width: 110 },
  text: { marginLeft: spacing.sm, flex: 1 },
  err: { borderColor: colors.coral },
  msg: { marginTop: 4 },
});
