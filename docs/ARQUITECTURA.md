# Arquitectura y decisiones técnicas

## Capas

```
App.tsx            Proveedores globales (gestos, safe area, BD, avisos, bloqueo) → MENU
MENUS/             Pantallas. MENU.js es la única configuración de navegación
components/        Componentes reutilizables (círculo, estado de cuenta, formularios, gráficos)
hooks/             Acceso a la BD desde React (DatabaseProvider, useQuery, useSettings, useSubmit)
services/          Lógica de negocio: validación, reglas contables, cálculos, integraciones
database/          SQLite: envoltorio con transacciones, drivers, esquema, migraciones, repositorios
utils/             Dinero en centavos, fechas locales, periodos, IDs, errores
config/            Tema, marca, monedas, categorías y preferencias por defecto
```

Las pantallas no hacen cálculos financieros: piden datos a `services/`, que usan
`database/repositories/` (SQL parametrizado) y las reglas de
`services/transactions/rules.js`.

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| React Native | 0.87.1 (CLI, sin Expo) | Estable desde agosto de 2026; la 0.88.0 salió el 15-oct-2026 |
| JDK | Temurin 17 | Requisito de AGP/Gradle de RN; el JDK 27 por defecto del sistema no se usa para compilar |
| SQLite | `@op-engineering/op-sqlite` 18.2.5 | JSI, nueva arquitectura, mantenido; base en almacenamiento privado (sin permisos) |
| Pruebas de BD | `node:sqlite` (Node 26) | Las pruebas usan SQLite real, sin mocks, con el mismo envoltorio `Database` |
| Animaciones | Reanimated 4.7.1 + Worklets 0.13 | Compatible con RN 0.86–0.88; respeta "reducir movimiento" |
| Gráficos | `react-native-svg` + componentes propios | Anillo segmentado animado a medida; sin dependencias pesadas |
| Notificaciones | `react-native-notify-kit` 10.8.1 | Fork mantenido de Notifee (archivado en 2024) con TurboModule. Se fijó 10.8.1 y no la 10.9.0 publicada el mismo día |
| Biometría | `@sbaiahmed1/react-native-biometrics` 0.16.1 | Mantenida, TurboModule. `react-native-biometrics` 3.0.1 no se publica desde 2022 |
| Archivos | `@react-native-documents/picker` 12 + `@dr.pogodin/react-native-fs` 2.40 | Selector del sistema (SAF): sin permisos de almacenamiento; se descartó `react-native-share` |
| CSV | Lector propio (`services/csv/csvParser.js`) | Control de formatos mexicanos, comillas, BOM y separadores; probado |
| Iconos | 74 de Lucide (ISC) + 14 marcas de Dashboard Icons (Apache-2.0): 88 SVG locales | Revisados (sin scripts ni enlaces externos; 2 excluidos por usar `<style>`); empaquetados por `scripts/build-icons.js` |

Las compatibilidades de las librerías nativas las investigó un agente (Antigravity) y
se verificaron contra npm (fechas de publicación, peerDependencies, codegenConfig)
antes de instalarlas.

## Dinero

- Todo importe es un **entero en centavos** (`utils/money.js`). No se usa coma
  flotante para calcular.
- `splitEvenly` reparte cantidades en partes que suman exactamente el total
  (pesos enteros cuando es posible; el residuo de centavos va a la primera parte).
- `percentages` usa el método del mayor residuo para que los porcentajes sumen 100.
- Cada cuenta y movimiento guarda su moneda (`config/currencies.js`); no se
  permiten transferencias entre monedas distintas mientras no exista conversión.

## Fechas y periodos

- Fechas como texto local `YYYY-MM-DD` / `YYYY-MM-DD HH:MM:SS`. México no aplica
  horario de verano desde 2022, así que la hora local es estable y las
  comparaciones en SQLite son lexicográficas.
- Periodos `[inicio, fin)`: diario, semanal (día de inicio configurable),
  quincenal (1–15 / 16–fin de mes, o cada 14 días desde una fecha de referencia),
  mensual (día de inicio 1–28), anual y personalizado.

## Modelo de datos (esquema v1)

