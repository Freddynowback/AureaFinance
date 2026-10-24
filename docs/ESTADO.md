# Estado del proyecto — 24 de octubre de 2026 (versión 0.05)

## Versión 0.05: "¿Cuánto puedo gastar hoy?"

- **Nuevo en Inicio:** tarjeta "Hoy puedes gastar" con lo que llevas y una
  barra (verde, amarilla, roja). Pantalla `GASTO_DIARIO` con el desglose.
- **Cálculo** (`services/stats/dailyAllowanceService.js`): dinero disponible
  − pagos que vencen antes del próximo ingreso (tarjetas con lo no financiado
  + mensualidades, mensualidades fuera de tarjeta, gastos recurrentes) −
  compras con tarjeta desde el último ingreso si esa tarjeta vence después −
  colchón − gastos planeados, ÷ días hasta el próximo ingreso. Se recalcula
  siempre: lo gastado de más se reparte en los días restantes. Solo usa la
  fecha del ingreso, nunca su monto; un ingreso sin confirmar no cuenta y se
  avisa. Sin ingreso recurrente, reparte hasta el fin del periodo. Las
  compras a meses no cuentan (cuenta su mensualidad).
- **Gastos planeados** (migración v4, tabla `planned_spends`, incluida en el
  respaldo): se apartan de los días previos y se suman a su día.
- **Colchón** configurable (`daily.cushion`, por defecto $0).
- **Pruebas:** 261/261, 9 nuevas en `tests/integration/dailyAllowance.test.js`.
- **No incluido (decisiones pendientes):** tope por presupuesto, restar
  aportaciones a metas y dar más peso a fines de semana.

## Versión 0.04: recomendado = mensualidad en curso

- **Corregido:** con calendario de meses distintos, "Recomendado por
  periodo" (y el botón Apartar) usaba el importe que más se repetía en todo
  el plan (p. ej. $266) en vez del mes en curso ($650). Ahora es lo que toca
  para la mensualidad más próxima, y cada plan indica los cambios que siguen
  ("luego $380, después $266"). Al pagar un mes, pasa al siguiente.
- **Pruebas:** 252/252.

## Versión 0.03: recomendador por mensualidades

- **Corregido: el recomendador pedía liquidar todo el saldo** antes del
  próximo vencimiento (tomaba esa fecha como límite y repartía ahí el saldo
  completo). Ahora, si la financiación tiene pago mensual fijo o calendario,
  el objetivo por defecto es "Mensualidades": cada mensualidad se reparte
  antes de su fecha ($400 al mes = 2 × $200 por quincena = 4 × $100 por
  semana). Si para la primera queda menos tiempo, sus aportaciones son menos
  y más altas, y se indica. Lo apartado cubre primero la mensualidad más
  próxima. "Liquidar antes" conserva el reparto por fecha límite, que ahora
  parte de la última mensualidad.
- "Ajustar a mi comodidad" avisa si la cantidad no alcanza para alguna
  mensualidad en su fecha.
- **Probado en el emulador:** Laptop $2,400 a $400/mes con vencimiento el
  24 nov → Semanal $100 (24 periodos), Quincenal $200 (12), Mensual $400 (6).
  Liquidar antes (24 abr 2027) → $93 por semana.
- **Pruebas:** 251/251, 6 nuevas en `tests/unit/recommender.test.js`.

## Versión 0.02: calendario de pagos y próximo pago correcto

- **Corregido: el widget "Próximo pago" mostraba la deuda total de la tarjeta.**
  Ahora muestra lo que toca pagar: lo no financiado más las mensualidades del
  mes (pago fijo o mes del calendario). Lo mismo en "Vence tarjeta", la
  notificación de la tarjeta y "Pagos próximos" en Estadísticas. Un plan sin
  pago mensual no se estima: se avisa que falta capturarlo.
- **Nuevo: calendario de pagos personalizado.** Una financiación puede pagarse
  con un calendario: cada mes que muestra el banco, capturado a mano con su
  monto. El saldo pendiente es la suma de los meses; los pagos vinculados
  cubren primero el mes más antiguo (también en parte). Pensado para
  compras a meses revueltas de las que solo se conoce el total de cada mes.
