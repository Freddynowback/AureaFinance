# Manifiesto de Iconos (MANIFEST.md)

## Resumen Ejecutivo

- **Total archivos SVG preparados**: 90
  - **Dashboard Icons (`./dashboard/`)**: 16 archivos descargados y verificados.
  - **Iconos Genéricos (`./generic/`)**: 74 archivos extraídos de `lucide-static`.
- **Resultado de revisión técnica (sin `<script>`, sin `<style>`, sin `<foreignObject>`, sin `href` externos)**:
  - **88 archivos OK**.
  - **2 archivos NO** (`dashboard/netflix.svg` y `dashboard/hbo.svg` contienen elementos `<style>`).

### Detalle de Búsqueda Homarr Dashboard Icons
De los 20 conceptos solicitados:
- **16 SVGs existentes descargados**:
  - `netflix`, `spotify`, `youtube`, `prime-video`, `disney-plus`, `apple-tv-plus`, `max`, `hbo`, `google-drive`, `icloud`, `chatgpt`, `openai`, `github`, `steam`, `xbox`, `playstation`.
- **6 conceptos NO existentes en el repositorio**:
  - `mercado-libre` (verificado: no existe ni `mercado-libre.svg` ni `mercadolibre.svg`).
  - `uber` (verificado: no existe `uber.svg` ni `uber-eats.svg`).
  - `rappi` (verificado: no existe `rappi.svg`).
  - `telcel` (verificado: no existe `telcel.svg`).
  - `izzi` (verificado: no existe `izzi.svg`).
  - `cfe` (verificado: no existe `cfe.svg`).
- **Notas específicas de Dashboard Icons**:
  - `apple-tv`: En el repositorio no existe `apple-tv.svg` (retorna 404), pero sí existe oficialmente `apple-tv-plus.svg` (200 OK), el cual fue descargado.
  - `max/hbo`: Se verificó y descargó tanto `max.svg` como `hbo.svg`.
  - `chatgpt/openai`: Se verificó y descargó tanto `chatgpt.svg` como `openai.svg`.

### Detalle de Extracción Lucide Icons
- De los 74 iconos solicitados, **el 100% existe** en `lucide-static-1.59.0`.
- Los mapeos como `food` -> `utensils`, `house` -> `layout-dashboard`, `home` -> `house`, `salary` -> `wallet`, etc. fueron extraídos con el nombre de destino exacto solicitado.
- Todos los 74 iconos de Lucide superaron la revisión técnica (sin scripts, estilos CSS embebidos, foreignObjects ni hrefs externos).

## Tabla 1: Dashboard Icons (`./dashboard/`)

