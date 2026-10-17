const React = require('react');
const renderer = require('react-test-renderer');
const AmountField = require('../../components/common/AmountField').default;

const input = tree => tree.root.findByType(require('react-native').TextInput);

test("convierte '1,234.50' a centavos", () => {
  const onChange = jest.fn();
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(AmountField, { label: 'Importe', value: null, onChange }));
  });
  renderer.act(() => input(tree).props.onChangeText('1,234.50'));
  expect(onChange).toHaveBeenLastCalledWith(123450);
});

test('envía null para texto inválido', () => {
  const onChange = jest.fn();
  let tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(AmountField, { value: null, onChange }));
  });
  renderer.act(() => input(tree).props.onChangeText('abc'));
  expect(onChange).toHaveBeenLastCalledWith(null);
});
