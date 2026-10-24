# Aurea Finance

App Android de finanzas personales para México (MXN), hecha con **React Native
CLI** (sin Expo) y **SQLite local**. Interfaz oscura tipo terminal financiera con
un círculo de gasto segmentado por categorías, deudas con recomendador de pagos,
presupuestos, recurrencias, metas, estadísticas, CSV, biometría y notificaciones
locales. Todos los datos se guardan solo en el teléfono.

> Nombre provisional: se cambia en `config/brand.js` y en
> `android/app/src/main/res/values/strings.xml`.

## Requisitos del entorno

| Herramienta | Versión usada |
|---|---|
| Node.js | 26.8.1 (mínimo 22.11) |
| npm | 11.19 |
| JDK | **Temurin 17** (el JDK 27 del sistema no se usa para compilar) |
| Android SDK | platforms 35–37, build-tools 37.0.0, NDK 27.1.12297006 |
| Gradle | 9.4.1 (wrapper) |
| React Native | 0.87.1 · React 19.2.3 · Metro 0.87.1 |

Dependencias principales: React Navigation 7 (bottom tabs + native stack),
react-native-screens 4.30, Reanimated 4.7.1 + Worklets 0.13, react-native-svg
15.16, Gesture Handler 3.4, op-sqlite 18.2.5, datetimepicker 9.2.1,
react-native-notify-kit 10.8.1, @sbaiahmed1/react-native-biometrics 0.16.1,
@react-native-documents/picker 12.0.2, @dr.pogodin/react-native-fs 2.40.3.
Las razones de cada elección están en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Instalación

```bash
cd ~/Projects/AureaFinance
npm install
```

Configura Java 17 para Gradle (con mise ya instalado):

```bash
export JAVA_HOME=~/.local/share/mise/installs/java/temurin-17
export ANDROID_HOME=~/Android/Sdk
```

## Ejecutar en un teléfono Android

1. Activa *Opciones de desarrollador → Depuración USB* y conecta el teléfono.
   Comprueba que aparece con `adb devices`.
2. En una terminal: `npm start` (Metro).
3. En otra: `npm run android` (compila, instala y abre la app).

En el emulador: `ANDROID_AVD_HOME=~/.config/.android/avd emulator -avd Medium_Phone`
y luego `npm run android`.

## Compilar

```bash
cd android
./gradlew assembleDebug                      # APK de depuración (para ejecutarlo hace falta Metro: npm start)
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a   # solo arm64, más rápido
./gradlew assembleRelease                    # requiere tu clave de firma (ver abajo)
```

### Release

Guía completa paso a paso: [docs/RELEASE.md](docs/RELEASE.md). Comandos: `npm run release:check`, `npm run android:release`, `npm run android:bundle`. Icono: `npm run icons` (desde `assets/brand/*.svg`).

### Firma de la versión release

`release` **no** usa la clave de depuración. Necesitas tu propia clave, que se
crea una sola vez y se guarda fuera del repositorio:

```bash
keytool -genkeypair -v -keystore ~/claves/aurea-release.jks -alias aurea \
  -keyalg RSA -keysize 4096 -validity 10000
```

Después, en `~/.gradle/gradle.properties` (no en el proyecto):

```properties
AUREA_RELEASE_STORE_FILE=/home/TU_USUARIO/claves/aurea-release.jks
AUREA_RELEASE_STORE_PASSWORD=...
AUREA_RELEASE_KEY_ALIAS=aurea
AUREA_RELEASE_KEY_PASSWORD=...
```

Sin esas propiedades, `assembleRelease` genera un APK sin firmar (no instalable).

## Pruebas

```bash
npm test                              # todas (lógica + interfaz)
npx jest --selectProjects logic       # reglas financieras y SQLite real (node:sqlite)
npx jest --selectProjects ui          # componentes con el preset de React Native
npx eslint MENUS components hooks services utils database config navigation
```

Las pruebas de lógica usan una base SQLite real en memoria o en archivo, sin mocks,
con el mismo envoltorio de transacciones que la app.

## Estructura

