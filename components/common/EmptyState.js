import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, spacing } from '../../config/theme';
import AppText from './AppText';
import Button from './Button';
import Icon from './Icon';

export default function EmptyState({ icon = 'chart', title, message, actionLabel, onAction, compact }) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={[styles.wrap, compact && styles.compact]}>
      <View style={styles.badge}><Icon name={icon} size={26} color={colors.teal} strokeWidth={1.6} /></View>
      <AppText variant="subtitle" style={styles.center}>{title}</AppText>
      {message ? <AppText variant="small" color={colors.textSecondary} style={[styles.center, styles.msg]}>{message}</AppText> : null}
      {actionLabel ? <Button title={actionLabel} onPress={onAction} small style={styles.btn} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  compact: { paddingVertical: spacing.xl },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  center: { textAlign: 'center' },
  msg: { marginTop: 6, lineHeight: 19 },
  btn: { marginTop: spacing.lg },
});
