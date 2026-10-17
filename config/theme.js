/**
 * Tema "terminal financiera": fondos carbón/grafito, superficies con poca
 * diferencia de luminosidad, bordes discretos y acentos de color contenidos.
 * Branding centralizado en config/brand.js.
 */
export const colors = {
  bg: '#101419',
  surface: '#181F26',
  surfaceAlt: '#1C242C',
  elevated: '#202A32',
  border: '#27323C',
  borderStrong: '#34414D',
  text: '#F1F5F9',
  textSecondary: '#9BAAB5',
  textMuted: '#84939E', // ≥4.5:1 sobre bg, surface y elevated
  teal: '#46C5B0',
  gold: '#E9B65A',
  violet: '#8F86E8',
  coral: '#DF7D93',
  positive: '#46C5B0',
  negative: '#DF7D93',
  warning: '#E9B65A',
  info: '#6C8EF5',
  ringTrack: '#222C35',
  overlay: 'rgba(5, 8, 11, 0.72)',
  tealSoft: 'rgba(70, 197, 176, 0.12)',
  goldSoft: 'rgba(233, 182, 90, 0.12)',
  coralSoft: 'rgba(223, 125, 147, 0.12)',
  violetSoft: 'rgba(143, 134, 232, 0.12)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };

export const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const type = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  amountLg: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  amount: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  small: { fontSize: 13, fontWeight: '400' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  caption: { fontSize: 12, fontWeight: '500' },
};

/** Color de un importe según su efecto. */
export function amountColor(kind) {
  switch (kind) {
    case 'income':
    case 'refund':
      return colors.positive;
    case 'expense':
      return colors.text;
    default:
      return colors.textSecondary;
  }
}

/** Mezcla un color hex con transparencia (para fondos suaves). */
/* eslint-disable no-bitwise */
export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
/* eslint-enable no-bitwise */
