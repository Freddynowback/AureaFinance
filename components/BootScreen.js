import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BRAND } from '../config/brand';
import { colors, spacing } from '../config/theme';
import AppText from './common/AppText';

/** Pantalla de arranque mientras se abre la base de datos (o su error real). */
export default function BootScreen({ error }) {
  return (
    <View style={styles.root}>
      <AppText variant="title">{BRAND.name}</AppText>
      {error ? (
        <>
          <AppText color={colors.coral} style={styles.msg}>No se pudo abrir la base de datos local.</AppText>
          <AppText variant="caption" color={colors.textSecondary} style={styles.msg}>{String(error.message || error)}</AppText>
        </>
      ) : (
        <ActivityIndicator color={colors.teal} style={styles.msg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  msg: { marginTop: spacing.lg, textAlign: 'center' },
});
