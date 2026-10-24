import { addMonths } from '../../utils/dates';
import {
  assessPlan,
  buildInstallmentPlan,
  buildPlan,
  compareInstallmentPlans,
  comparePlans,
  pendingInstallments,
  planFromAmount,
} from '../../services/debts/recommender';

const TODAY = '2026-10-17';

describe('buildPlan', () => {
  test.each([
    ['weekly', '2026-11-14', 4],
    ['biweekly', '2026-11-14', 2],
    ['monthly', '2026-11-17', 1],
  ])('creates a %s plan for 400 pesos through the deadline', (frequency, deadline, periods) => {
    const plan = buildPlan({
      outstanding: 40000,
      today: TODAY,
      deadline,
      frequency,
    });

    expect(plan.periods).toBe(periods);
    expect(plan.toCover).toBe(40000);
    expect(plan.total).toBe(plan.toCover);
    expect(plan.schedule.reduce((total, payment) => total + payment.amount, 0)).toBe(plan.toCover);
    expect(plan.schedule[plan.schedule.length - 1].date).toBe(deadline);
  });

  test('keeps pesos as the preferred unit while the first payment absorbs centavos', () => {
    const plan = buildPlan({
      outstanding: 100001,
      today: TODAY,
      deadline: '2026-11-14',
      frequency: 'weekly',
    });

    expect(plan.periods).toBe(4);
    expect(plan.schedule.map(payment => payment.amount)).toEqual([25001, 25000, 25000, 25000]);
    expect(plan.total).toBe(100001);
  });

  test('reduces toCover by reserved money and never makes it negative', () => {
    expect(
      buildPlan({
        outstanding: 40000,
        reserved: 12500,
        today: TODAY,
        deadline: '2026-11-14',
        frequency: 'weekly',
      }),
    ).toMatchObject({ reserved: 12500, toCover: 27500, total: 27500 });

    expect(
      buildPlan({
        outstanding: 40000,
        reserved: 50000,
        today: TODAY,
        deadline: '2026-11-14',
        frequency: 'weekly',
      }),
    ).toMatchObject({ reserved: 40000, toCover: 0, total: 0 });
  });

  test('marks an expired deadline as overdue and schedules one payment today', () => {
    const plan = buildPlan({
      outstanding: 40000,
      today: TODAY,
      deadline: '2026-10-10',
      frequency: 'weekly',
    });

    expect(plan.overdue).toBe(true);
    expect(plan.periods).toBe(1);
    expect(plan.schedule).toEqual([{ date: TODAY, amount: 40000 }]);
  });

  test('uses one payment on the deadline when less than one period remains', () => {
    const plan = buildPlan({
      outstanding: 40000,
      today: TODAY,
      deadline: '2026-10-20',
      frequency: 'weekly',
    });

    expect(plan.periods).toBe(1);
    expect(plan.schedule).toEqual([{ date: '2026-10-20', amount: 40000 }]);
  });
});

test('comparePlans returns weekly, biweekly, and monthly plans', () => {
  const plans = comparePlans({
    outstanding: 40000,
    today: TODAY,
    deadline: '2026-11-14',
  });

  expect(plans).toHaveLength(3);
  expect(plans.map(plan => plan.frequency)).toEqual(['weekly', 'biweekly', 'monthly']);
});

describe('planFromAmount', () => {
  const params = {
    outstanding: 1000,
    today: TODAY,
    deadline: '2026-11-14',
    frequency: 'weekly',
    amountPerPeriod: 300,
  };

  test('calculates periods, a smaller final payment, and an on-time finish', () => {
    const plan = planFromAmount(params);

    expect(plan.periods).toBe(4);
    expect(plan.schedule.map(payment => payment.amount)).toEqual([300, 300, 300, 100]);
    expect(plan.finishDate).toBe('2026-11-14');
    expect(plan.meetsDeadline).toBe(true);
    expect(plan.total).toBe(1000);
  });

  test('reports when the amount cannot meet the deadline', () => {
    expect(
      planFromAmount({ ...params, deadline: '2026-11-07' }).meetsDeadline,
    ).toBe(false);
  });

  test('rejects a zero amount per period', () => {
    expect(() => planFromAmount({ ...params, amountPerPeriod: 0 })).toThrow(
      'La cantidad por periodo debe ser mayor que cero',
    );
  });
});

describe('assessPlan', () => {
  const plan = buildPlan({
    outstanding: 40000,
    today: TODAY,
    deadline: '2026-10-20',
    frequency: 'weekly',
  });

  test('uses arithmetic basis and reports missing incomes when there are no incomes', () => {
    const result = assessPlan(plan, { available: 40000, dailySpending: 0 }, TODAY);

    expect(result.basis).toBe('arithmetic');
    expect(result.missing.some(item => item.includes('ingresos'))).toBe(true);
  });

  test('reports a shortfall with its date when available cash is insufficient', () => {
    const result = assessPlan(
      plan,
      {
        available: 10000,
        incomes: [{ date: '2026-10-18', amount: 0 }],
        expenses: [],
        obligations: [],
        dailySpending: 0,
        interestKnown: true,
      },
      TODAY,
    );

    expect(result.shortfall).toEqual({ date: '2026-10-20', amount: 30000 });
    expect(result.warnings).toHaveLength(1);
  });

  test('has no warnings when available cash covers the plan', () => {
    const result = assessPlan(
      plan,
      {
        available: 40000,
        incomes: [{ date: '2026-10-18', amount: 0 }],
        expenses: [],
        obligations: [],
        dailySpending: 0,
        interestKnown: true,
      },
      TODAY,
    );

    expect(result.warnings).toEqual([]);
    expect(result.shortfall).toBeNull();
  });

  test('notes that unknown interest is not included', () => {
    const result = assessPlan(plan, {}, TODAY);

    expect(result.notes.join(' ')).toMatch(/No se consideran intereses/i);
  });
});

