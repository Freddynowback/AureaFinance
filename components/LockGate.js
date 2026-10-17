import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { BRAND } from '../config/brand';
import { colors, spacing } from '../config/theme';
import { authenticate } from '../services/security/biometricService';
import { useSettings } from '../hooks/useSettings';
import AppText from './common/AppText';
import Button from './common/Button';
import Icon from './common/Icon';

/**
 * Bloqueo de acceso. Si está activado, pide autenticación al abrir y al
 * volver de segundo plano tras el tiempo de gracia. No oculta importes una
 * vez desbloqueada: solo protege el acceso.
 */
export default function LockGate({ children }) {
  const { settings } = useSettings();
  const enabled = !!(settings && settings['security.biometricEnabled']);
  const grace = settings ? Number(settings['security.graceSeconds'] ?? 30) : 30;
  const [locked, setLocked] = useState(null);
  const [error, setError] = useState(null);
  const backgroundAt = useRef(null);
  const busy = useRef(false);

  const unlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    const res = await authenticate(`Desbloquear ${BRAND.name}`);
    busy.current = false;
    if (res.success) setLocked(false);
    else setError(res.unavailable ? 'Este dispositivo no tiene biometría ni bloqueo de pantalla configurado. Desactiva el bloqueo desde Ajustes tras configurarlo en Android.' : res.error);
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (locked === null) {
      setLocked(enabled);
      if (enabled) unlock();
    } else if (!enabled && locked) {
      setLocked(false);
    }
  }, [settings, enabled, locked, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (!enabled) return;
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && backgroundAt.current && !busy.current) {
        const away = (Date.now() - backgroundAt.current) / 1000;
        backgroundAt.current = null;
        if (away >= grace) {
          setLocked(true);
          unlock();
        }
      }
    });
    return () => sub.remove();
  }, [enabled, grace, unlock]);

  if (locked === null) return null;
  if (!locked) return children;
  return (
    <View style={styles.root}>
      <View style={styles.badge}><Icon name="fingerprint" size={40} color={colors.teal} strokeWidth={1.5} /></View>
      <AppText variant="title">{BRAND.name}</AppText>
      <AppText color={colors.textSecondary} style={styles.msg}>Desbloquea para ver tus finanzas.</AppText>
      {error ? <AppText variant="small" color={colors.coral} style={styles.msg}>{error}</AppText> : null}
      <Button title="Desbloquear" icon="lock" onPress={unlock} style={styles.btn} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  badge: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  msg: { marginTop: spacing.sm, textAlign: 'center' },
  btn: { marginTop: spacing.xxl, alignSelf: 'stretch' },
});
