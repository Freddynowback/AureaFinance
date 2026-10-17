const React = require('react');
const renderer = require('react-test-renderer');
const BudgetProgress = require('../../components/BudgetProgress').default;

const render = budget => {
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(BudgetProgress, {
      budget: { period_type: 'monthly', period: { type: 'monthly', start: '2026-10-01', end: '2026-11-01' }, thresholds: [], ...budget },
    }));
  });
  return tree;
};
const strings = tree => tree.root.findAllByType(require('react-native').Text).map(node => node.props.children).flat().filter(Boolean).join(' ');

test('muestra porcentaje y cantidad restante', () => {
  const tree = render({ amount: 100000, spent: 25000, percent: 25, remaining: 75000 });
  expect(strings(tree)).toEqual(expect.stringContaining('25 %'));
  expect(strings(tree)).toEqual(expect.stringContaining('Quedan $750.00'));
});

test('muestra Excedido cuando el restante es negativo', () => {
  const tree = render({ amount: 100000, spent: 120000, percent: 120, remaining: -20000, exceeded: true });
  expect(strings(tree)).toEqual(expect.stringContaining('120 %'));
  expect(strings(tree)).toEqual(expect.stringContaining('Excedido $200.00'));
});
