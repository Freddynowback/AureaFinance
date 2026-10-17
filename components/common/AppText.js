import React from 'react';
import { Text } from 'react-native';
import { colors, type as typo } from '../../config/theme';

/** Texto con la escala tipográfica del tema. variant: display|amountLg|amount|title|subtitle|body|small|label|caption */
export default function AppText({ variant = 'body', color = colors.text, style, children, ...rest }) {
  return (
    <Text allowFontScaling maxFontSizeMultiplier={1.4} style={[typo[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}
