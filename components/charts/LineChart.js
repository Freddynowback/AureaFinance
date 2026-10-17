import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, spacing } from '../../config/theme';
import { formatCompact } from '../../utils/money';
import AppText from '../common/AppText';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Línea simple con área y trazo animado. points: [{ label, value }] (centavos). */
export default function LineChart({ points, color = colors.teal, height = 160, labelEvery }) {
  const { width: screen } = useWindowDimensions();
  const width = screen - spacing.lg * 4;
  const progress = useSharedValue(0);
  const reduce = useReducedMotion();
  const { path, area, coords, max, length } = useMemo(() => {
    const values = points.map(p => p.value);
    const mx = Math.max(1, ...values);
    const mn = Math.min(0, ...values);
    const span = mx - mn || 1;
    const step = points.length > 1 ? width / (points.length - 1) : 0;
    const c = points.map((p, i) => ({ x: points.length > 1 ? i * step : width / 2, y: height - 20 - ((p.value - mn) / span) * (height - 36) }));
    const d = c.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    let len = 0;
    for (let i = 1; i < c.length; i++) len += Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y);
    const a = c.length ? `${d} L${c[c.length - 1].x},${height - 20} L${c[0].x},${height - 20} Z` : '';
    return { path: d, area: a, coords: c, max: mx, length: Math.max(1, len) };
  }, [points, width, height]);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: reduce ? 0 : 800 });
  }, [path, progress, reduce]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  const every = labelEvery || Math.max(1, Math.ceil(points.length / 6));
  return (
    <View accessibilityLabel={`Gráfica de línea, máximo ${formatCompact(max)}`}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.22" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Line x1={0} x2={width} y1={height - 20} y2={height - 20} stroke={colors.border} strokeWidth={1} />
        {area ? <Path d={area} fill="url(#area)" /> : null}
        {path ? <AnimatedPath d={path} stroke={color} strokeWidth={2.2} fill="none" strokeDasharray={[length, length]} animatedProps={animatedProps} strokeLinejoin="round" /> : null}
        {coords.length ? <Circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r={4} fill={color} /> : null}
      </Svg>
      <View style={[styles.labels, { width }]}>
        {points.map((p, i) => (i % every === 0 || i === points.length - 1 ? (
          <AppText key={i} variant="caption" color={colors.textMuted} style={[styles.label, { left: Math.min(width - 40, Math.max(0, coords[i].x - 20)) }]}>{p.label}</AppText>
        ) : null))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { height: 16, position: 'relative', marginTop: -16 },
  label: { position: 'absolute', width: 40, textAlign: 'center', fontSize: 10 },
});