| Tabla | Contenido |
|---|---|
| `accounts` | Cuentas: tipo, moneda, saldo inicial con signo y su fecha, límite, día de corte y de pago, estado |
| `categories` | Nombre, color persistente, icono, tipo (gasto/ingreso/ambos), activa/archivada |
| `transactions` | Movimientos: `expense`, `income`, `transfer`, `card_payment`, `refund`, `adjustment` |
| `debts` | Financiaciones manuales ligadas a una cuenta de crédito |
| `debt_balance_snapshots` | Historial de saldos de deuda (inicial y conciliaciones) |
| `reservations` | Dinero apartado para deudas o metas (+ apartar / − liberar) |
| `goals` | Metas de ahorro (reserva virtual o en cuenta de ahorro) |
| `budgets` | Presupuesto general o por categoría, periodo, límite y umbrales |
| `recurring_rules` / `recurring_occurrences` | Ingresos y gastos recurrentes; ocurrencias únicas por (regla, fecha) |
| `import_batches` | Lotes de importación CSV (permite deshacer) |
| `settings` | Preferencias (JSON) |
| `notification_log` | Alertas inmediatas ya mostradas (evita duplicados) |
| `change_log` | Cambios registrados por triggers para una futura sincronización |

Restricciones `CHECK` impiden importes inválidos (por ejemplo, gastos ≤ 0),
transferencias a la misma cuenta o gastos sin categoría. Las migraciones están en
`database/migrations/` y se aplican una vez, dentro de una transacción.

## Reglas contables (`services/transactions/rules.js`)

| Tipo | Cuenta origen | Cuenta destino | ¿Gasto? | ¿Ingreso? |
|---|---|---|---|---|
| Gasto | − importe (en crédito: + deuda) | — | Sí | No |
| Ingreso | + importe | — | No | Sí |
| Transferencia | − importe | + importe | No | No |
| Pago de tarjeta | − importe | − deuda de esa tarjeta | **No** (la compra ya contó) | No |
| Devolución | + importe | — | Resta del gasto de su categoría | **No** |
| Ajuste | ± diferencia | — | No | No |

- **Los saldos no se guardan**: se calculan (`BALANCE_SQL`) a partir del saldo
  inicial y los movimientos posteriores a su fecha. Editar o borrar un movimiento
  nunca deja un saldo desfasado.
- **Compra a crédito**: un único gasto en la tarjeta elegida; aumenta su deuda y
  reduce el crédito disponible. Si es financiada, además se crea un plan de deuda
  ligado a ese gasto (sin contarlo dos veces).
- **Pago de tarjeta**: un pago vinculado a una financiación solo puede ir a la
  tarjeta de esa financiación (validado).
- **Devolución vinculada**: misma categoría y moneda que el gasto original y nunca
  mayor que lo pendiente de devolver.

## Deudas

- Saldo pendiente = último saldo conciliado − pagos vinculados **registrados
  después** de esa conciliación. Actualizar el saldo cada mes crea una
  conciliación (historial), nunca un gasto.
- Recomendador (`services/debts/recommender.js`): planes semanal, quincenal y
  mensual hasta la fecha límite, plan a partir de una cantidad cómoda y
  evaluación con datos reales (`debtContext.js`): dinero disponible, ingresos
  previstos, gastos recurrentes, otras deudas y gasto medio diario. Si faltan
  datos, la recomendación se marca como aritmética y dice qué falta. Nunca crea
  pagos ni reduce la deuda.
- Se distinguen 4 cifras: recomendado, apartado, pagado y pendiente.

## Círculo financiero

- Gasto del periodo = gasto neto (gastos − devoluciones) en `[inicio, fin)`.
- Restante **presupuestario** del periodo: base = presupuesto general del mismo
  tipo de periodo, o ingresos recibidos, o ingresos previstos (marcado como
  estimación). Es distinto del **saldo líquido** de las cuentas, que se muestra
  aparte junto con el dinero disponible (líquido − apartados).

## Concurrencia y consistencia

`database/Database.js` serializa todas las operaciones en una cola. Una
transacción (`BEGIN IMMEDIATE … COMMIT/ROLLBACK`) mantiene el acceso exclusivo;
si algo falla se revierte completa. Se usan transacciones en transferencias,
pagos, compras financiadas, importaciones, conciliaciones, reasignación de
categorías, metas en cuenta y recurrencias.

## Recurrencias

Las ocurrencias se materializan hasta 45 días por delante con `INSERT OR IGNORE`
sobre `UNIQUE(rule_id, due_date)`: abrir la app muchas veces o pasar días sin
conexión no genera duplicados. Un ingreso previsto no suma a ningún saldo hasta
que el usuario lo confirma, salvo que active de forma explícita el registro
automático de esa regla.