| Archivo | Origen (homarr-labs/dashboard-icons) | Revisión OK/NO | Observaciones |
| :--- | :--- | :---: | :--- |
| `dashboard/netflix.svg` | [homarr-labs/dashboard-icons/svg/netflix.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/netflix.svg) | **NO** | Contiene bloque <style> de clases CSS (.st0, .st2) |
| `dashboard/spotify.svg` | [homarr-labs/dashboard-icons/svg/spotify.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/spotify.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/youtube.svg` | [homarr-labs/dashboard-icons/svg/youtube.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/youtube.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/prime-video.svg` | [homarr-labs/dashboard-icons/svg/prime-video.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/prime-video.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/disney-plus.svg` | [homarr-labs/dashboard-icons/svg/disney-plus.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/disney-plus.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/apple-tv-plus.svg` | [homarr-labs/dashboard-icons/svg/apple-tv-plus.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/apple-tv-plus.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/max.svg` | [homarr-labs/dashboard-icons/svg/max.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/max.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/hbo.svg` | [homarr-labs/dashboard-icons/svg/hbo.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/hbo.svg) | **NO** | Contiene bloque <style> de clases CSS (.st0, .st2) |
| `dashboard/google-drive.svg` | [homarr-labs/dashboard-icons/svg/google-drive.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/google-drive.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/icloud.svg` | [homarr-labs/dashboard-icons/svg/icloud.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/icloud.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/chatgpt.svg` | [homarr-labs/dashboard-icons/svg/chatgpt.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/chatgpt.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/openai.svg` | [homarr-labs/dashboard-icons/svg/openai.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/openai.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/github.svg` | [homarr-labs/dashboard-icons/svg/github.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/github.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/steam.svg` | [homarr-labs/dashboard-icons/svg/steam.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/steam.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/xbox.svg` | [homarr-labs/dashboard-icons/svg/xbox.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/xbox.svg) | **OK** | Limpio, compatible React Native |
| `dashboard/playstation.svg` | [homarr-labs/dashboard-icons/svg/playstation.svg](https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/playstation.svg) | **OK** | Limpio, compatible React Native |

## Tabla 2: Iconos Genéricos (`./generic/`)

| Archivo Destino | Origen Lucide | Revisión OK/NO |
| :--- | :--- | :---: |
| `generic/food.svg` | lucide-static: `icons/utensils.svg` | **OK** |
| `generic/transport.svg` | lucide-static: `icons/bus.svg` | **OK** |
| `generic/home.svg` | lucide-static: `icons/house.svg` | **OK** |
| `generic/bolt.svg` | lucide-static: `icons/zap.svg` | **OK** |
| `generic/health.svg` | lucide-static: `icons/heart-pulse.svg` | **OK** |
| `generic/education.svg` | lucide-static: `icons/graduation-cap.svg` | **OK** |
| `generic/ticket.svg` | lucide-static: `icons/ticket.svg` | **OK** |
| `generic/bag.svg` | lucide-static: `icons/shopping-bag.svg` | **OK** |
| `generic/repeat.svg` | lucide-static: `icons/repeat.svg` | **OK** |
| `generic/card.svg` | lucide-static: `icons/credit-card.svg` | **OK** |
| `generic/piggy.svg` | lucide-static: `icons/piggy-bank.svg` | **OK** |
| `generic/dots.svg` | lucide-static: `icons/ellipsis.svg` | **OK** |
| `generic/salary.svg` | lucide-static: `icons/wallet.svg` | **OK** |
| `generic/spark.svg` | lucide-static: `icons/sparkles.svg` | **OK** |
| `generic/bank.svg` | lucide-static: `icons/landmark.svg` | **OK** |
| `generic/cash.svg` | lucide-static: `icons/banknote.svg` | **OK** |
| `generic/target.svg` | lucide-static: `icons/target.svg` | **OK** |
| `generic/calendar.svg` | lucide-static: `icons/calendar.svg` | **OK** |
| `generic/bell.svg` | lucide-static: `icons/bell.svg` | **OK** |
| `generic/settings.svg` | lucide-static: `icons/settings.svg` | **OK** |
| `generic/chart.svg` | lucide-static: `icons/chart-pie.svg` | **OK** |
| `generic/list.svg` | lucide-static: `icons/list.svg` | **OK** |
| `generic/house.svg` | lucide-static: `icons/layout-dashboard.svg` | **OK** |
| `generic/plus.svg` | lucide-static: `icons/plus.svg` | **OK** |
| `generic/search.svg` | lucide-static: `icons/search.svg` | **OK** |
| `generic/filter.svg` | lucide-static: `icons/filter.svg` | **OK** |
| `generic/lock.svg` | lucide-static: `icons/lock.svg` | **OK** |
| `generic/fingerprint.svg` | lucide-static: `icons/fingerprint.svg` | **OK** |
| `generic/download.svg` | lucide-static: `icons/download.svg` | **OK** |
| `generic/upload.svg` | lucide-static: `icons/upload.svg` | **OK** |
| `generic/edit.svg` | lucide-static: `icons/pencil.svg` | **OK** |
| `generic/trash.svg` | lucide-static: `icons/trash-2.svg` | **OK** |
| `generic/close.svg` | lucide-static: `icons/x.svg` | **OK** |
| `generic/check.svg` | lucide-static: `icons/check.svg` | **OK** |
| `generic/info.svg` | lucide-static: `icons/info.svg` | **OK** |
| `generic/alert.svg` | lucide-static: `icons/triangle-alert.svg` | **OK** |
| `generic/transfer.svg` | lucide-static: `icons/arrow-left-right.svg` | **OK** |
| `generic/receipt.svg` | lucide-static: `icons/receipt.svg` | **OK** |
| `generic/chevron-left.svg` | lucide-static: `icons/chevron-left.svg` | **OK** |
| `generic/chevron-right.svg` | lucide-static: `icons/chevron-right.svg` | **OK** |
| `generic/wallet.svg` | lucide-static: `icons/wallet.svg` | **OK** |
| `generic/trending-up.svg` | lucide-static: `icons/trending-up.svg` | **OK** |
| `generic/trending-down.svg` | lucide-static: `icons/trending-down.svg` | **OK** |
| `generic/refund.svg` | lucide-static: `icons/undo-2.svg` | **OK** |
| `generic/coin.svg` | lucide-static: `icons/circle-dollar-sign.svg` | **OK** |
| `generic/gift.svg` | lucide-static: `icons/gift.svg` | **OK** |
| `generic/phone.svg` | lucide-static: `icons/smartphone.svg` | **OK** |
| `generic/plane.svg` | lucide-static: `icons/plane.svg` | **OK** |
| `generic/paw.svg` | lucide-static: `icons/paw-print.svg` | **OK** |
| `generic/shirt.svg` | lucide-static: `icons/shirt.svg` | **OK** |
| `generic/dumbbell.svg` | lucide-static: `icons/dumbbell.svg` | **OK** |
| `generic/coffee.svg` | lucide-static: `icons/coffee.svg` | **OK** |
| `generic/gamepad.svg` | lucide-static: `icons/gamepad-2.svg` | **OK** |
| `generic/baby.svg` | lucide-static: `icons/baby.svg` | **OK** |
| `generic/wrench.svg` | lucide-static: `icons/wrench.svg` | **OK** |
| `generic/fuel.svg` | lucide-static: `icons/fuel.svg` | **OK** |
| `generic/music.svg` | lucide-static: `icons/music.svg` | **OK** |
| `generic/book.svg` | lucide-static: `icons/book-open.svg` | **OK** |
| `generic/users.svg` | lucide-static: `icons/users.svg` | **OK** |
| `generic/briefcase.svg` | lucide-static: `icons/briefcase.svg` | **OK** |
| `generic/percent.svg` | lucide-static: `icons/percent.svg` | **OK** |
| `generic/clock.svg` | lucide-static: `icons/clock.svg` | **OK** |
| `generic/arrow-up.svg` | lucide-static: `icons/arrow-up.svg` | **OK** |
| `generic/arrow-down.svg` | lucide-static: `icons/arrow-down.svg` | **OK** |
| `generic/eye.svg` | lucide-static: `icons/eye.svg` | **OK** |
| `generic/bar-chart.svg` | lucide-static: `icons/chart-column.svg` | **OK** |
| `generic/line-chart.svg` | lucide-static: `icons/chart-line.svg` | **OK** |
| `generic/sliders.svg` | lucide-static: `icons/sliders-horizontal.svg` | **OK** |
| `generic/shield.svg` | lucide-static: `icons/shield-check.svg` | **OK** |
| `generic/bot.svg` | lucide-static: `icons/bot.svg` | **OK** |
| `generic/moon.svg` | lucide-static: `icons/moon.svg` | **OK** |
| `generic/archive.svg` | lucide-static: `icons/archive.svg` | **OK** |
| `generic/copy.svg` | lucide-static: `icons/copy.svg` | **OK** |
| `generic/sun.svg` | lucide-static: `icons/sun.svg` | **OK** |

## Criterios de Revisión Técnica Aplicados

1. **Sin `<script>`**: Ningún archivo contiene scripts ejecutables.
2. **Sin enlaces externos (`href` o `xlink:href` con `http://` o `https://`)**: Ningún archivo realiza peticiones o enlaces de red remota.
3. **Sin `<style>`**: Se detectaron etiquetas `<style>` únicamente en `dashboard/hbo.svg` y `dashboard/netflix.svg`, las cuales requieren conversión a atributos de presentación (`fill`, `stroke`, etc.) si se usan con `react-native-svg`.
4. **Sin `<foreignObject>`**: Ningún archivo contiene elementos foreignObject incompatibles con motores móviles.