describe('mensualidades', () => {
  const today = '2026-10-01';
  const fixed = { outstanding: 120000, monthly_payment: 40000, monthlyDue: 40000, next_due_date: '2026-11-01', effectiveDueDate: '2026-11-01', schedule: null };

  test('pendingInstallments: pago fijo mes a mes hasta cubrir el saldo, el último puede ser menor', () => {
    expect(pendingInstallments({ ...fixed, outstanding: 100000 })).toEqual([
      { date: '2026-11-01', amount: 40000 },
      { date: '2026-12-01', amount: 40000 },
      { date: '2027-01-01', amount: 20000 },
    ]);
    expect(pendingInstallments({ ...fixed, monthly_payment: null, monthlyDue: null })).toBeNull();
  });

  test('$400 al mes = $400 mensual, $200 por quincena, $100 por semana (no liquidar todo)', () => {
    const installments = pendingInstallments(fixed);
    const [weekly, biweekly, monthly] = compareInstallmentPlans({ installments, today });
    expect(monthly).toMatchObject({ perPeriod: 40000, periods: 3, total: 120000 });
    expect(biweekly).toMatchObject({ perPeriod: 20000, periods: 6, total: 120000 });
    expect(weekly).toMatchObject({ perPeriod: 10000, periods: 12, total: 120000 });
    expect(weekly.schedule.slice(0, 4)).toEqual([
      { date: '2026-10-11', amount: 10000 },
      { date: '2026-10-18', amount: 10000 },
      { date: '2026-10-25', amount: 10000 },
      { date: '2026-11-01', amount: 10000 },
    ]);
    expect(weekly.firstDue).toEqual({ date: '2026-11-01', count: 4, amount: 10000, short: false });
    expect(weekly.later).toEqual([]);
  });

  test('si queda poco para la primera mensualidad, sus aportaciones son menos y más altas', () => {
    const plan = buildInstallmentPlan({ installments: pendingInstallments(fixed), today: '2026-10-24', frequency: 'weekly' });
    expect(plan.schedule.slice(0, 2)).toEqual([
      { date: '2026-10-25', amount: 20000 },
      { date: '2026-11-01', amount: 20000 },
    ]);
    // Lo recomendado es lo que toca ahora; después baja a lo normal.
    expect(plan.perPeriod).toBe(20000);
    expect(plan.firstDue).toEqual({ date: '2026-11-01', count: 2, amount: 20000, short: true });
    expect(plan.later).toEqual([{ date: '2026-12-01', amount: 10000 }]);
  });

  test('calendario con montos distintos y apartado aplicado a la mensualidad más próxima', () => {
    const debt = { schedule: { pending: [{ due_date: '2026-11-05', amount: 125000 }, { due_date: '2026-12-05', amount: 98000 }] } };
    const plan = buildInstallmentPlan({ installments: pendingInstallments(debt), reserved: 25000, today, frequency: 'biweekly' });
    expect(plan.schedule).toEqual([
      { date: '2026-10-21', amount: 50000 },
      { date: '2026-11-05', amount: 50000 },
      { date: '2026-11-20', amount: 49000 },
      { date: '2026-12-05', amount: 49000 },
    ]);
    expect(plan).toMatchObject({ reserved: 25000, toCover: 198000, total: 198000 });
  });

  test('calendario con meses distintos: lo recomendado es el mes en curso, no el importe más repetido', () => {
    const months = [65000, 65000, 38000, 26600, 26600, 26600, 26600, 26600];
    const pending = months.map((amount, i) => ({ due_date: addMonths('2026-11-05', i), amount }));
    const [weekly, biweekly, monthly] = compareInstallmentPlans({ installments: pendingInstallments({ schedule: { pending } }), today: '2026-10-24' });
    expect(monthly.perPeriod).toBe(65000);
    expect(monthly.later).toEqual([{ date: '2027-01-05', amount: 38000 }, { date: '2027-02-05', amount: 26600 }]);
    // Para el 5 nov solo cabe una quincena y dos semanas.
    expect(biweekly).toMatchObject({ perPeriod: 65000, firstDue: { count: 1, short: true } });
    expect(weekly).toMatchObject({ perPeriod: 32500, firstDue: { count: 2, short: true } });
    // Pagado el primer mes, lo recomendado pasa al siguiente.
    const next = buildInstallmentPlan({ installments: pendingInstallments({ schedule: { pending: pending.slice(2) } }), today: '2026-12-06', frequency: 'monthly' });
    expect(next.perPeriod).toBe(38000);
  });

  test('mensualidad vencida: se aporta hoy', () => {
    const plan = buildInstallmentPlan({ installments: [{ date: '2026-09-05', amount: 30000 }, { date: '2026-10-05', amount: 30000 }], today, frequency: 'weekly' });
    expect(plan.overdue).toBe(true);
    expect(plan.schedule[0]).toEqual({ date: today, amount: 30000 });
  });

  test('ajustar a mi comodidad avisa si no alcanza para una mensualidad aunque acabe a tiempo', () => {
    const installments = [{ date: '2026-10-10', amount: 50000 }, { date: '2026-12-01', amount: 10000 }];
    const plan = planFromAmount({ outstanding: 60000, today, deadline: '2026-12-01', frequency: 'weekly', amountPerPeriod: 10000, installments });
    expect(plan.finishDate <= '2026-12-01').toBe(true);
    expect(plan.missedInstallment).toEqual(installments[0]);
    expect(plan.meetsDeadline).toBe(false);
  });
});
