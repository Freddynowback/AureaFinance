import {
  addMonths,
  diffDays,
  nextMonthlyDate,
  parseFlexibleDate,
} from '../../utils/dates';

describe('addMonths', () => {
  test('clamps month ends, including leap-year February', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
  });

  test('supports negative offsets and a preferred day', () => {
    expect(addMonths('2026-01-31', -2)).toBe('2025-11-30');
    expect(addMonths('2026-01-10', 1, 31)).toBe('2026-02-28');
  });
});

describe('diffDays', () => {
  test('calculates signed calendar-day differences', () => {
    expect(diffDays('2026-01-01', '2026-01-31')).toBe(30);
    expect(diffDays('2026-01-31', '2026-01-01')).toBe(-30);
    expect(diffDays('2028-02-28', '2028-03-01')).toBe(2);
  });
});

describe('nextMonthlyDate', () => {
  test('returns the current month when the candidate is not earlier', () => {
    expect(nextMonthlyDate('2026-05-10', 15)).toBe('2026-05-15');
    expect(nextMonthlyDate('2026-05-15', 15)).toBe('2026-05-15');
  });

  test('rolls to the next month and clamps nonexistent days', () => {
    expect(nextMonthlyDate('2026-05-16', 15)).toBe('2026-06-15');
    expect(nextMonthlyDate('2028-02-01', 31)).toBe('2028-02-29');
    expect(nextMonthlyDate('2028-02-29', 31)).toBe('2028-02-29'); // el día efectivo de febrero ya es >= from
    expect(nextMonthlyDate('2028-03-01', 31)).toBe('2028-03-31');
  });
});

describe('parseFlexibleDate', () => {
  test('parses ISO, dmy, mdy, and Spanish month names', () => {
    expect(parseFlexibleDate('2026-10-17')).toBe('2026-10-17 12:00:00');
    expect(parseFlexibleDate('17/10/2026')).toBe('2026-10-17 12:00:00');
    expect(parseFlexibleDate('10/17/2026', 'mdy')).toBe('2026-10-17 12:00:00');
    expect(parseFlexibleDate('17/octubre/2026')).toBe('2026-10-17 12:00:00');
    expect(parseFlexibleDate('29/feb/28')).toBe('2028-02-29 12:00:00');
  });

  test('preserves valid times and defaults missing seconds', () => {
    expect(parseFlexibleDate('2026-10-17 08:05')).toBe('2026-10-17 08:05:00');
    expect(parseFlexibleDate('17/10/2026T23:59:41')).toBe('2026-10-17 23:59:41');
  });

  test.each(['2026-02-29', '31/04/2026', 'not a date', '', '31/13/2026', '31/02/2026'])(
    'returns null for invalid date %s',
    input => expect(parseFlexibleDate(input)).toBeNull(),
  );

  test('rejects trailing text and invalid time components', () => {
    expect(parseFlexibleDate('2026-10-17 basura')).toBeNull();
    expect(parseFlexibleDate('2026-10-17 25:99')).toBeNull();
  });
});
