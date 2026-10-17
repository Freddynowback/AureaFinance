# Trabajo con subagentes (Copilot CLI y Antigravity CLI)

Claude Code coordinó el proyecto y fue responsable de la arquitectura y de la
integración. Los agentes trabajaron siempre en directorios aislados
(`~/Projects/AureaFinance-agents/…`) o en modo solo lectura. **Ningún agente
escribió directamente en el repositorio**: Claude revisó cada entregable, lo
ejecutó y lo integró (o lo rechazó).

- Panel de estado con todas las tareas: `~/Projects/AureaFinance-agents/STATUS.md`
- Salidas completas: `~/Projects/AureaFinance-agents/logs/`

## Herramientas comprobadas

| Agente | Versión | Modo usado | Notas |
|---|---|---|---|
| GitHub Copilot CLI | 1.0.98 | `copilot -s -p` (no interactivo), `--add-dir` del proyecto en solo lectura, salida a su directorio | Autenticado; `--reasoning-effort` no es compatible con el modelo `auto` |
| OpenAI Codex CLI | 0.162.1 | `codex exec -m gpt-5.6-luna -c model_reasoning_effort=medium -s read-only`, stdin cerrado (`< /dev/null`) | Muy preciso en auditorías. Un intento se colgó esperando stdin |
| Grok CLI | 1.0.52 | `grok -p --permission-mode plan` (solo lectura) | Alcanzó el límite de uso gratuito a mitad de la auditoría |
| Antigravity CLI (`agy`) | 1.3.5 | `agy --print`, al final con `--sandbox --dangerously-skip-permissions` confinado a su directorio | En modo headless sin permisos no puede usar herramientas. **Agotó su cuota individual** (429, se restablece en ~7 días) |

## Resultados por tarea (resumen)

| Agente | Tarea | Resultado de la revisión de Claude |
|---|---|---|
| Copilot | Investigación de proveedores bancarios MX | Útil. Verificación de fuentes hecha después por Claude (docs/BANCOS.md) |
| Antigravity | Compatibilidad de librerías nativas con RN 0.87 | Aceptada tras verificar en npm. Su informe no usó herramientas: era conocimiento propio |
| Copilot | Pruebas de money/dates/periods | Encontró un bug real en `parseFlexibleDate` (corregido); 1 expectativa errónea corregida |
| Copilot | Revisión de la lógica contable | 5 de 7 hallazgos aceptados (monedas, devoluciones, conciliación de crédito…) |
| Copilot | Pruebas del recomendador de deuda | Aceptadas (15) |
| Antigravity | Iconos SVG | 74 Lucide + 14 marcas aceptados; 2 excluidos por `<style>` |
| Copilot | Pruebas de integración (casos obligatorios) | 19 aceptadas. El agente atribuyó un cuelgue a `node:sqlite`; la causa real era un interbloqueo de Claude en `Database.get`, ya corregido |
| Antigravity | Esquema Supabase + RLS | Integrado como documentación **sin validar** |
| Antigravity | Pruebas de notificaciones, insights y presupuestos | 33 aceptadas |
| Copilot | DebtPaymentPlan, pantallas de metas, categorías/presupuestos, ingresos/recurrencias | Aceptadas con correcciones (iconos inexistentes, rango de fechas exclusivo, sincronización de recurrencias). Su código reveló un bug de Claude en `useSettings` (bucle de consultas) |
| Antigravity | Pantallas ASISTENTE y BIENVENIDA | Aceptadas; 1 frase de privacidad matizada |
| Copilot | Pruebas de interfaz | 13 aceptadas (rutas de su árbol temporal corregidas) |
| Copilot | Auditoría de seguridad | 1 hallazgo válido: firma release con la clave debug → corregido |
| Copilot | Auditoría de accesibilidad (reasignada desde Antigravity) | Mayoría aplicada: contraste, etiquetas, objetivos táctiles ≥ 44 dp |
| Copilot | Revisión de errores en pantallas | 3 bugs reales aceptados y corregidos |
| Copilot | Pruebas de recurrencias y formatos CSV de bancos | 12 + 6 pruebas; su informe de limitación (prefacio bancario) llevó a implementar la detección de encabezados |
| Copilot | Verificación de la documentación contra el código | 6 discrepancias corregidas |

## Iteración 2 (crédito por tarjeta + auditoría)

| Agente | Tarea | Resultado |
|---|---|---|
| Copilot | Componente `CreditUsage.js` + prueba de interfaz | Aceptado; texto ajustado a "pago mensual que registraste" |
| Codex | Pruebas de `creditService` (11) | Aceptadas, 0 bugs |
| Codex | Auditoría contable e integridad | 10 hallazgos válidos, todos corregidos |
| Codex | Auditoría de pantallas (reasignada desde Grok) | 6 hallazgos válidos, todos corregidos |
| Copilot | Auditoría integral | 15 hallazgos; el "crítico" era un falso positivo de su filtro de secretos |
| Copilot | Pruebas de bloqueo, respaldo y notificaciones, y de regresión (13) | Aceptadas |
| Grok | Auditoría de flujos | Sin resultado (límite de uso gratuito) |
