# Integraciones futuras (desactivadas)

La app funciona por completo sin red: ni Firebase, ni Supabase ni Claude son
necesarios para ninguna función principal. Nada de esto está activado y el
repositorio no contiene claves, identificadores de proyecto ni archivos de
configuración de servicios externos.

## Firebase Cloud Messaging (notificaciones push)

Estado: **no configurado**. Las notificaciones actuales son **locales**
(`services/notifications/`), funcionan sin conexión y no requieren Firebase.

Punto de integración: `services/notifications/pushProvider.js` (interfaz
`isConfigured / register / unregister`).

Pasos cuando lo decidas:

1. Crear un proyecto en la consola de Firebase y registrar la app Android
   `com.aureafinance`.
2. Descargar `google-services.json` a `android/app/` (no subirlo a repositorios
   públicos) y aplicar el plugin `com.google.gms.google-services` en Gradle.
3. Usar el modo FCM de `react-native-notify-kit` (guía `docs/fcm-mode.mdx` del
   repositorio github.com/marcocrupi/react-native-notify-kit) o
   `@react-native-firebase/messaging`.
4. Implementar un `pushProvider` real y pedir consentimiento antes de registrar
   el token.
5. Proteger cualquier base de datos de Firebase con reglas de seguridad; una
   clave pública de Firebase **no** sustituye a las reglas.

## Supabase (sincronización)

Estado: **no configurado**. Los cambios locales se registran en la tabla
`change_log` mediante triggers SQL, listos para enviarse.

Diseño preparado (propuesto por Antigravity y revisado por Claude):
`docs/supabase/schema.sql`, `docs/supabase/rls.sql` y `docs/supabase/SYNC.md`.
**No se han validado contra un servidor PostgreSQL real**: ejecútalos primero en
un proyecto de pruebas.

- Cada tabla lleva `user_id` y políticas RLS `auth.uid() = user_id`.
- Claves foráneas compuestas `(user_id, id)` para impedir referencias a filas de
  otro usuario.
- La app solo podrá usar la clave pública (anon) + sesión del usuario.
  **Nunca** la `service_role`.
- `services/sync/syncAdapter.js` solo marca un cambio como sincronizado con la
  lista confirmada por el servidor (`markSynced`).

## Asistente con Claude

Estado: **desactivado por defecto**. Las respuestas rápidas
(`services/ai/insightsEngine.js`) se calculan en el teléfono sin red ni coste.

La IA opcional usa un **servidor propio**. La app nunca contiene una clave de
Anthropic.

- Modelo previsto: **Claude Haiku 5.5** (`claude-haiku-5-5`). Según la referencia
  oficial consultada el 17-oct-2026, cuesta 0.10 USD por millón de tokens de
  entrada y 0.50 USD por millón de salida (prompts de hasta 100K tokens).
  Verifica precios antes de desplegar.
- Backend de referencia: `docs/backend-asistente/index.ts` (SDK oficial
  `@anthropic-ai/sdk`, esfuerzo `low`, máximo de tokens acotado, manejo de
  `stop_reason: "refusal"`, token de acceso propio y sin registrar el contexto).
- Contrato: `POST` con `{ question, context, maxTokens, model }` → `{ answer }`.
  `model` es informativo: el backend de referencia fija `claude-haiku-5-5` y lo
  ignora. Cabecera `Authorization: Bearer TOKEN`, donde TOKEN es el valor de
  `AUREA_ACCESS_TOKEN` de tu servidor.
- La app envía solo agregados en pesos (gasto total, ingresos, restante,
  categorías con importes y porcentajes, presupuestos y próximos pagos). No envía
  movimientos individuales, descripciones, cuentas ni identificadores.
- Controles en Ajustes: activar/desactivar, URL https, token, límite mensual de
  consultas (aviso al 80 %), longitud máxima de respuesta.
- Los cálculos los hace la app; la IA solo redacta, y no ejecuta pagos ni
  modifica datos.

Para activarlo: despliega el backend con `ANTHROPIC_API_KEY` y
`AUREA_ACCESS_TOKEN` como secretos del servidor. Después, en Ajustes → Asistente,
activa el interruptor y escribe la URL y el token.

## Variables de entorno

Ver `.env.example`. La app móvil no lee variables de entorno con secretos: esas
variables son para el backend opcional y para firmar la versión release.
