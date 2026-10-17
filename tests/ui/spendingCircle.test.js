const React = require('react');
const renderer = require('react-test-renderer');
const SpendingCircle = require('../../components/SpendingCircle').default;

const render = props => {
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(SpendingCircle, {
    label: 'Gasto semanal',
    spent: 123450,
    remaining: { remaining: 76550, base: 'income', baseAmount: 200000 },
    segments: [{ categoryId: 'food', name: 'Comida', color: '#fff', amount: 123450, percent: 100 }],
    periodKey: 'week-1',
    ...props,
    }));
  });
  return tree;
};

const text = tree => tree.root.findAllByType(require('react-native').Text).map(node => node.props.children).flat().join('');

test('muestra etiqueta, gasto formateado, restante y base de ingresos', () => {
  const tree = render();
  expect(text(tree)).toEqual(expect.stringContaining('Gasto semanal'));
  expect(text(tree)).toEqual(expect.stringContaining('$1,234.50'));
  expect(text(tree)).toEqual(expect.stringContaining('Restante'));
  expect(text(tree)).toEqual(expect.stringContaining('de $2,000 ingresados'));
});

test('muestra Excedido cuando remaining es negativo', () => {
  const tree = render({ remaining: { remaining: -5000, base: 'budget', baseAmount: 100000 } });
  expect(text(tree)).toEqual(expect.stringContaining('Excedido'));
  expect(text(tree)).toEqual(expect.stringContaining('$50'));
});

test('muestra estado vacío sin segmentos', () => {
  const tree = render({ remaining: { remaining: null }, segments: [] });
  expect(text(tree)).toEqual(expect.stringContaining('Sin gastos en este periodo'));
});

test('incluye categorías y porcentajes en accessibilityLabel', () => {
  const tree = render({
    segments: [
      { categoryId: 'food', name: 'Comida', color: '#fff', amount: 7000, percent: 70 },
      { categoryId: 'transport', name: 'Transporte', color: '#fff', amount: 3000, percent: 30 },
    ],
  });
  const button = tree.root.findByProps({ accessibilityRole: 'button' });
  expect(button.props.accessibilityLabel).toEqual(expect.stringContaining('Comida 70 por ciento'));
  expect(button.props.accessibilityLabel).toEqual(expect.stringContaining('Transporte 30 por ciento'));
});

test('llama onPress', () => {
  const onPress = jest.fn();
  const tree = render({ onPress });
  tree.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
  expect(onPress).toHaveBeenCalledTimes(1);
});
