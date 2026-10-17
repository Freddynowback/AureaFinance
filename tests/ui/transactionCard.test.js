const React = require('react');
const renderer = require('react-test-renderer');
const TransactionCard = require('../../components/TransactionCard').default;

const base = { occurred_at: '2026-10-17 12:30:00', account_name: 'Cuenta', category_name: 'Comida', category_icon: 'food' };
const render = tx => {
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(TransactionCard, { tx: { ...base, ...tx } }));
  });
  return tree;
};
const strings = tree => tree.root.findAllByType(require('react-native').Text).map(node => node.props.children).flat().filter(Boolean).join(' ');

test('muestra gasto con signo negativo', () => {
  expect(strings(render({ kind: 'expense', amount: 123450 }))).toEqual(expect.stringContaining('-$1,234.50'));
});

test('muestra ingreso con signo positivo', () => {
  expect(strings(render({ kind: 'income', amount: 50000, source: 'Nómina' }))).toEqual(expect.stringContaining('+$500.00'));
});

test('muestra transferencia A → B sin descripción', () => {
  expect(strings(render({ kind: 'transfer', amount: 10000, account_name: 'A', to_account_name: 'B' }))).toEqual(expect.stringContaining('A → B'));
});

test('muestra devolución con signo positivo', () => {
  expect(strings(render({ kind: 'refund', amount: 2500 }))).toEqual(expect.stringContaining('+$25.00'));
});
