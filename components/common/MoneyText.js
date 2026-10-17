import React from 'react';
import { formatMoney } from '../../utils/money';
import AppText from './AppText';

/** Importe con formato MXN y lectura accesible ("1,234 pesos con 50 centavos"). */
export default function MoneyText({ cents, currency = 'MXN', variant = 'amount', color, sign, showCents = true, style, estimated }) {
  const text = formatMoney(cents, currency, { sign, showCents });
  const abs = Math.abs(cents || 0);
  const label = `${cents < 0 ? 'menos ' : ''}${Math.floor(abs / 100)} pesos${abs % 100 ? ` con ${abs % 100} centavos` : ''}${estimated ? ', estimado' : ''}`;
  return (
    <AppText variant={variant} color={color} style={style} accessibilityLabel={label} numberOfLines={1} adjustsFontSizeToFit>
      {estimated ? '≈ ' : ''}{text}
    </AppText>
  );
}
