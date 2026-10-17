import {
  formatMoney,
  parseAmount,
  percentages,
  splitEvenly,
} from '../../utils/money';

describe('parseAmount', () => {
  test.each([
    ['$1,234.56', 123456],
    ['(350.00)', -35000],
    ['-1,200', -120000],
    ['12,5', 1250],
    ['12,50', 1250],
    ['1.234,56', 123456],
    ['MXN 1,234.50', 123450],
    ['1234.5', 123450],
  ])('parses %s as %i cents', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  test.each(['1,23,4', 'abc', '1.234.5', '', '   ', '$', '1,234.567', '12,3456'])(
    'returns null for invalid amount %s',
    input => expect(parseAmount(input)).toBeNull(),
  );

  test('supports numbers and explicit decimal separators', () => {
    expect(parseAmount(12.345)).toBe(1235);
    expect(parseAmount(Infinity)).toBeNull();
    expect(parseAmount('1.234,56', { decimalSeparator: ',' })).toBe(123456);
  });
});

describe('formatMoney', () => {
  test.each([
    [123456, '$1,234.56'],
    [0, '$0.00'],
    [-35000, '-$350.00'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });

  test('supports cents visibility, positive sign, currencies, and invalid values', () => {
    expect(formatMoney(123400, 'MXN', { showCents: false })).toBe('$1,234');
    expect(formatMoney(1250, 'MXN', { sign: true })).toBe('+$12.50');
    expect(formatMoney(1250, 'USD')).toBe('US$12.50');
    expect(formatMoney(1250, 'EUR')).toBe('€12.50');
    expect(formatMoney(1.5)).toBe('—');
  });
});

describe('splitEvenly', () => {
  test('preserves the exact total and distributes the remainder first', () => {
    const result = splitEvenly(100, 3);
    expect(result).toEqual([34, 33, 33]);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  test('uses unit 100 while the first part absorbs the residual cents', () => {
    expect(splitEvenly(1001, 3, 100)).toEqual([401, 300, 300]);
    expect(splitEvenly(100, 3, 100)).toEqual([100, 0, 0]);
  });

  test('handles negative totals symmetrically', () => {
    expect(splitEvenly(-100, 3)).toEqual([-34, -33, -33]);
    expect(splitEvenly(-1001, 3, 100)).toEqual([-401, -300, -300]);
  });

  test.each([
    [100, 0, 1],
    [100, 3.5, 1],
    [100, 3, 0],
    [1.2, 2, 1],
  ])('rejects invalid arguments (%p, %p, %p)', (total, parts, unit) => {
    expect(() => splitEvenly(total, parts, unit)).toThrow();
  });
});

describe('percentages', () => {
  test('returns integer percentages summing exactly to 100', () => {
    const result = percentages([1, 1, 1]);
    expect(result).toEqual([34, 33, 33]);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  test('supports decimal places and stable largest-remainder ties', () => {
    const result = percentages([1, 2, 3], 1);
    expect(result).toEqual([16.7, 33.3, 50]);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  test('returns zeros when total is zero', () => {
    expect(percentages([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('parseAmount con números (auditoría)', () => {
  test.each([
    [1.005, 101],
    [1.004, 100],
    [-2.675, -268],
    [0.1 + 0.2, 30],
    [1234.5, 123450],
    [1e21, null],
  ])('%p -> %p', (input, expected) => {
    const r = parseAmount(input);
    if (expected === null) expect(Number.isSafeInteger(r)).toBe(false);
    else expect(r).toBe(expected);
  });
});