- **Migración v3:** tabla `debt_schedule_items` (incluida en el respaldo). No
  modifica datos existentes; probado actualizando una base de la v0.01.
- **Probado en el emulador (Android 17, APK release firmado):**
  - Actualización real: v0.01 instalada con datos (débito $20,000, NU con
    $5,000 de deuda, plan Audífonos $600 a $100/mes ya incluido) y v0.02
    instalada encima. Los datos se conservaron.
  - Antes (v0.01): "Próximo pago" $5,000 "deuda total de la tarjeta".
    Después (v0.02): $4,500 = $4,400 sin financiar + $100 de mensualidades.
  - Plan con calendario (2 meses: $1,250 y $980, ya incluido): la deuda de la
    tarjeta no cambió; Inicio mostró el mes del calendario ($1,250) y la
    tarjeta $3,520 = $2,170 + $1,350. Tras registrar el pago propuesto
    ($1,250), el mes quedó "Pagado", el siguiente pasó a "Este mes" y la
    tarjeta bajó a $3,250. La edición carga solo los meses que faltan; la
    validación impide guardar meses sin importe.
- **Pruebas:** 245/245 (28 suites), 12 nuevas en
  `tests/integration/debtSchedule.test.js`. Se corrigió una prueba que
  dependía de la fecha (`notificationService`).

## Pendiente agendado (pedido por el usuario, no implementado aún)

**Vincular obligatoriamente los pagos de tarjeta con financiaciones.** Hoy
"Pagar tarjeta" tiene un selector *opcional* de financiación; si no se elige,
baja la deuda de la tarjeta pero no el saldo del plan, y lo no financiado sale
de menos. Diseño acordado:

1. Pregunta obligatoria "¿A qué va este pago?": solo tarjeta / a una
   financiación (elegir cuál) / mixto.
2. Con financiación o mixto, proponer el monto del mes que el usuario capturó
   (editable).
3. Si se paga más que eso, separar automáticamente en dos movimientos: la
   parte del plan (vinculada) y el resto a la tarjeta.
4. Si la tarjeta no tiene financiaciones activas, no preguntar.

También pendiente: separar por fecha de corte lo que toca pagar este mes (hoy
lo no financiado incluye compras posteriores al corte).

---

# Iteración 3 — 17 de octubre de 2026

## Iteración 3: coherencia multi-tarjeta, icono y release listo

- **Coherencia de cálculos verificada** con una semana simulada: débito, efectivo
  y 3 tarjetas, una de ellas sin límite. En cada paso se comprueban gasto
  semanal, saldo líquido, disponible y las tres tarjetas.
  - Débito y efectivo no afectan al crédito, pero sí al gasto del periodo.
  - Comprar con una tarjeta baja solo su disponible.
  - Pagarla lo sube y no cuenta como gasto.
  - Una devolución sube el disponible y baja el gasto.
  - Una compra de la semana anterior suma a la deuda, pero no al gasto de esta
    semana.
- **Corregido:** pagar de más una tarjeta (saldo a favor) ahora sí aumenta el
  disponible, como en el banco.
- **Nuevo aviso:** un movimiento con fecha anterior al saldo inicial de su cuenta
  avisa de que cuenta en el gasto, pero no cambia el saldo.
- **Icono propio generado** (neón azul-morado) en todas las densidades,
  adaptativo y para la tienda.
- **Release listo** (ver docs/RELEASE.md). Esta versión **no se ha compilado**,
  a petición del usuario. Pruebas: 233/233.

---

# Iteración 2

## Iteración 2: crédito real por tarjeta y auditoría completa

- **Crédito por tarjeta:** probado en el emulador con el caso NU. Límite $4,000,
  $600 de compras y $2,400 financiados ("No, súmalo"), con $200 al mes escritos
  a mano. Resultado: en uso $3,000, disponible $1,000; financiado $2,400 y sin
  financiar $600. Aviso no bloqueante si un cargo supera el disponible.
