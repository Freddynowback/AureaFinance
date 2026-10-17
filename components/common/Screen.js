import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../../config/theme';

/** Contenedor de pantalla con fondo, márgenes seguros y scroll opcional. */
export default function Screen({ children, scroll = true, refreshing, onRefresh, footer, padded = true, topInset = false, contentStyle }) {
  const insets = useSafeAreaInsets();
  const pad = padded ? styles.padded : null;
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {scroll ? (
        <ScrollView
          style={styles.root}
          contentContainerStyle={[pad, { paddingTop: (topInset ? insets.top : 0) + (padded ? spacing.lg : 0), paddingBottom: spacing.xxxl + (footer ? 0 : insets.bottom) }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.teal} colors={[colors.teal]} progressBackgroundColor={colors.surface} /> : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, pad, { paddingTop: topInset ? insets.top : 0 }, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: spacing.lg },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
