import { answerLocally, buildAggregateContext, QUICK_QUESTIONS } from '../../services/ai/insightsEngine';

describe('insightsEngine', () => {
  describe('answerLocally', () => {
    const questionIds = QUICK_QUESTIONS.map(q => q.id);

    // Contexto completo con datos válidos
    const fullContext = {
      summary: {
        period: { type: 'weekly', start: '2026-10-12', end: '2026-10-19' },
        segments: [
          { name: 'Alimentación', amount: 125000, percent: 55 },
          { name: 'Transporte', amount: 45000, percent: 20 },
          { name: 'Servicios', amount: 25000, percent: 11 },
        ],
      },
      comparison: {
        spending: 195000,
        previousSpending: 150000,
        growing: [
          { name: 'Alimentación', change: 25000, changePercent: 25 },
        ],
      },
      budgets: [
        { category_name: 'Alimentación', percent: 80, remaining: 25000 },
        { category_name: 'Transporte', percent: 110, remaining: -5000 },
      ],
      upcoming: [
        { type: 'recurring_expense', title: 'Internet', amount: 60000, date: '2026-10-22' },
        { type: 'card_due', title: 'Tarjeta Platino', amount: 450000, date: '2026-10-25' },
        { type: 'debt_due', title: 'Préstamo Personal', amount: 150000, date: '2026-10-28' },
      ],
      debtPlan: {
        name: 'Préstamo Personal',
        perPeriod: 50000,
        perLabel: 'cada semana',
        periods: 3,
        deadline: '2026-11-15',
        reserved: 100000,
      },
      cardPlan: {
        name: 'Tarjeta Platino',
        perPeriod: 150000,
        perLabel: 'cada quincena',
        periods: 2,
        deadline: '2026-10-31',
        reserved: 150000,
      },
    };

    // Contexto vacío (sin datos)
    const emptyContext = {
      summary: null,
      comparison: null,
      budgets: [],
      upcoming: [],
      debtPlan: null,
      cardPlan: null,
    };

    test.each(questionIds)('id "%s" genera respuesta con datos sin NaN ni undefined', (id) => {
      const response = answerLocally(id, fullContext);
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      expect(response).not.toMatch(/NaN/);
      expect(response).not.toMatch(/undefined/);
    });

    test.each(questionIds)('id "%s" genera respuesta sin datos sin NaN ni undefined', (id) => {
      const response = answerLocally(id, emptyContext);
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      expect(response).not.toMatch(/NaN/);
      expect(response).not.toMatch(/undefined/);
    });

    test('devuelve null para id desconocido', () => {
      const response = answerLocally('non_existent_id', fullContext);
      expect(response).toBeNull();
    });

    test('growing cuando ninguna categoría creció', () => {
      const ctx = {
        comparison: {
          spending: 100000,
          previousSpending: 120000,
          growing: [],
        },
      };
      const response = answerLocally('growing', ctx);
      expect(response).toContain('Ninguna categoría creció');
      expect(response).not.toMatch(/NaN/);
      expect(response).not.toMatch(/undefined/);
    });
  });

  describe('buildAggregateContext', () => {
    test('NO incluye descripciones, ids ni nombres de cuenta y redondea a pesos', () => {
      const sensitiveContext = {
        summary: {
          period: { type: 'monthly', start: '2026-10-01', end: '2026-11-01' },
          spent: 123456, // 1234.56 MXN -> redondeo a 1235 pesos
          income: 300080, // 3000.80 MXN -> redondeo a 3001 pesos
          remaining: {
            remaining: 176624, // 1766.24 MXN -> 1766 pesos
            base: 'income',
            estimated: false,
          },
          segments: [
            {
              id: 'cat-id-food',
              categoryId: 'cat-id-food',
              name: 'Comida',
              amount: 123456,
              percent: 100,
              description: 'Compra despensa en Walmart',
            },
          ],
        },
        comparison: {
          spending: 123456,
          previousSpending: 98765, // 987.65 MXN -> 988 pesos
        },
        budgets: [
          {
            id: 'budget-id-food',
            category_id: 'cat-id-food',
            category_name: 'Comida',
            amount: 200000, // 2000 pesos
            spent: 123456, // 1235 pesos
            account_name: 'Cuenta Nómina BBVA',
            account_id: 'acc-id-1',
          },
        ],
        upcoming: [
          {
            id: 'upcoming-id-net',
            type: 'recurring_expense',
            date: '2026-10-25',
            amount: 59900, // 599 pesos
            title: 'Internet Totalplay',
            description: 'Recibo mensual de internet fibra',
            account_name: 'Tarjeta Santander Débito',
            accountId: 'acc-id-2',
          },
        ],
      };

      const result = buildAggregateContext(sensitiveContext);

      // Verificación de redondeo a pesos (Math.round(centavos / 100))
      expect(result.gastoTotal).toBe(1235);
      expect(result.ingresos).toBe(3001);
      expect(result.restante).toEqual({ valor: 1766, base: 'income', estimado: false });
      expect(result.categorias).toEqual([{ nombre: 'Comida', gasto: 1235, pct: 100 }]);
      expect(result.cambioVsAnterior).toEqual({ actual: 1235, anterior: 988 });
      expect(result.presupuestos).toEqual([{ categoria: 'Comida', limite: 2000, usado: 1235 }]);
      expect(result.proximos).toEqual([{ tipo: 'recurring_expense', fecha: '2026-10-25', importe: 599 }]);

      // Verificación de que NO se exponen IDs, descripciones ni nombres de cuenta
      const json = JSON.stringify(result);

      // Palabras y valores sensibles que NO deben aparecer en el JSON resultante
      const sensitiveStrings = [
        'cat-id-food',
        'budget-id-food',
        'upcoming-id-net',
        'acc-id-1',
        'acc-id-2',
        'Compra despensa en Walmart',
        'Recibo mensual de internet fibra',
        'Cuenta Nómina BBVA',
        'Tarjeta Santander Débito',
      ];

      for (const str of sensitiveStrings) {
        expect(json).not.toContain(str);
      }

      // Validar recursivamente que no haya claves prohibidas como id, description, account
      function assertNoForbiddenKeys(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const [key, val] of Object.entries(obj)) {
          expect(key.toLowerCase()).not.toMatch(/id$|^id$|description|account/);
          assertNoForbiddenKeys(val);
        }
      }
      assertNoForbiddenKeys(result);
    });

    test('maneja contexto vacío sin errores', () => {
      const result = buildAggregateContext({});
      expect(result).toEqual({
        moneda: 'MXN',
        periodo: null,
        gastoTotal: null,
        ingresos: null,
        restante: null,
        categorias: [],
        cambioVsAnterior: null,
        presupuestos: [],
        proximos: [],
      });
    });
  });
});