- **Auditorías:**
  - Claude: escenario de un mes con invariantes contables y revisión manual.
    Encontró que una recurrencia automática ligada a una cuenta archivada
    impedía abrir la app; corregido.
  - Codex (gpt-5.6-luna, medio): contable, 10/10 hallazgos corregidos;
    pantallas, 6/6 corregidos.
  - Copilot: integral, 15 hallazgos (1 falso positivo, 11 corregidos,
    1 rechazado, 2 diferidos).
  - Grok: sin resultados por límite de uso gratuito.
- **Pruebas:** 231/231 (26 suites), con 13 de regresión de las auditorías.
  ESLint con 0 errores.
- **Migración v2:** triggers de integridad (`debt_id` solo en pagos; moneda del
  movimiento igual a la de su cuenta) e índice para detectar duplicados.

### Diferido de las auditorías

- Rendimiento de presupuestos con muchos periodos o presupuestos: consultas
  por presupuesto. Irrelevante para pocos presupuestos personales.
- "Marcar liquidada" con saldo pendiente: se mantiene manual a propósito.
- Totales en varias monedas: las cuentas no MXN se muestran aparte, sin
  conversión.

---

# Estado de la iteración 1

## Verificaciones ejecutadas (resultados reales)

| Verificación | Resultado |
|---|---|
| `npx jest` (lógica + interfaz) | **168/168 pruebas en 17 suites** |
| ESLint | 0 errores, 6 avisos de estilos en línea |
| Bundle de producción de Metro | Generado sin errores |
| `assembleDebug` arm64-v8a | **BUILD SUCCESSFUL** |
| `assembleDebug` x86_64 + instalación en emulador (Android 17) | **BUILD SUCCESSFUL**, instalada y ejecutada |
| `assembleRelease` arm64-v8a | **BUILD SUCCESSFUL** (APK sin firmar: falta tu clave de producción) |
| Permisos del APK release | INTERNET, USE_BIOMETRIC, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, WAKE_LOCK, VIBRATE |

### Probado a mano en el emulador

- **Bienvenida:** elegir periodo y crear una cuenta de efectivo con saldo.
- **Gastos e ingresos:** 5 gastos en 5 categorías y 1 ingreso de $1,400.
  - El círculo mostró "GASTO SEMANAL $430 · Restante $970 de $1,400 ingresados".
  - El anillo quedó segmentado proporcionalmente (41.8 / 27.9 / 19.8 / 10.5 %).
- **Estado de cuenta:** apertura animada, desglose, filtro por categoría y lista
  de movimientos.
- **Tarjeta de crédito:** límite y día de pago; crédito disponible correcto.
- **Deuda de $400:**
  - Recomendaciones semanal $100 × 4, quincenal $200 × 2 y mensual $400.
  - Indica qué datos faltan y que no considera intereses.
- **Apartar y pagar:**
  - Apartar $100 redujo el disponible y no el saldo.
  - El pago redujo el saldo líquido y liberó lo apartado.
  - El gasto semanal no cambió (el pago de tarjeta no es gasto).
- **Presupuesto semanal de $400:**
  - Se mostró al 107.5 %.
  - El siguiente gasto pidió confirmación y no lo bloqueó.
  - Llegaron 2 notificaciones reales de Android ("Presupuesto superado" y
    restante).
- **Permiso de notificaciones de Android 13+:** solicitado y concedido. Los avisos
  se programan con alarmas inexactas, sin el permiso de alarma exacta.
- **Biometría:** el módulo nativo detecta que el emulador no tiene biometría ni
  bloqueo y desactiva la opción, sin simular nada.
- **Persistencia:** tras cerrar la app a la fuerza y reabrirla, los datos siguen
  ahí y no se repite la bienvenida.
- **Otras pantallas:** Estadísticas, Movimientos y Ajustes muestran los datos
  reales.

## Criterios de aceptación

