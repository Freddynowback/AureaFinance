import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radii, spacing } from '../../config/theme';
import { centsToInput, parseAmount } from '../../utils/money';
import AppText from './AppText';

/**
 * Campo de importe grande. Trabaja en centavos: `value` es entero o null y
 * `onChange` recibe el entero (o null si el texto no es válido).
 */
export default function AmountField({ label, value, onChange, error, autoFocus, large, allowNegative, hint, currencySymbol = '$' }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : centsToInput(value));
  const ref = useRef(null);
  useEffect(() => {
    const parsed = parseAmount(text);
    if (value !== parsed && !(value === null && text === '')) {
      setText(value === null || value === undefined ? '' : centsToInput(value));
    }
    // Solo sincroniza cuando el valor cambia desde fuera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const handle = t => {
    const cleaned = t.replace(allowNegative ? /[^0-9.,-]/g : /[^0-9.,]/g, '');
    setText(cleaned);
    const cents = parseAmount(cleaned);
    onChange(cents === null || (!allowNegative && cents < 0) ? null : cents);
  };
  return (
    <View style={styles.wrap}>
      {label ? <AppText variant="caption" color={colors.textSecondary} style={styles.label}>{label}</AppText> : null}
      <Pressable onPress={() => ref.current && ref.current.focus()} accessible={false} style={[styles.box, large && styles.boxLarge, error && styles.err]}>
        <AppText variant={large ? 'amountLg' : 'amount'} color={colors.textSecondary}>{currencySymbol}</AppText>
        <TextInput
          ref={ref}
          value={text}
          onChangeText={handle}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.teal}
          autoFocus={autoFocus}
          accessibilityLabel={label || 'Importe'}
          style={[styles.input, large && styles.inputLarge]}
        />
      </Pressable>
      {error ? <AppText variant="caption" color={colors.coral} style={styles.msg}>{error}</AppText> : hint ? <AppText variant="caption" color={colors.textMuted} style={styles.msg}>{hint}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: 6 },
  box: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, minHeight: 52 },
  boxLarge: { minHeight: 72, paddingHorizontal: spacing.lg },
  err: { borderColor: colors.coral },
  input: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '600', marginLeft: 6, fontVariant: ['tabular-nums'] },
  inputLarge: { fontSize: 32, fontWeight: '700' },
  msg: { marginTop: 4 },
});
