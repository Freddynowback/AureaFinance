import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../config/theme';
import AppText from './AppText';
import Button from './Button';
import Sheet from './Sheet';

/** Confirmación explícita para acciones destructivas o importantes. */
export default function ConfirmSheet({ visible, title, message, confirmLabel = 'Confirmar', danger, onConfirm, onCancel, loading }) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={title} scroll={false}>
      <AppText color={colors.textSecondary} style={styles.msg}>{message}</AppText>
      <View style={styles.row}>
        <Button title="Cancelar" variant="secondary" onPress={onCancel} style={styles.btn} />
        <Button title={confirmLabel} variant={danger ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} style={styles.btn} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  msg: { marginBottom: spacing.xl, lineHeight: 21 },
  row: { flexDirection: 'row', gap: spacing.md },
  btn: { flex: 1 },
});
