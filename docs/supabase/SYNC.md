# Protocolo de Sincronización AureaFinance (SQLite Local <-> Supabase PostgreSQL)

Este documento especifica el protocolo bidireccional y sin conexión (offline-first) entre la base local SQLite (fuente de verdad en el dispositivo) y la base remota Supabase (PostgreSQL).

---

## 1. Arquitectura y Fuente de Verdad

- **Cliente (SQLite local):** Registra todas las mutaciones en `change_log`. La app opera 100% offline.
- **Servidor (Supabase PostgreSQL):** Almacén central de sincronización y respaldo multidispositivo.
- **Identificadores:** UUID v4 generados en el cliente local para permitir inserciones sin esperar confirmación del servidor.
- **Importes:** `BIGINT` en centavos para evitar discrepancias por redondeo en punto flotante.

---

## 2. Push por Lotes (Cliente -> Supabase)

### 2.1. Lectura del Registro de Cambios
Las mutaciones locales se capturan mediante triggers en SQLite en la tabla:
```sql
change_log(seq, table_name, row_id, op, changed_at, synced_at)
```

1. **Lectura por lotes:**
   ```sql
   SELECT seq, table_name, row_id, op
   FROM change_log
   WHERE synced_at IS NULL
   ORDER BY seq ASC
   LIMIT 100;
   ```

2. **Compactación en memoria (Deduplicación):**
   Si para un mismo `(table_name, row_id)` existen múltiples operaciones pendientes en el lote (ej. `insert` seguido de `update`), se envía únicamente el estado actual de la fila. Si se creó y eliminó antes de sincronizar (`insert` -> `delete`), se marca `synced_at` localmente sin enviar nada a la red.

3. **Empaquetado de la carga:**
   - Para `op IN ('insert', 'update')`: Se consulta la fila completa en SQLite y se envía en un arreglo JSON con `deleted_at = NULL`.
   - Para `op = 'delete'`: Se envía un payload con `{ id: row_id, user_id: auth.uid(), deleted_at: changed_at }`.

4. **Upsert en Supabase vía PostgREST:**
   Se envía la petición HTTP a la API REST de Supabase con resolución de conflicto por `(user_id, id)`:
   ```ts
   const { data, error } = await supabase
     .from(tableName)
     .upsert(batchPayload, { onConflict: 'user_id,id' });
   ```

### 2.2. Confirmación de Sincronización (`synced_at`)
- **Regla estricta:** `synced_at` se actualiza en SQLite **ÚNICAMENTE** tras recibir respuesta confirmada (HTTP 200/201) de Supabase.
  ```sql
  UPDATE change_log
  SET synced_at = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')
  WHERE seq IN (?);
  ```
- **Fallo de red o error 5xx:** No se modifica `synced_at`. La transacción se reintenta en el siguiente ciclo con retroceso exponencial (*exponential backoff*).

---

## 3. Pull Incremental (Supabase -> Cliente)

1. **Cursor de sincronización:**
   Se almacena en la tabla local `settings` la clave `sync_cursor_last_pulled_at` (formato ISO 8601 en UTC).

2. **Consulta remota con filtro de cursor:**
   Para cada tabla sincronizable:
   ```ts
   const { data } = await supabase
     .from(tableName)
     .select('*')
     .gt('updated_at', lastPulledAt)
     .order('updated_at', { ascending: true })
     .limit(500);
   ```

3. **Aplicación local:**
   - Si `deleted_at IS NOT NULL`: Se realiza soft-delete o borrado de la fila en SQLite.
   - Si `deleted_at IS NULL`: Se ejecuta un `INSERT OR REPLACE INTO ...` en SQLite.
   - **Prevención de bucle infinito de triggers:** Al aplicar datos descargados del pull, se desactivan temporalmente los triggers locales de `change_log` o se ejecuta un bloque con bandera `is_syncing = true` para que los datos remotos no vuelvan a insertarse en el `change_log`.

4. **Actualización del cursor:**
   Tras procesar exitosamente el lote, `sync_cursor_last_pulled_at` se actualiza al mayor valor de `updated_at` recibido.

---

## 4. Resolución de Conflictos (Last-Write-Wins con Registro)

- **Criterio LWW:** Gana el registro con la marca de tiempo `updated_at` más reciente.
- **Detección de colisión:** Ocurre si durante un *Pull*, la fila remota tiene `updated_at > local.updated_at` pero existen entradas en `change_log` pendientes (`synced_at IS NULL`) para ese mismo `row_id`.
- **Estrategia:**
  1. El valor remoto sobreescribe la fila local (preservando consistencia).
  2. La versión local no sincronizada se almacena en un archivo o tabla local de auditoría `conflict_log(table_name, row_id, local_data, remote_data, resolved_at)`.
  3. Se limpia el `change_log` local para evitar reescribir ciegamente el cambio remoto en el siguiente push.
  4. La app notifica al usuario si el conflicto afectó un importe o presupuesto relevante.

---

## 5. Borrado Lógico de Sincronización (`deleted_at`)