| Criterio | Estado |
|---|---|
| Sin Expo; React Native CLI + Metro | ✅ |
| `App.tsx` → `MENU`; menús en `MENUS/` en MAYÚSCULAS | ✅ |
| Bottom Tabs + Native Stack | ✅ probado |
| Interfaz oscura consistente | ✅ |
| Círculo con importes reales y anillo por categorías | ✅ probado |
| Estado de cuenta animado con movimientos reales | ✅ probado |
| Gastos e ingresos persisten | ✅ probado (pruebas + emulador) |
| Categorías gestionables (crear, editar, archivar, eliminar con reasignación) | ✅ pruebas de servicio; pantalla integrada, no recorrida en el emulador |
| Cuentas independientes | ✅ |
| Compras a crédito actualizan la deuda correcta | ✅ pruebas de integración |
| Pagos de tarjeta sin duplicar gasto | ✅ pruebas + emulador |
| Actualización manual de deuda (conciliación) | ✅ pruebas; botón disponible |
| Recomendador coherente | ✅ pruebas + emulador |
| Presupuestos y alertas | ✅ pruebas + emulador |
| Notificaciones locales configurables | ✅ inmediatas verificadas; programadas registradas pero no esperadas hasta que se disparen |
| Biometría en dispositivos compatibles | ⚠️ integración nativa compila y detecta capacidad; **el diálogo biométrico no se probó** (el emulador no tiene huella ni bloqueo) |
| Importar / exportar CSV | ✅ lógica con 6 formatos de ejemplo; ⚠️ el selector de archivos del sistema no se recorrió en el emulador |
| Historial y filtros | ✅ |
| Sin dependencia de Firebase / Supabase / Claude | ✅ |
| Sin claves secretas en la app | ✅ (auditoría de seguridad) |
| Pruebas documentadas | ✅ |
| Documentación de instalación y uso | ✅ README + docs/ |

## Pendiente o con limitaciones

1. **Firma release:** necesitas crear tu clave privada (ver README). Sin ella el
   APK release no se puede instalar.
2. **Biometría:** probar en un teléfono con huella o con PIN configurado.
3. **Selector de archivos (CSV y respaldo):** probar en el teléfono el flujo
   "Elegir archivo" / "Guardar como".
4. **Restaurar respaldo JSON:** no implementado. Solo existe la exportación del
   respaldo completo.
5. **Base local sin cifrar:** la protegen el aislamiento de Android y el
   bloqueo de la interfaz. Para cifrarla haría falta SQLCipher (op-sqlite lo
   soporta) y gestionar la clave en el Keystore.
6. **Supabase:** esquema y RLS propuestos sin validar contra un servidor real.
   El adaptador de sincronización no envía datos.
7. **Firebase Cloud Messaging:** solo la interfaz; necesita tu proyecto
   Firebase.
8. **Asistente con IA:** el backend de referencia no está desplegado; la función
   está desactivada.
9. **Integración bancaria:** solo manual + CSV (ver docs/BANCOS.md).
10. **Pantallas estrechas (< 360 dp):** algunas filas de dos tarjetas o dos
    fechas pueden verse apretadas.
11. **Deuda vs. tarjeta:** al registrar una financiación ya existente, su saldo
    debe estar incluido en la deuda de la tarjeta. El formulario lo advierte; si
    no, concilia la tarjeta.
12. **Antigravity CLI:** agotó su cuota (se restablece en ~7 días). Las tareas
    restantes las hizo Copilot.
13. **Logos de servicios:** son marcas registradas de sus dueños. Se usan como
    iconos opcionales de categoría (Dashboard Icons).

## Siguientes pasos recomendados

1. Crear la clave release, instalar en tu teléfono y usarla una semana con datos
   reales.
2. Probar biometría, importación de un CSV real de tu banco y exportación.
3. Implementar la restauración del respaldo con validación de versión de esquema.
4. Cifrado de la base (SQLCipher + Keystore).
5. Desplegar el backend del asistente si quieres preguntas libres. Las
   respuestas rápidas ya funcionan sin conexión.
6. Validar el esquema Supabase en un proyecto de pruebas antes de sincronizar.
