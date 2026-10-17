/**
 * Monedas soportadas. Para añadir una moneda basta con agregarla aquí; todos
 * los importes se guardan en unidades menores (centavos) y con su código.
 */
export const DEFAULT_CURRENCY = 'MXN';

export const CURRENCIES = {
  MXN: { code: 'MXN', symbol: '$', name: 'Peso mexicano', minorUnits: 2 },
  USD: { code: 'USD', symbol: 'US$', name: 'Dólar estadounidense', minorUnits: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', minorUnits: 2 },
};

export const CURRENCY_LIST = Object.values(CURRENCIES);
