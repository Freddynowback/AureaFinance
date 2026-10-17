import { getPeriod, nextOccurrence, shiftPeriod } from '../../utils/periods';

describe('getPeriod', () => {
  test('calculates weekly periods starting on Monday or Sunday', () => {
    expect(getPeriod('2026-10-14', { type: 'weekly', weekStartDay: 1 })).toEqual({
      type: 'weekly',
      start: '2026-10-12',
      end: '2026-10-19',
    });
    expect(getPeriod('2026-10-14', { type: 'weekly', weekStartDay: 0 })).toEqual({
      type: 'weekly',
      start: '2026-10-11',
      end: '2026-10-18',
    });
  });

  test('calculates calendar and anchored biweekly periods', () => {
    expect(getPeriod('2026-02-10', { type: 'biweekly', biweeklyMode: 'calendar' })).toEqual({
      type: 'biweekly',
      start: '2026-02-01',
      end: '2026-02-16',
    });
    expect(getPeriod('2026-02-28', { type: 'biweekly', biweeklyMode: 'calendar' })).toEqual({
      type: 'biweekly',
      start: '2026-02-16',
      end: '2026-03-01',
    });
    expect(getPeriod('2026-01-20', {
      type: 'biweekly',
      biweeklyMode: 'anchor',
      biweeklyAnchor: '2026-01-06',
    })).toEqual({
      type: 'biweekly',
      start: '2026-01-20',
      end: '2026-02-03',
    });
  });

  test('supports monthly periods crossing years', () => {
    expect(getPeriod('2027-01-05', { type: 'monthly', monthStartDay: 15 })).toEqual({
      type: 'monthly',
      start: '2026-12-15',
      end: '2027-01-15',
    });
    expect(getPeriod('2027-12-20', { type: 'monthly', monthStartDay: 15 })).toEqual({
      type: 'monthly',
      start: '2027-12-15',
      end: '2028-01-15',
    });
  });

  test('calculates yearly and valid custom periods', () => {
    expect(getPeriod('2026-07-20', { type: 'yearly' })).toEqual({
      type: 'yearly',
      start: '2026-01-01',
      end: '2027-01-01',
    });
    expect(getPeriod('2026-07-20', {
      type: 'custom',
      customStart: '2026-07-01',
      customEnd: '2026-07-20',
    })).toEqual({
      type: 'custom',
      start: '2026-07-01',
      end: '2026-07-21',
    });
  });

  test('marks invalid custom ranges while preserving a safe fallback', () => {
    expect(getPeriod('2026-07-20', {
      type: 'custom',
      customStart: '2026-08-01',
      customEnd: '2026-07-01',
    })).toEqual({
      type: 'custom',
      start: '2026-07-01',
      end: '2026-08-01',
      invalid: true,
    });
  });
});

describe('shiftPeriod', () => {
  test('shifts weekly periods backward and forward across years', () => {
    const period = getPeriod('2027-01-02', { type: 'weekly', weekStartDay: 1 });
    expect(shiftPeriod(period, -1, { weekStartDay: 1 })).toEqual({
      type: 'weekly',
      start: '2026-12-21',
      end: '2026-12-28',
    });
    expect(shiftPeriod(period, 1, { weekStartDay: 1 })).toEqual({
      type: 'weekly',
      start: '2027-01-04',
      end: '2027-01-11',
    });
  });

  test('shifts custom periods by their exact length', () => {
    const period = { type: 'custom', start: '2026-12-20', end: '2027-01-05' };
    expect(shiftPeriod(period, -1)).toEqual({
      type: 'custom',
      start: '2026-12-04',
      end: '2026-12-20',
    });
    expect(shiftPeriod(period, 1)).toEqual({
      type: 'custom',
      start: '2027-01-05',
      end: '2027-01-21',
    });
  });
});

describe('nextOccurrence semimonthly', () => {
  test('returns the 15th, month end, and next month 15th', () => {
    expect(nextOccurrence('2026-02-01', 'semimonthly')).toBe('2026-02-15');
    expect(nextOccurrence('2026-02-15', 'semimonthly')).toBe('2026-02-28');
    expect(nextOccurrence('2026-02-28', 'semimonthly')).toBe('2026-03-15');
    expect(nextOccurrence('2028-02-15', 'semimonthly')).toBe('2028-02-29');
    expect(nextOccurrence('2028-02-29', 'semimonthly')).toBe('2028-03-15');
  });
});
