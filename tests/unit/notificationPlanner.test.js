import { planScheduled, planImmediate } from '../../services/notifications/notificationPlanner';

describe('notificationPlanner', () => {
  // now fijo: 17 de octubre de 2026, 10:00:00 local
  const fixedNow = new Date(2026, 9, 17, 10, 0, 0);

  const baseSettings = {
    'notifications.enabled': true,
    'notifications.daysBefore': 2,
    'notifications.hour': 9,
    'notifications.cardDue': true,
    'notifications.debtDue': true,
    'notifications.expectedIncome': true,
    'notifications.recurringExpense': true,
    'notifications.dailyReminder': true,
    'notifications.dailyReminderHour': 21,
    'notifications.budget': true,
    'notifications.lowRemaining': true,
    'notifications.lowRemainingPercent': 20,
  };

  describe('planScheduled', () => {
    const sampleUpcoming = [
      {
        type: 'card_due',
        accountId: 'acc-card-1',
        title: 'Vence Tarjeta Platino',
        amount: 540000,
        date: '2026-10-25',
      },
      {
        type: 'debt_due',
        debtId: 'debt-1',
        title: 'Préstamo Auto',
        amount: 250000,
        amountIsEstimate: false,
        date: '2026-10-24',
      },
      {
        type: 'expected_income',
        occurrenceId: 'occ-inc-1',
        title: 'Nómina Quincenal',
        amount: 1500000,
        date: '2026-10-20',
      },
      {
        type: 'recurring_expense',
        occurrenceId: 'occ-exp-1',
        title: 'Servicio de Internet',
        amount: 60000,
        date: '2026-10-26',
      },
    ];

    test('devuelve [] si notifications.enabled=false', () => {
      const settings = { ...baseSettings, 'notifications.enabled': false };
      const result = planScheduled({
        settings,
        upcoming: sampleUpcoming,
        now: fixedNow,
      });
      expect(result).toEqual([]);
    });

    test('respeta toggles por tipo', () => {
      // Solo card_due activo
      const cardOnly = {
        ...baseSettings,
        'notifications.cardDue': true,
        'notifications.debtDue': false,
        'notifications.expectedIncome': false,
        'notifications.recurringExpense': false,
        'notifications.dailyReminder': false,
      };
      const resCard = planScheduled({
        settings: cardOnly,
        upcoming: sampleUpcoming,
        now: fixedNow,
      });
      expect(resCard).toHaveLength(1);
      expect(resCard[0].id).toBe('card_due:acc-card-1:2026-10-25');

      // Solo debt_due activo
      const debtOnly = {
        ...baseSettings,
        'notifications.cardDue': false,
        'notifications.debtDue': true,
        'notifications.expectedIncome': false,
        'notifications.recurringExpense': false,
        'notifications.dailyReminder': false,
      };
      const resDebt = planScheduled({
        settings: debtOnly,
        upcoming: sampleUpcoming,
        now: fixedNow,
      });
      expect(resDebt).toHaveLength(1);
      expect(resDebt[0].id).toBe('debt_due:debt-1:2026-10-24');

      // Solo expected_income activo
      const incomeOnly = {
        ...baseSettings,
        'notifications.cardDue': false,
        'notifications.debtDue': false,
        'notifications.expectedIncome': true,
        'notifications.recurringExpense': false,
        'notifications.dailyReminder': false,
      };
      const resIncome = planScheduled({
        settings: incomeOnly,
        upcoming: sampleUpcoming,
        now: fixedNow,
      });
      expect(resIncome).toHaveLength(1);
      expect(resIncome[0].id).toBe('expected_income:occ-inc-1:2026-10-20');

      // Solo recurring_expense activo
      const expenseOnly = {
        ...baseSettings,
        'notifications.cardDue': false,
        'notifications.debtDue': false,
        'notifications.expectedIncome': false,
        'notifications.recurringExpense': true,
        'notifications.dailyReminder': false,
      };
      const resExpense = planScheduled({
        settings: expenseOnly,
        upcoming: sampleUpcoming,
        now: fixedNow,
      });
      expect(resExpense).toHaveLength(1);
      expect(resExpense[0].id).toBe('recurring_expense:occ-exp-1:2026-10-26');
    });

    test('calcula hora de aviso daysBefore antes a la hora configurada', () => {
      const settings = {
        ...baseSettings,
        'notifications.daysBefore': 3,
        'notifications.hour': 8,
        'notifications.dailyReminder': false,
      };
      const upcoming = [
        {
          type: 'card_due',
          accountId: 'acc-card-1',
          title: 'Tarjeta Platino',
          amount: 500000,
          date: '2026-10-25',
        },
      ];
      const result = planScheduled({ settings, upcoming, now: fixedNow });
      expect(result).toHaveLength(1);

      // 2026-10-25 - 3 días = 2026-10-22 a las 08:00:00
      const expectedTime = new Date(2026, 9, 22, 8, 0, 0).getTime();
      expect(result[0].timestamp).toBe(expectedTime);
    });

    test('ids estables (mismo input -> mismos ids, sin duplicados)', () => {
      const res1 = planScheduled({
        settings: baseSettings,
        upcoming: sampleUpcoming,
        now: fixedNow,
      });
      const res2 = planScheduled({
        settings: baseSettings,
        upcoming: sampleUpcoming,
        now: fixedNow,
      });

      expect(res1.map(r => r.id)).toEqual(res2.map(r => r.id));

      const ids = res1.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('si la fecha de aviso ya pasó pero el vencimiento no, avisa en +1h', () => {
      // Vence mañana 2026-10-18. Con daysBefore=2, notifyDate fue 2026-10-16.
      // fixedNow es 2026-10-17 10:00:00.
      // La hora de aviso (2026-10-16 09:00:00) ya pasó, pero el vencimiento (2026-10-18 23:00) no.
      const settings = {
        ...baseSettings,
        'notifications.daysBefore': 2,
        'notifications.hour': 9,
        'notifications.dailyReminder': false,
      };
      const upcoming = [
        {
          type: 'card_due',
          accountId: 'acc-card-1',
          title: 'Tarjeta Platino',
          amount: 100000,
          date: '2026-10-18',
        },
      ];

      const result = planScheduled({ settings, upcoming, now: fixedNow });
      expect(result).toHaveLength(1);
      const expectedWhen = fixedNow.getTime() + 60 * 60 * 1000; // fixedNow + 1h
      expect(result[0].timestamp).toBe(expectedWhen);
    });

    test('ignora vencimientos ya pasados', () => {
      // Vence ayer (2026-10-16). fixedNow es 2026-10-17 10:00:00.
      const settings = {
        ...baseSettings,
        'notifications.dailyReminder': false,
      };
      const upcoming = [
        {
          type: 'card_due',
          accountId: 'acc-card-1',
          title: 'Tarjeta Platino',
          amount: 100000,
          date: '2026-10-16',
        },
      ];

      const result = planScheduled({ settings, upcoming, now: fixedNow });
      expect(result).toEqual([]);
    });

    test('recordatorio diario programa hoy si la hora no ha pasado, o mañana si ya pasó', () => {
      // fixedNow es 10:00:00. Con dailyReminderHour=21, debe programarse hoy a las 21:00.
      const settings = {
        ...baseSettings,
        'notifications.dailyReminder': true,
        'notifications.dailyReminderHour': 21,
      };
      const resToday = planScheduled({
        settings,
        upcoming: [],
        now: fixedNow,
      });
      expect(resToday).toHaveLength(1);
      expect(resToday[0].id).toBe('daily-reminder');
      expect(resToday[0].repeatDaily).toBe(true);
      const expectedTodayTime = new Date(2026, 9, 17, 21, 0, 0).getTime();
      expect(resToday[0].timestamp).toBe(expectedTodayTime);

      // Si now es 2026-10-17 22:00:00 (después de las 21:00), se programa para mañana a las 21:00.
      const lateNow = new Date(2026, 9, 17, 22, 0, 0);
      const resTomorrow = planScheduled({
        settings,
        upcoming: [],
        now: lateNow,
      });
      expect(resTomorrow).toHaveLength(1);
      const expectedTomorrowTime = new Date(2026, 9, 18, 21, 0, 0).getTime();
      expect(resTomorrow[0].timestamp).toBe(expectedTomorrowTime);
    });
  });

  describe('planImmediate', () => {
    test('nada si enabled=false', () => {
      const settings = {
        ...baseSettings,
        'notifications.enabled': false,
      };
      const budgets = [
        {
          id: 'b-1',
          category_name: 'Comida',
          period: { start: '2026-10-12', end: '2026-10-19' },
          amount: 100000,
          spent: 85000,
          remaining: 15000,
          reachedThreshold: 80,
          exceeded: false,
        },
      ];
      const summary = {
        period: { start: '2026-10-12', end: '2026-10-19' },
        remaining: { base: 'income', remaining: 1500, baseAmount: 10000, estimated: false },
      };

      const result = planImmediate({ settings, budgets, summary });
      expect(result).toEqual([]);
    });

    test('umbral de presupuesto produce key con periodo y umbral', () => {
      const budgets = [
        {
          id: 'b-comida',
          category_name: 'Comida',
          period: { start: '2026-10-12', end: '2026-10-19' },
          amount: 100000,
          spent: 80000,
          remaining: 20000,
          reachedThreshold: 80,
          exceeded: false,
        },
      ];

      const result = planImmediate({
        settings: baseSettings,
        budgets,
        summary: null,
      });

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('budget:b-comida:2026-10-12:80');
      expect(result[0].title).toBe('Comida: 80% usado');
    });

    test('restante bajo con porcentaje configurable', () => {
      const summary = {
        period: { start: '2026-10-12', end: '2026-10-19' },
        remaining: {
          base: 'income',
          remaining: 1500, // 15% de 10000
          baseAmount: 10000,
          estimated: false,
        },
      };

      // Con límite de 20%, 15% <= 20% -> Debe generar aviso
      const settings20 = {
        ...baseSettings,
        'notifications.lowRemaining': true,
        'notifications.lowRemainingPercent': 20,
        'notifications.budget': false,
      };
      const res20 = planImmediate({
        settings: settings20,
        budgets: [],
        summary,
      });
      expect(res20).toHaveLength(1);
      expect(res20[0].key).toBe('low-remaining:2026-10-12:20');
      expect(res20[0].title).toBe('Te queda poco en este periodo');

      // Con límite configurado al 10%, 15% > 10% -> NO debe generar aviso
      const settings10 = {
        ...baseSettings,
        'notifications.lowRemaining': true,
        'notifications.lowRemainingPercent': 10,
        'notifications.budget': false,
      };
      const res10 = planImmediate({
        settings: settings10,
        budgets: [],
        summary,
      });
      expect(res10).toHaveLength(0);
    });
  });
});