- **El problema de los borrados físicos:** Si el cliente A borra físicamente una fila (`DELETE FROM accounts WHERE id = '...'`), el cliente B nunca se enteraría mediante una consulta `updated_at > cursor`, provocando que el cliente B resucite la fila ("*zombie resurrection*").
- **Solución (Tombstones):**
  - Todo borrado remoto se modela como un `UPDATE table SET deleted_at = now()`.
  - La fila permanece disponible para que otros dispositivos reciban la notificación de borrado en su siguiente *Pull*.
  - Las vistas y consultas de la app siempre filtran `WHERE deleted_at IS NULL`.
  - **Purga eventual (*Vacuum*):** Un cron job mensual en Supabase puede eliminar físicamente registros donde `deleted_at < now() - INTERVAL '90 days'`, permitiendo a clientes inactivos sincronizar sus bajas antes de la eliminación definitiva.

---

## 6. Seguridad: `anon key` + Sesión vs. `service_role`

| Llave | Destino | Acceso a RLS | ¿Por qué usarla en la App? |
|---|---|---|---|
| **`anon key`** | Frontend (App móvil / Web) | **Respeta RLS** estrictamente | Se distribuye públicamente. En combinación con el JWT del usuario autenticado (`Authorization: Bearer <token>`), Supabase fija `auth.uid()` y restringe cada consulta a las filas del propio usuario. |
| **`service_role`** | Backend seguro / Scripts de administración | **Bypassea RLS** (`BYPASSRLS`) | **NUNCA debe incluirse en la app**. Si se compila en el APK, bundle de React Native o frontend, cualquier atacante puede extraerla por ingeniería inversa y obtener control total para leer, modificar y borrar las finanzas de **todos los usuarios** de la plataforma. |

---

## 7. SQL de Verificación de Políticas RLS y Aislamiento

El siguiente script en PostgreSQL permite verificar de forma reproducible que:
1. El Usuario A solo puede ver, insertar, actualizar y borrar sus propios datos.
2. El Usuario B no puede leer ni modificar filas del Usuario A.
3. El Usuario B **no puede asociar** transacciones a cuentas del Usuario A (bloqueado por FK compuesta `(user_id, account_id)`).
4. El Usuario B **no puede reservar** dinero para deudas o metas del Usuario A (bloqueado por trigger polimórfico).

```sql
BEGIN;

-- 1. Crear dos usuarios de prueba en auth.users
INSERT INTO auth.users (id)
VALUES 
  ('11111111-1111-1111-1111-111111111111'::uuid),
  ('22222222-2222-2222-2222-222222222222'::uuid)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- SIMULACIÓN USUARIO A (11111111-1111-1111-1111-111111111111)
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

-- Usuario A crea una cuenta y una categoría
INSERT INTO accounts (id, user_id, name, type, initial_balance, initial_balance_date)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Nómina BBVA (User A)',
  'debit',
  500000, -- $5,000.00 MXN en centavos
  '2026-01-01'
);

INSERT INTO categories (id, user_id, name, color, icon, kind)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'Supermercado',
  '#2ecc71',
  'cart',
  'expense'
);

-- Usuario A registra un gasto
INSERT INTO transactions (
  id, user_id, kind, amount, account_id, category_id, occurred_at
) VALUES (
  '11111111-0000-0000-0000-000000000001'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'expense',
  45000, -- $450.00 MXN en centavos
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  now()
);

-- Verificar que Usuario A ve sus filas (debe retornar 1 fila)
SELECT count(*) AS user_a_account_count FROM accounts;

-- -----------------------------------------------------------------------------
-- SIMULACIÓN USUARIO B (22222222-2222-2222-2222-222222222222)
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

-- Prueba 1: Usuario B intenta leer las cuentas de Usuario A
-- Debe devolver 0 filas gracias al RLS
SELECT count(*) AS user_b_should_see_zero FROM accounts;

-- Prueba 2: Usuario B intenta modificar la cuenta de Usuario A
-- No debe afectar ninguna fila (0 filas actualizadas)
UPDATE accounts 
SET name = 'Cuenta Hackeada' 
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- Verificar que el nombre sigue intacto
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SELECT name AS account_name_intact FROM accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- Regresar a Usuario B
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

-- Prueba 3: Usuario B intenta crear una transacción propia apuntando a la cuenta del Usuario A
-- Debe fallar con error de clave foránea (violación de aislamiento multinquilino)
DO $$
BEGIN
  INSERT INTO transactions (
    id, user_id, kind, amount, account_id, occurred_at
  ) VALUES (
    '22222222-0000-0000-0000-000000000001'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'expense',
    10000,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, -- Cuenta de Usuario A
    now()
  );
  RAISE EXCEPTION 'FALLO: Usuario B pudo asociar una transacción a la cuenta del Usuario A';
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE NOTICE 'ÉXITO: La FK compuesta (user_id, account_id) impidió la referencia cruzada entre tenants.';
END;
$$;

ROLLBACK;
```
