import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';
import { colors, spacing } from '../../config/theme';
import { formatCompact } from '../../utils/money';
import AppText from '../common/AppText';

/**
 * Barras verticales; con `series` de 2 valores dibuja barras agrupadas
 * (p. ej. ingresos vs gastos). data: [{ label, values: [a, b?] }] en centavos.
 */
export default function BarChart({ data, series = [{ color: colors.teal, name: '' }], height = 170, highlightLast }) {
  const { width: screen } = useWindowDimensions();
  const width = screen - spacing.lg * 4;
  const max = Math.max(1, ...data.flatMap(d => d.values));
  const groups = data.length || 1;
  const groupW = width / groups;
  const barW = Math.max(3, Math.min(26, (groupW * 0.7) / series.length));
  const chartH = height - 22;
  const every = Math.max(1, Math.ceil(data.length / 7));
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <View style={styles.maxRow}><AppText variant="caption" color={colors.textMuted}>{formatCompact(max)}</AppText></View>
      <Svg width={width} height={chartH}>
        <Line x1={0} x2={width} y1={chartH - 1} y2={chartH - 1} stroke={colors.border} />
        <Line x1={0} x2={width} y1={0.5} y2={0.5} stroke={colors.border} strokeDasharray={[3, 4]} />
        {data.map((d, i) =>
          d.values.map((v, s) => {
            const h = v > 0 ? Math.max(2, (v / max) * (chartH - 4)) : 0;
            const x = i * groupW + (groupW - barW * series.length) / 2 + s * barW;
            const last = highlightLast && i === data.length - 1;
            return <Rect key={`${i}-${s}`} x={x} y={chartH - 1 - h} width={barW - 1.5} height={h} rx={2} fill={series[s].color} opacity={highlightLast && !last ? 0.55 : 1} />;
          }),
        )}
      </Svg>
      <View style={[styles.labels, { width }]}>
        {data.map((d, i) => (
          <AppText key={i} variant="caption" color={colors.textMuted} style={[styles.label, { width: groupW }]} numberOfLines={1}>
            {i % every === 0 ? d.label : ''}
          </AppText>
        ))}
      </View>
      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map(s => (
            <View key={s.name} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <AppText variant="caption" color={colors.textSecondary}>{s.name}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  maxRow: { alignItems: 'flex-end', marginBottom: 4 },
  labels: { flexDirection: 'row', marginTop: 4 },
  label: { textAlign: 'center', fontSize: 10 },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
});
