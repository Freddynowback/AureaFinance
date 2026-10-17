import { useCallback, useEffect, useRef, useState } from 'react';
import { useDb } from './DatabaseProvider';

/**
 * Ejecuta `fn(db)` y la repite cuando cambia la base de datos o `deps`.
 * Devuelve { data, error, loading, reload }.
 */
export function useQuery(fn, deps = []) {
  const db = useDb();
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async () => {
    const id = ++seq.current;
    try {
      const data = await fnRef.current(db);
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState(s => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps]);
  useEffect(() => {
    run();
    return db.subscribe(run);
  }, [db, run]);
  return { ...state, reload: run };
}
