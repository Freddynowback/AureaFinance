import {
  checkCreditCharge,
  creditSummary,
  creditTotals,
} from '../../services/accounts/creditService';

describe('creditSummary', () => {
  test('summarizes the reference NU card in centavos', () => {
    const summary = creditSummary(
      { id: 'nu', credit_limit: 400000, balance: -300000 },
      [{
        account_id: 'nu',
        status: 'active',
        outstanding: 240000,
        monthly_payment: 20000,
      }],
    );

    expect(summary).toEqual({
      limit: 400000,
      used: 300000,
      inFavor: 0,
      available: 100000,
      overLimit: false,
      utilization: 75,
      financed: 240000,
      financedTotal: 240000,
      monthlyDue: 20000,
      plansCount: 1,
      plansWithoutMonthly: 0,
      revolving: 60000,
      unreconciled: 0,
    });
  });

  test('represents an account without a limit and a balance in favor', () => {
    expect(
      creditSummary({ id: 'cash-like', credit_limit: null, balance: 12500 }),
    ).toEqual({
      limit: null,
      used: 0,
      inFavor: 12500,
      available: null,
      overLimit: false,
      utilization: null,
      financed: 0,
      financedTotal: 0,
      monthlyDue: 0,
      plansCount: 0,
      plansWithoutMonthly: 0,
      revolving: 0,
      unreconciled: 0,
    });
  });

  test('marks an account over its limit and keeps available negative', () => {
    expect(
      creditSummary({ id: 'over', credit_limit: 100000, balance: -125000 }),
    ).toMatchObject({
      used: 125000,
      available: -25000,
      overLimit: true,
      utilization: 125,
    });
  });

  test('ignores plans from other cards, inactive plans, and zero outstanding', () => {
    const summary = creditSummary(
      { id: 'card-a', credit_limit: 500000, balance: -100000 },
      [
        { account_id: 'card-b', status: 'active', outstanding: 90000, monthly_payment: 10000 },
        { account_id: 'card-a', status: 'inactive', outstanding: 80000, monthly_payment: 10000 },
        { account_id: 'card-a', status: 'active', outstanding: 0, monthly_payment: 10000 },
        { account_id: 'card-a', status: 'active', outstanding: 60000 },
      ],
    );

    expect(summary).toMatchObject({
      plansCount: 1,
      financed: 60000,
      monthlyDue: 0,
      plansWithoutMonthly: 1,
      revolving: 40000,
    });
  });

  test('counts financed amounts above used as unreconciled and caps financed', () => {
    expect(
      creditSummary(
        { id: 'card-a', credit_limit: 500000, balance: -100000 },
        [{ account_id: 'card-a', status: 'active', outstanding: 140000, monthly_payment: 20000 }],
      ),
    ).toMatchObject({
      financed: 100000,
      financedTotal: 140000,
      revolving: 0,
      unreconciled: 40000,
      monthlyDue: 20000,
    });
  });

  test('does not make a monthly due exceed a plan outstanding', () => {
    expect(
      creditSummary(
        { id: 'card-a', credit_limit: 100000, balance: -50000 },
        [{ account_id: 'card-a', status: 'active', outstanding: 50000, monthly_payment: 70000 }],
      ).monthlyDue,
    ).toBe(50000);
  });
});

describe('creditTotals', () => {
  test('sums credit data and counts cards without a limit', () => {
    expect(
      creditTotals([
        { limit: 400000, used: 300000, available: 100000, financed: 240000, monthlyDue: 20000 },
        { limit: null, used: 50000, available: null, financed: 0, monthlyDue: 0 },
        { limit: 250000, used: 200000, available: 50000, financed: 100000, monthlyDue: 10000 },
      ]),
    ).toEqual({
      limit: 650000,
      used: 550000,
      available: 150000,
      financed: 340000,
      monthlyDue: 30000,
      cardsWithoutLimit: 1,
    });
  });
});

describe('checkCreditCharge', () => {
  const summary = { limit: 400000, used: 300000 };

  test('returns null when a charge fits in the available credit', () => {
    expect(checkCreditCharge(summary, 100000)).toBeNull();
  });

  test('returns the exact excess when a charge exceeds the limit', () => {
    expect(checkCreditCharge(summary, 125000)).toEqual({
      after: 425000,
      over: 25000,
      limit: 400000,
    });
  });

  test('subtracts the previous amount when editing a charge', () => {
    expect(checkCreditCharge(summary, 150000, 100000)).toBeNull();
    expect(checkCreditCharge(summary, 300000, 100000)).toEqual({
      after: 500000,
      over: 100000,
      limit: 400000,
    });
  });

  test('returns null for missing summaries and cards without a limit', () => {
    expect(checkCreditCharge(null, 999999)).toBeNull();
    expect(checkCreditCharge({ limit: null, used: 999999 }, 1)).toBeNull();
  });
});
