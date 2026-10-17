/**
 * Categorías predefinidas. Se insertan una sola vez en la primera ejecución;
 * después el usuario puede editarlas, archivarlas o eliminarlas.
 * Los colores están elegidos para distinguirse entre sí sobre fondo oscuro.
 */
export const CATEGORY_COLORS = [
  '#46C5B0', '#E9B65A', '#8F86E8', '#DF7D93', '#5AA9E6', '#F08A5D',
  '#7BC67E', '#C38FD8', '#E6D36A', '#4FB3BF', '#E07A5F', '#9AA7B4',
  '#6C8EF5', '#D4A373', '#5FD3A1', '#F2A1C0',
];

export const DEFAULT_CATEGORIES = [
  { key: 'food', name: 'Alimentación', icon: 'food', color: '#E9B65A', kind: 'expense' },
  { key: 'transport', name: 'Transporte', icon: 'transport', color: '#5AA9E6', kind: 'expense' },
  { key: 'home', name: 'Vivienda', icon: 'home', color: '#8F86E8', kind: 'expense' },
  { key: 'utilities', name: 'Servicios', icon: 'bolt', color: '#4FB3BF', kind: 'expense' },
  { key: 'health', name: 'Salud', icon: 'health', color: '#7BC67E', kind: 'expense' },
  { key: 'education', name: 'Educación', icon: 'education', color: '#6C8EF5', kind: 'expense' },
  { key: 'fun', name: 'Entretenimiento', icon: 'ticket', color: '#DF7D93', kind: 'expense' },
  { key: 'shopping', name: 'Compras', icon: 'bag', color: '#F08A5D', kind: 'expense' },
  { key: 'subscriptions', name: 'Suscripciones', icon: 'repeat', color: '#C38FD8', kind: 'expense' },
  { key: 'debt', name: 'Deudas y financiación', icon: 'card', color: '#E07A5F', kind: 'expense' },
  { key: 'savings', name: 'Ahorro', icon: 'piggy', color: '#46C5B0', kind: 'expense' },
  { key: 'other', name: 'Otros', icon: 'dots', color: '#9AA7B4', kind: 'both' },
  { key: 'salary', name: 'Salario', icon: 'salary', color: '#5FD3A1', kind: 'income' },
  { key: 'extra_income', name: 'Ingreso extra', icon: 'spark', color: '#E6D36A', kind: 'income' },
];
