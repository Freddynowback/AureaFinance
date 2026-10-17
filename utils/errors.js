/** Error de validación con mensajes por campo, listo para mostrar en formularios. */
export class ValidationError extends Error {
  constructor(fields, message) {
    const first = Object.values(fields)[0];
    super(message || first || 'Datos inválidos');
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

export function check(fields, condition, field, message) {
  if (!condition && !fields[field]) fields[field] = message;
}

export function throwIfErrors(fields) {
  if (Object.keys(fields).length) throw new ValidationError(fields);
}
