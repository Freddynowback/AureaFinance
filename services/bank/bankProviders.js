/**
 * Fuentes de movimientos bancarios. La primera versión es MANUAL + CSV.
 * No hay scraping, automatización de inicio de sesión ni captura de
 * contraseñas. Una integración con agregador (Belvo, Finerio Connect,
 * Syncfy...) requiere contrato B2B y backend propio: ver docs/BANCOS.md.
 */
export const BANK_SOURCES = [
  { id: 'manual', name: 'Registro manual', available: true },
  { id: 'csv', name: 'Importación CSV del estado de cuenta', available: true },
  { id: 'aggregator', name: 'Agregador financiero (requiere contrato y backend)', available: false },
];
