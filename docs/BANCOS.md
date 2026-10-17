# Integración bancaria: investigación y criterio

**Fecha de la investigación:** 17 de octubre de 2026.
**Decisión para v1:** registro manual + importación CSV. No hay conexión bancaria,
scraping, automatización de inicio de sesión ni captura de contraseñas.

La investigación inicial la hizo Copilot CLI (`AureaFinance-agents/logs/copilot-bancos.md`).
Un segundo pase de Copilot para verificar fuentes no pudo abrir las páginas (bloqueo
del entorno), así que Claude verificó directamente los puntos clave. El estado de
cada afirmación se indica abajo.

## Tres vías distintas

| Vía | Qué es | ¿API oficial del banco? |
|---|---|---|
| API bancaria oficial (art. 76 Ley Fintech) | APIs estandarizadas que las entidades deben ofrecer | Sí, pero la capa transaccional no está operativa (ver abajo) |
| Agregador (Belvo, Finerio Connect, Syncfy/Paybook, Prometeo) | Empresa que conecta con varios bancos y normaliza datos | No: es un intermediario con contrato propio |
| Lectura de notificaciones (Android `NotificationListenerService`) | La app lee las notificaciones de las apps bancarias del teléfono | No: solo texto de alertas |

## Hallazgos

| Proveedor / vía | Particulares | Coste | Estado de verificación |
|---|---|---|---|
| **Belvo** | Orientado a empresas (B2B): la empresa contrata y el usuario autoriza sus cuentas | Plan *Launch* **1,000 USD/mes**; *Growth* a medida; *Sandbox* gratis solo para pruebas | **Precio verificado** en belvo.com/plans-and-pricing (página global; no indica país) |
| **Finerio Connect** | B2B | No encontramos precios públicos | Sin verificación primaria |
| **Syncfy / Paybook** | B2B | No encontramos precios públicos | Sin verificación primaria |
| **Prometeo** | B2B, más centrado en validación de cuentas, pagos y tesorería | Cotización a medida | Sin verificación primaria |
| **Art. 76 Ley Fintech** | No es un proveedor | — | Solo la capa de **datos abiertos** tiene reglas publicadas (DOF, 4-jun-2020). Varias fuentes secundarias de 2026 indican que las capas de **datos agregados y transaccionales siguen sin reglas secundarias**. No encontramos un comunicado oficial de 2025-2026 que lo confirme: conviene revisar el DOF y la CNBV |
| **Lectura de notificaciones** | Sí, con permiso local que el usuario concede a mano en Ajustes de Android | Sin coste de proveedor | El requisito del permiso `BIND_NOTIFICATION_LISTENER_SERVICE` es conocido, pero no se pudo citar textualmente la página oficial (truncada) |

Fuentes consultadas: belvo.com/plans-and-pricing;
developer.android.com/reference/android/service/notification/NotificationListenerService;
latamfintech.co (CNBV emite las primeras reglas y estándares de open finance en
México); fiskil.com/es/open-finance-tracker/mexico; facephi.com/observatory
(Ley Fintech en México 2026). Las tres últimas son blogs de proveedores, no fuentes
oficiales.

## Limitaciones reales

- **Agregadores:** requieren contrato, backend propio (las credenciales de API no
  pueden ir en la app), aviso de privacidad y gestión de consentimiento. La
  frecuencia de actualización depende de cada banco; pueden pedir reautenticación
  o romperse cuando cambia el banco. El coste mínimo publicado (Belvo) es
  desproporcionado para uso personal.
- **Lectura de notificaciones:** no es una sincronización. Solo capta lo que el
  banco notifica, no trae historial, el formato cambia sin aviso, puede perder
  eventos y el permiso permite leer notificaciones de otras apps (mensajería,
  códigos OTP). **No se pueden interceptar todas las compras bancarias desde
  Android.** Google Play revisa con lupa este permiso.
- **API oficial (art. 76):** hoy no hay un acceso transaccional estandarizado que
  una persona pueda usar directamente.

## Cómo encaja una integración futura

`services/bank/bankProviders.js` declara las fuentes. Una integración con
agregador debería:

1. Vivir en un backend propio, con contrato firmado con el proveedor.
2. Obtener movimientos **solo lectura** con consentimiento del usuario.
3. Entrar en la app por la misma vía que el CSV (`services/csv/importService.js`):
   vista previa, detección de duplicados por `external_id` y confirmación.
   Nunca se insertan movimientos sin pasar por esa revisión.

Contratar un proveedor implica pagos y un contrato: es una decisión del usuario.
