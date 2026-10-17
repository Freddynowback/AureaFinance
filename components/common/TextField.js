import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, radii, spacing } from '../../config/theme';
import AppText from './AppText';

export default function TextField({ label, error, hint, style, inputStyle, multiline, ...rest }) {
  return (
    <View style={[styles.wrap, style]}>
      {label ? <AppText variant="caption" color={colors.textSecondary} style={styles.label}>{label}</AppText> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.teal}
        accessibilityLabel={label}
        multiline={multiline}
        style={[styles.input, multiline && styles.multi, error && styles.errorBorder, inputStyle]}
        {...rest}
      />
      {error ? <AppText variant="caption" color={colors.coral} style={styles.msg}>{error}</AppText> : hint ? <AppText variant="caption" color={colors.textMuted} style={styles.msg}>{hint}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: 6 },
  input: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  multi: { minHeight: 80, paddingTop: spacing.md, textAlignVertical: 'top' },
  errorBorder: { borderColor: colors.coral },
  msg: { marginTop: 4 },
});
