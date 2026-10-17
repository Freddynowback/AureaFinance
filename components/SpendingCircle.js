import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, spacing } from '../config/theme';
import { formatMoney } from '../utils/money';
import AppText from './common/AppText';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const GAP_DEG = 2.2; // separación visual entre segmentos

/**
 * Un segmento del anillo. Su longitud es proporcional al gasto de la
 * categoría; `progress` (0..1) anima el crecimiento al cambiar de periodo.
 */
function Segment({ cx, r, stroke, circumference, startFraction, fraction, color, progress, gap }) {
  const animatedProps = useAnimatedProps(() => {
    const len = Math.max(0, fraction * circumference * progress.value - gap);
    return {
      strokeDasharray: [len, circumference],
      strokeDashoffset: -startFraction * circumference * progress.value,
    };
  });
  return (
    <AnimatedCircle
      cx={cx}
      cy={cx}
      r={r}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="butt"
      fill="none"
      animatedProps={animatedProps}
    />
  );
}

/**
 * Círculo financiero principal.
 * segments: [{ categoryId, name, color, amount, percent }] ya ordenados.
 * remaining: resultado de resolveRemaining().
 */
export default function SpendingCircle({ label, spent, remaining, segments, onPress, periodKey, currency = 'MXN' }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - spacing.lg * 2 - 24, 300);
  const stroke = Math.max(14, Math.round(size * 0.065));
  const r = (size - stroke) / 2 - 4;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  const reduce = useReducedMotion();

  const total = useMemo(() => segments.reduce((s, x) => s + x.amount, 0), [segments]);
  const layout = useMemo(() => {
    let acc = 0;
    return segments.map(s => {
      const fraction = total > 0 ? s.amount / total : 0;
      const item = { ...s, startFraction: acc, fraction };
      acc += fraction;
      return item;
    });
  }, [segments, total]);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: reduce ? 0 : 900, easing: Easing.out(Easing.cubic) });
  }, [periodKey, total, progress, reduce]);

  const gap = segments.length > 1 ? (GAP_DEG / 360) * circumference : 0;
  const hasData = total > 0;
  const rem = remaining || { base: 'none' };
  const baseText =
    rem.base === 'budget'
      ? `de ${formatMoney(rem.baseAmount, currency, { showCents: false })} presupuestados`
      : rem.base === 'income'
        ? `de ${formatMoney(rem.baseAmount, currency, { showCents: false })} ingresados`
        : rem.base === 'expected'
          ? `de ${formatMoney(rem.baseAmount, currency, { showCents: false })} previstos`
          : null;
  const a11y = `${label}: ${formatMoney(spent, currency)}. ${
    rem.remaining !== null && rem.remaining !== undefined
      ? `${rem.remaining < 0 ? 'Excedido por' : 'Restante'} ${formatMoney(Math.abs(rem.remaining), currency)}${rem.estimated ? ', estimado' : ''}. `
      : ''
  }${segments.slice(0, 4).map(s => `${s.name} ${s.percent} por ciento`).join(', ')}. Toca para ver el estado de cuenta.`;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${cx}, ${cx}`}>
            <Circle cx={cx} cy={cx} r={r} stroke={colors.ringTrack} strokeWidth={stroke} fill="none" />
            {hasData
              ? layout.map(s => (
                  <Segment
                    key={s.categoryId}
                    cx={cx}
                    r={r}
                    stroke={stroke}
                    circumference={circumference}
                    startFraction={s.startFraction}
                    fraction={s.fraction}
                    color={s.color}
                    progress={progress}
                    gap={gap}
                  />
                ))
              : null}
            <Circle cx={cx} cy={cx} r={r - stroke / 2 - 7} stroke={colors.border} strokeWidth={1} fill="none" />
          </G>
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <AppText variant="label" color={colors.textSecondary}>{label}</AppText>
          <AppText variant="display" style={styles.spent} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(spent, currency, { showCents: spent % 100 !== 0 })}
          </AppText>
          {rem.remaining !== null && rem.remaining !== undefined ? (
            <>
              <AppText variant="caption" color={colors.textSecondary} style={styles.remLabel}>
                {rem.remaining < 0 ? 'Excedido' : rem.estimated ? 'Restante estimado' : 'Restante'}
              </AppText>
              <AppText variant="amount" color={rem.remaining < 0 ? colors.coral : colors.teal} numberOfLines={1}>
                {formatMoney(Math.abs(rem.remaining), currency, { showCents: rem.remaining % 100 !== 0 })}
              </AppText>
              {baseText ? <AppText variant="caption" color={colors.textMuted} style={styles.base} numberOfLines={1}>{baseText}</AppText> : null}
            </>
          ) : (
            <AppText variant="caption" color={colors.textMuted} style={styles.hint}>
              {hasData ? 'Configura un ingreso o presupuesto para ver tu restante' : 'Sin gastos en este periodo'}
            </AppText>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', marginVertical: spacing.md },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  spent: { marginTop: 4 },
  remLabel: { marginTop: spacing.sm },
  base: { marginTop: 2 },
  hint: { marginTop: spacing.sm, textAlign: 'center' },
});
