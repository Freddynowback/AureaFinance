import { DarkTheme } from '@react-navigation/native';
import { colors } from '../config/theme';

export const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.teal,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    notification: colors.coral,
  },
};

export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700', fontSize: 18 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.bg },
  animation: 'slide_from_right',
};