```
App.tsx              Proveedores globales → MENU
MENUS/               MENU.js (navegación) y pantallas en MAYÚSCULAS
components/          SpendingCircle, FloatingStatement, TransactionCard, QuickExpenseForm,
                     CategoryIcon, AccountCard, DebtPaymentPlan, BudgetProgress, charts/, common/
navigation/          Rutas y tema de navegación
services/            transactions, accounts, debts, budgets, categories, recurring, goals,
                     stats, csv, files, notifications, security, settings, sync, bank, ai
database/            Database.js (transacciones), drivers, schema, migrations, repositories
hooks/               DatabaseProvider, useQuery, useSettings, useSubmit
utils/               money (centavos), dates, periods, id, errors
config/              theme, brand, currencies, categories, defaultSettings
assets/icons/        SVG revisados + LICENSES.md (generar índice: node scripts/build-icons.js)
tests/               unit, integration (SQLite real), ui
docs/                ARQUITECTURA, INTEGRACIONES, BANCOS, supabase/, backend-asistente/
```

## Modelo de datos y reglas financieras

Resumen (detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)):

- **Importes en centavos enteros.** Nada de coma flotante en cálculos de dinero.
- **Saldos derivados** de los movimientos. No se guardan, así que nunca quedan desfasados.
- **Tipos de operación:**
  - gasto, ingreso, transferencia;
  - pago de tarjeta (no es gasto);
  - devolución (reduce el gasto de su categoría, no es ingreso);
  - ajuste (conciliación).
- **Compras a crédito:** un solo gasto en la tarjeta elegida. Si es financiada,
  además se crea un plan de deuda ligado a esa compra.
- **Deudas:**
  - Se actualizan a mano con conciliaciones (historial), nunca con gastos.
  - El recomendador de pagos calcula planes semanal, quincenal o mensual con
    importes exactos.
  - Nunca crea pagos por sí mismo.
- **Restante del círculo** (presupuesto, ingresos o ingresos previstos) separado
  de los saldos:
  - saldo líquido;
  - dinero disponible = líquido − apartados;
  - deuda de tarjetas.
- **Crédito por tarjeta:** límite autorizado (lo escribes tú), crédito en uso
  (deuda real de la tarjeta) y disponible = límite − en uso, con desglose de lo
  financiado y lo no financiado. Se actualiza con cada cargo, pago o devolución.
  Los pagos mensuales de una financiación son los que tú registras: la app no
  los calcula ni estima intereses. Al registrar una financiación existente se
  indica si ya está incluida en la deuda de la tarjeta; si no, se suma como
  ajuste (no como gasto).
- **Calendario de pagos:** una financiación puede pagarse con un pago mensual
  fijo o con un calendario, en el que capturas cada mes que muestra tu banco
  con su monto. El saldo pendiente es la suma de los meses, y cada pago
  vinculado cubre primero el mes más antiguo.
- **Próximo pago de una tarjeta:** lo no financiado más las mensualidades del
  mes, no la deuda total. Un plan sin pago mensual no se estima: se avisa que
  falta capturarlo.
- **Recurrencias:**
  - Sin duplicados (ocurrencias únicas por regla y fecha).
  - Un ingreso previsto no suma hasta que lo confirmas, salvo que actives el
    registro automático en esa regla.

## Integraciones futuras

Firebase (push), Supabase (sincronización) y el asistente con Claude están
preparados pero **desactivados**. Ver [docs/INTEGRACIONES.md](docs/INTEGRACIONES.md).

Integración bancaria: la v1 es manual + CSV. Para conectar bancos haría falta un
agregador B2B; los costes y límites reales están en [docs/BANCOS.md](docs/BANCOS.md).

## Seguridad y privacidad

- Sin claves ni secretos en el código.
- Sin analítica ni rastreo.
- La app no transmite datos salvo que actives el asistente, y en ese caso solo
  envía agregados.
- Copia de seguridad de Android desactivada, incluida la transferencia entre
  dispositivos (`allowBackup=false` + `data_extraction_rules.xml`).
- Permisos mínimos. Los que añadían las librerías y no hacen falta se eliminan
  en el manifiesto.
- **Límite:** la base SQLite no está cifrada. La protege el aislamiento de apps
  de Android y el bloqueo biométrico protege el acceso a la interfaz, pero en un
  dispositivo con root la base es legible. El respaldo JSON exportado tampoco va
  cifrado: guárdalo en un lugar privado.

## Problemas conocidos

Lista actualizada en [docs/ESTADO.md](docs/ESTADO.md).
