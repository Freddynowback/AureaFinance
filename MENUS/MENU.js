/**
 * MENU — punto central de navegación de la app.
 * Bottom Tabs para las secciones principales y Native Stack para pantallas
 * secundarias, formularios y detalles. Única fuente de verdad de navegación.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { navigationTheme, stackScreenOptions } from '../navigation/theme';
import Icon from '../components/common/Icon';
import { useSettings } from '../hooks/useSettings';

import INICIO from './INICIO';
import MOVIMIENTOS from './MOVIMIENTOS';
import DEUDAS from './DEUDAS';
import ESTADISTICAS from './ESTADISTICAS';
import MAS from './MAS';
import MOVIMIENTO_FORM from './MOVIMIENTO_FORM';
import MOVIMIENTO_DETALLE from './MOVIMIENTO_DETALLE';
import CUENTAS from './CUENTAS';
import CUENTA_FORM from './CUENTA_FORM';
import CUENTA_DETALLE from './CUENTA_DETALLE';
import INGRESOS from './INGRESOS';
import RECURRENTE_FORM from './RECURRENTE_FORM';
import CATEGORIAS from './CATEGORIAS';
import CATEGORIA_FORM from './CATEGORIA_FORM';
import PRESUPUESTOS from './PRESUPUESTOS';
import PRESUPUESTO_FORM from './PRESUPUESTO_FORM';
import DEUDA_FORM from './DEUDA_FORM';
import DEUDA_DETALLE from './DEUDA_DETALLE';
import GASTO_DIARIO from './GASTO_DIARIO';
import METAS from './METAS';
import META_FORM from './META_FORM';
import META_DETALLE from './META_DETALLE';
import AJUSTES from './AJUSTES';
import IMPORTAR_CSV from './IMPORTAR_CSV';
import ASISTENTE from './ASISTENTE';
import BIENVENIDA from './BIENVENIDA';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  [ROUTES.INICIO]: 'house',
  [ROUTES.MOVIMIENTOS]: 'list',
  [ROUTES.DEUDAS]: 'card',
  [ROUTES.ESTADISTICAS]: 'chart',
  [ROUTES.MAS]: 'more',
};

function Tabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 20 },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [styles.tabBar, { height: 60 + insets.bottom, paddingBottom: insets.bottom + 6 }],
        tabBarLabelStyle: styles.tabLabel,
        animation: 'shift',
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.iconWrap, focused && styles.iconActive]}>
            <Icon name={TAB_ICONS[route.name]} size={21} color={color} strokeWidth={focused ? 2.2 : 1.8} />
          </View>
        ),
      })}>
      <Tab.Screen name={ROUTES.INICIO} component={INICIO} options={{ headerShown: false, title: 'Inicio' }} />
      <Tab.Screen name={ROUTES.MOVIMIENTOS} component={MOVIMIENTOS} options={{ title: 'Movimientos' }} />
      <Tab.Screen name={ROUTES.DEUDAS} component={DEUDAS} options={{ title: 'Deudas' }} />
      <Tab.Screen name={ROUTES.ESTADISTICAS} component={ESTADISTICAS} options={{ title: 'Estadísticas' }} />
      <Tab.Screen name={ROUTES.MAS} component={MAS} options={{ title: 'Más' }} />
    </Tab.Navigator>
  );
}

export default function MENU() {
  const { settings } = useSettings();
  if (!settings) return null;
  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName={settings['onboarding.done'] ? ROUTES.TABS : ROUTES.BIENVENIDA}
        screenOptions={{ ...stackScreenOptions, animation: settings['ui.reduceMotion'] ? 'none' : 'slide_from_right' }}>
        <Stack.Screen name={ROUTES.TABS} component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.BIENVENIDA} component={BIENVENIDA} options={{ headerShown: false }} />
        <Stack.Screen name={ROUTES.MOVIMIENTO_FORM} component={MOVIMIENTO_FORM} options={{ title: 'Nuevo movimiento', animation: settings['ui.reduceMotion'] ? 'none' : 'slide_from_bottom' }} />
        <Stack.Screen name={ROUTES.MOVIMIENTO_DETALLE} component={MOVIMIENTO_DETALLE} options={{ title: 'Detalle' }} />
        <Stack.Screen name={ROUTES.CUENTAS} component={CUENTAS} options={{ title: 'Cuentas' }} />
        <Stack.Screen name={ROUTES.CUENTA_FORM} component={CUENTA_FORM} options={{ title: 'Cuenta' }} />
        <Stack.Screen name={ROUTES.CUENTA_DETALLE} component={CUENTA_DETALLE} options={{ title: 'Cuenta' }} />
        <Stack.Screen name={ROUTES.INGRESOS} component={INGRESOS} options={{ title: 'Ingresos' }} />
        <Stack.Screen name={ROUTES.RECURRENTE_FORM} component={RECURRENTE_FORM} options={{ title: 'Recurrencia' }} />
        <Stack.Screen name={ROUTES.CATEGORIAS} component={CATEGORIAS} options={{ title: 'Categorías' }} />
        <Stack.Screen name={ROUTES.CATEGORIA_FORM} component={CATEGORIA_FORM} options={{ title: 'Categoría' }} />
        <Stack.Screen name={ROUTES.PRESUPUESTOS} component={PRESUPUESTOS} options={{ title: 'Presupuestos' }} />
        <Stack.Screen name={ROUTES.PRESUPUESTO_FORM} component={PRESUPUESTO_FORM} options={{ title: 'Presupuesto' }} />
        <Stack.Screen name={ROUTES.DEUDA_FORM} component={DEUDA_FORM} options={{ title: 'Deuda' }} />
        <Stack.Screen name={ROUTES.DEUDA_DETALLE} component={DEUDA_DETALLE} options={{ title: 'Deuda' }} />
        <Stack.Screen name={ROUTES.METAS} component={METAS} options={{ title: 'Metas de ahorro' }} />
        <Stack.Screen name={ROUTES.META_FORM} component={META_FORM} options={{ title: 'Meta' }} />
        <Stack.Screen name={ROUTES.META_DETALLE} component={META_DETALLE} options={{ title: 'Meta' }} />
        <Stack.Screen name={ROUTES.AJUSTES} component={AJUSTES} options={{ title: 'Ajustes' }} />
        <Stack.Screen name={ROUTES.IMPORTAR_CSV} component={IMPORTAR_CSV} options={{ title: 'Importar CSV' }} />
        <Stack.Screen name={ROUTES.ASISTENTE} component={ASISTENTE} options={{ title: 'Asistente' }} />
        <Stack.Screen name={ROUTES.GASTO_DIARIO} component={GASTO_DIARIO} options={{ title: 'Gasto de hoy' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: colors.bg, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  iconWrap: { width: 44, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.tealSoft },
});
