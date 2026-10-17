/**
 * Interfaz para notificaciones push remotas (Firebase Cloud Messaging) en una
 * fase posterior. NO está activa: no hay google-services.json, proyecto
 * Firebase ni tokens en este repositorio. Ver docs/INTEGRACIONES.md.
 *
 * Un proveedor real deberá implementar:
 *   isConfigured(): boolean
 *   register(): Promise<{ token }>    // solo tras consentimiento
 *   unregister(): Promise<void>
 */
export const disabledPushProvider = {
  name: 'none',
  isConfigured: () => false,
  async register() {
    throw new Error('Las notificaciones push remotas no están configuradas');
  },
  async unregister() {},
};

export function getPushProvider() {
  return disabledPushProvider;
}
