# Guía de release (Android)

Todo está preparado. La versión 0.07 está compilada y publicada en GitHub
Releases (firmada con tu clave release).

## Estado listo para release

| Elemento | Estado |
|---|---|
| Nombre visible | "Aurea Finance" (`android/app/src/main/res/values/strings.xml`) |
| Paquete | `com.aureafinance` |
| Versión | `versionCode 7`, `versionName "0.07"` (`android/app/build.gradle`) |
| Icono | Generado: neón azul-morado. Hay versión clásica, redonda, adaptativa (Android 8+) con capa monocroma, y 512 px para la tienda (`assets/brand/playstore-512.png`) |
| Firma release | Configurada para leer **tu** clave privada de `~/.gradle/gradle.properties`. Nunca usa la clave de depuración |
| Permisos release | INTERNET, USE_BIOMETRIC, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, WAKE_LOCK, VIBRATE |
| Copias de seguridad de Android | Desactivadas (`allowBackup=false` + reglas de extracción) |
| Pruebas | `npm run release:check` → 264/264 pruebas, 0 errores de lint |

## Pasos para publicar

### 1. Crear tu clave de firma (una sola vez)

```bash
mkdir -p ~/claves
keytool -genkeypair -v -keystore ~/claves/aurea-release.jks -alias aurea \
  -keyalg RSA -keysize 4096 -validity 10000
```

Guarda la contraseña en un lugar seguro. Si pierdes la clave, no podrás
publicar actualizaciones de la misma app.

### 2. Configurar las propiedades privadas

En `~/.gradle/gradle.properties` (fuera del proyecto, nunca en git):

```properties
AUREA_RELEASE_STORE_FILE=/home/freddy/claves/aurea-release.jks
AUREA_RELEASE_STORE_PASSWORD=TU_CONTRASEÑA
AUREA_RELEASE_KEY_ALIAS=aurea
AUREA_RELEASE_KEY_PASSWORD=TU_CONTRASEÑA
```

### 3. Verificar y compilar

```bash
cd ~/Projects/AureaFinance
export JAVA_HOME=~/.local/share/mise/installs/java/temurin-17
npm run release:check            # pruebas + lint
npm run android:release          # APK firmado: android/app/build/outputs/apk/release/app-release.apk
npm run android:bundle           # AAB para Google Play: android/app/build/outputs/bundle/release/app-release.aab
```

Para un APK más pequeño solo para tu teléfono (arm64):

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

### 4. Instalar en tu teléfono

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Si antes tenías instalada la versión debug, desinstálala primero
(`adb uninstall com.aureafinance`): las firmas son distintas. Esto borra los
datos de la versión debug, así que exporta un respaldo desde Ajustes si los
necesitas.

### 5. Comprobaciones tras instalar

- [ ] El icono neón aparece en el lanzador (prueba también los iconos temáticos de Android 13+).
- [ ] La bienvenida, las cuentas y un gasto funcionan sin Metro (el JS va empaquetado).
- [ ] El bloqueo biométrico funciona con tu huella o PIN.
- [ ] El permiso de notificaciones se pide al activarlas.
- [ ] Importar un CSV real de tu banco y exportar movimientos.

### Siguientes versiones

Sube `versionCode` (2, 3…) y `versionName` en `android/app/build.gradle` antes
de cada release. Para cambiar el icono, edita los SVG de `assets/brand/` y
ejecuta `npm run icons`.
