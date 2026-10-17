import React, { memo } from 'react';
import { SvgXml } from 'react-native-svg';
import { BRAND_ICONS, GENERIC_ICONS } from '../../assets/icons';
import { colors } from '../../config/theme';

/**
 * Icono local (sin red). Los iconos genéricos usan currentColor, por eso se
 * tiñen con `color`; los de marca conservan sus colores originales.
 */
function Icon({ name, size = 20, color = colors.text, strokeWidth, accessibilityLabel }) {
  const brand = BRAND_ICONS[name];
  let xml = brand || GENERIC_ICONS[name] || GENERIC_ICONS.dots;
  if (!brand && strokeWidth) xml = xml.replace(/stroke-width="[\d.]+"/, `stroke-width="${strokeWidth}"`);
  // Decorativo por defecto: el texto o la etiqueta del control ya lo describen.
  if (!accessibilityLabel) {
    return <SvgXml xml={xml} width={size} height={size} color={color} accessible={false} importantForAccessibility="no-hide-descendants" />;
  }
  return <SvgXml xml={xml} width={size} height={size} color={color} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} />;
}

export default memo(Icon);

export const CATEGORY_ICON_CHOICES = [
  'food', 'coffee', 'transport', 'fuel', 'plane', 'home', 'bolt', 'phone', 'health', 'dumbbell', 'education', 'book',
  'ticket', 'gamepad', 'music', 'bag', 'shirt', 'gift', 'repeat', 'card', 'piggy', 'salary', 'spark', 'bank', 'cash',
  'coin', 'briefcase', 'users', 'baby', 'paw', 'wrench', 'receipt', 'percent', 'target', 'dots',
  'spotify', 'youtube', 'prime-video', 'disney-plus', 'max', 'apple-tv-plus', 'chatgpt', 'icloud', 'google-drive',
  'github', 'steam', 'xbox', 'playstation',
];
