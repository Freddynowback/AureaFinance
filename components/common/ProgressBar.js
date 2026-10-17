import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors } from '../../config/theme';

/** Barra de progreso animada. `value` 0..1 (se recorta); `over` pinta el exceso. */
export default function ProgressBar({ value, color = colors.teal, height = 8, markers = [] }) {
  const p = useSharedValue(0);
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, value || 0));
  useEffect(() => {
    p.value = withTiming(clamped, { duration: reduce ? 0 : 600 });
  }, [clamped, p, reduce]);
  const style = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}>
      <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: height / 2 }, style]} />
      {markers.map(m => (
        <View key={m} style={[styles.marker, { left: `${Math.min(100, m)}%`, height }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.ringTrack, overflow: 'hidden', width: '100%' },
  fill: { height: '100%' },
  marker: { position: 'absolute', top: 0, width: 1.5, backgroundColor: colors.bg, opacity: 0.8 },
});
