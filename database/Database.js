/**
 * Envoltorio de SQLite independiente del driver.
 *
 * Todas las operaciones pasan por una cola: una transacción mantiene el
 * acceso exclusivo hasta COMMIT/ROLLBACK, así ninguna otra escritura puede
 * intercalarse y dejar cuentas a medio actualizar.
 *
 * Un driver implementa:
 *   execute(sql, params) -> Promise<{ rows: object[], changes: number }>
 *   close() -> Promise<void>
 */

function normalizeParams(params = []) {
  return params.map(p => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

class Executor {
  constructor(driver) {
    this.driver = driver;
  }

  async all(sql, params) {
    const res = await this.driver.execute(sql, normalizeParams(params));
    return res.rows || [];
  }

  async get(sql, params) {
    // Llama al ejecutor directo: en Database, this.all se encolaría detrás de sí mismo.
    const rows = await Executor.prototype.all.call(this, sql, params);
    return rows[0] || null;
  }

  async run(sql, params) {
    const res = await this.driver.execute(sql, normalizeParams(params));
    return { changes: res.changes ?? 0 };
  }

  /** Ejecuta varias sentencias sin parámetros (migraciones). */
  async execMany(statements) {
    for (const sql of statements) {
      await this.driver.execute(sql, []);
    }
  }
}

/** Ejecutor dentro de una transacción ya abierta: las transacciones anidadas se unen. */
class TransactionExecutor extends Executor {
  async transaction(fn) {
    return fn(this);
  }
}

export class Database extends Executor {
  constructor(driver) {
    super(driver);
    this.queue = Promise.resolve();
    this.closed = false;
    this.listeners = new Set();
  }

  _enqueue(task) {
    if (this.closed) return Promise.reject(new Error('La base de datos está cerrada'));
    const result = this.queue.then(task, task);
    // La cola sigue aunque la tarea falle.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  all(sql, params) {
    return this._enqueue(() => Executor.prototype.all.call(this, sql, params));
  }

  get(sql, params) {
    return this._enqueue(() => Executor.prototype.get.call(this, sql, params));
  }

  run(sql, params) {
    return this._enqueue(async () => {
      const res = await Executor.prototype.run.call(this, sql, params);
      if (res.changes) this._notify();
      return res;
    });
  }

  /**
   * Ejecuta `fn(tx)` dentro de BEGIN IMMEDIATE ... COMMIT. Si `fn` lanza un
   * error se hace ROLLBACK y el error se propaga: nunca queda un cambio parcial.
   */
  transaction(fn) {
    return this._enqueue(async () => {
      const tx = new TransactionExecutor(this.driver);
      await this.driver.execute('BEGIN IMMEDIATE', []);
      try {
        const value = await fn(tx);
        await this.driver.execute('COMMIT', []);
        this._notify();
        return value;
      } catch (error) {
        try {
          await this.driver.execute('ROLLBACK', []);
        } catch (_) {
          // La conexión ya revirtió la transacción.
        }
        throw error;
      }
    });
  }

  /** Suscripción simple a cambios para refrescar pantallas. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    this.listeners.forEach(l => {
      try {
        l();
      } catch (_) {
        // Un listener defectuoso no debe romper la escritura.
      }
    });
  }

  close() {
    if (this.closed) return Promise.resolve();
    const done = this._enqueue(() => this.driver.close());
    this.closed = true;
    return done;
  }
}
