import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../config/theme';
import Icon from './common/Icon';

/** Icono de categoría sobre un círculo teñido con su color persistente. */
export default function CategoryIcon({ icon, color = colors.textSecondary, size = 40, archived }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '22', opacity: archived ? 0.6 : 1 }]}>
      <Icon name={icon || 'dots'} size={Math.round(size * 0.48)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({ badge: { alignItems: 'center', justifyContent: 'center' } });
