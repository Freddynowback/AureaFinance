import { useCallback, useState } from 'react';
import { useToast } from '../components/common/Toast';

/**
 * Envoltorio para guardar formularios: gestiona `saving`, errores por campo
 * (ValidationError.fields) y confirmación visual.
 */
export function useSubmit() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const submit = useCallback(
    async (action, { success, onDone } = {}) => {
      setSaving(true);
      setErrors({});
      try {
        const result = await action();
        if (success) toast(success);
        if (onDone) onDone(result);
        return result;
      } catch (e) {
        if (e && e.fields) setErrors(e.fields);
        toast(e && e.message ? e.message : 'No se pudo guardar', 'error');
        return undefined;
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );
  return { submit, saving, errors, setErrors };
}
