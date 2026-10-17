/**
 * Bloqueo de acceso con la biometría del sistema (BiometricPrompt de Android).
 * La app nunca recibe ni guarda huellas o imágenes: solo el resultado
 * éxito/fracaso. Si el dispositivo tiene PIN/patrón, se ofrece como
 * alternativa segura del propio sistema operativo.
 */
import { isSensorAvailable, authenticateWithOptions } from '@sbaiahmed1/react-native-biometrics';

export async function getBiometricSupport() {
  try {
    const info = await isSensorAvailable();
    return {
      available: !!info.available,
      deviceSecure: !!info.isDeviceSecure,
      type: info.biometryType || 'None',
      error: info.available ? null : info.error || null,
    };
  } catch (e) {
    return { available: false, deviceSecure: false, type: 'None', error: e.message };
  }
}

export async function authenticate(reason = 'Desbloquea Aurea Finance') {
  const support = await getBiometricSupport();
  if (!support.available && !support.deviceSecure) {
    return { success: false, unavailable: true, error: 'El dispositivo no tiene biometría ni bloqueo de pantalla' };
  }
  try {
    const res = await authenticateWithOptions({
      title: reason,
      subtitle: 'Tus datos financieros están protegidos',
      cancelLabel: 'Cancelar',
      allowDeviceCredentials: support.deviceSecure,
      disableDeviceFallback: !support.deviceSecure,
    });
    return { success: !!res.success, error: res.success ? null : res.error || 'No autenticado' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
