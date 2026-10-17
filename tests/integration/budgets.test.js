import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../../services/transactions/transactionService';
import {
  createBudget,
  budgetStatus,
  previewBudgetImpact,
  budgetHistory,
} from '../../services/budgets/budgetService';
import { ValidationError } from '../../utils/errors';

describe('budgets integration', () => {
  const periodSettings = {
    type: 'weekly',
    weekStartDay: 1,
    biweeklyMode: 'calendar',
    monthStartDay: 1,
  };

  let db;
  let account;
  let catFood;
  let catTransport;

  beforeEach(async () => {
    db = await openTestDb();
    account = await makeAccount(db);
    catFood = await categoryId(db, 'Alimentación');
    catTransport = await categoryId(db, 'Transporte');
  });

  test('consumo = gastos - devoluciones', async () => {
    const budget = await createBudget(db, {
      category_id: catFood,
      period_type: 'weekly',
      amount: 100000, // $1,000.00
    });

    // Gasto de $400.00 el miércoles 14 de octubre de 2026
    const exp = await createTransaction(db, {
      kind: 'expense',
      amount: 40000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-14 12:00:00',
    });

    // Devolución de $100.00 el jueves 15 de octubre de 2026
    await createTransaction(db, {
      kind: 'refund',
      amount: 10000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      related_transaction_id: exp.id,
      occurred_at: '2026-10-15 12:00:00',
    });

    const status = await budgetStatus(db, budget, periodSettings, '2026-10-14');
    expect(status.spent).toBe(30000); // 40000 - 10000 = 30000 ($300.00)
    expect(status.remaining).toBe(70000); // 100000 - 30000 = 70000 ($700.00)
    expect(status.percent).toBe(30);
    expect(status.exceeded).toBe(false);

    // Verificamos también en presupuesto general (category_id = null)
    const generalBudget = await createBudget(db, {
      category_id: null,
      period_type: 'weekly',
      amount: 200000,
    });
    const generalStatus = await budgetStatus(db, generalBudget, periodSettings, '2026-10-14');
    expect(generalStatus.spent).toBe(30000);
    expect(generalStatus.remaining).toBe(170000);
  });

  test('un gasto editado/eliminado actualiza el consumo', async () => {
    const budget = await createBudget(db, {
      category_id: catFood,
      period_type: 'weekly',
      amount: 100000,
    });

    const exp1 = await createTransaction(db, {
      kind: 'expense',
      amount: 40000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-14 12:00:00',
    });

    let status = await budgetStatus(db, budget, periodSettings, '2026-10-14');
    expect(status.spent).toBe(40000);

    // Editamos exp1 incrementando el importe a $600.00
    await updateTransaction(db, exp1.id, { amount: 60000 });
    status = await budgetStatus(db, budget, periodSettings, '2026-10-14');
    expect(status.spent).toBe(60000);

    // Creamos un segundo gasto de $250.00
    const exp2 = await createTransaction(db, {
      kind: 'expense',
      amount: 25000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-15 12:00:00',
    });

    status = await budgetStatus(db, budget, periodSettings, '2026-10-14');
    expect(status.spent).toBe(85000);

    // Eliminamos exp2
    await deleteTransaction(db, exp2.id);
    status = await budgetStatus(db, budget, periodSettings, '2026-10-14');
    expect(status.spent).toBe(60000);
  });

  test('umbrales 50/80/100 configurables', async () => {
    // 1. Presupuesto con umbrales por defecto (50, 80, 100)
    const budgetDefault = await createBudget(db, {
      category_id: catFood,
      period_type: 'weekly',
      amount: 100000,
    });

    // 40% consumido: ningún umbral alcanzado
    const exp = await createTransaction(db, {
      kind: 'expense',
      amount: 40000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-14 12:00:00',
    });
    let status = await budgetStatus(db, budgetDefault, periodSettings, '2026-10-14');
    expect(status.reachedThreshold).toBeNull();

    // Actualizamos a 50%: umbral 50 alcanzado
    await updateTransaction(db, exp.id, { amount: 50000 });
    status = await budgetStatus(db, budgetDefault, periodSettings, '2026-10-14');
    expect(status.reachedThreshold).toBe(50);

    // Actualizamos a 85%: umbral 80 alcanzado
    await updateTransaction(db, exp.id, { amount: 85000 });
    status = await budgetStatus(db, budgetDefault, periodSettings, '2026-10-14');
    expect(status.reachedThreshold).toBe(80);

    // Actualizamos a 100%: umbral 100 alcanzado
    await updateTransaction(db, exp.id, { amount: 100000 });
    status = await budgetStatus(db, budgetDefault, periodSettings, '2026-10-14');
    expect(status.reachedThreshold).toBe(100);

    // 2. Presupuesto con umbrales personalizados configurables ('30,70')
    const budgetCustom = await createBudget(db, {
      category_id: catTransport,
      period_type: 'weekly',
      amount: 100000,
      thresholds: '30,70',
    });

    const expCustom = await createTransaction(db, {
      kind: 'expense',
      amount: 25000, // 25%
      account_id: account.id,
      category_id: catTransport,
      payment_method: 'debit',
      occurred_at: '2026-10-14 12:00:00',
    });
    let statusCustom = await budgetStatus(db, budgetCustom, periodSettings, '2026-10-14');
    expect(statusCustom.reachedThreshold).toBeNull();

    // 35% -> umbral 30 alcanzado
    await updateTransaction(db, expCustom.id, { amount: 35000 });
    statusCustom = await budgetStatus(db, budgetCustom, periodSettings, '2026-10-14');
    expect(statusCustom.reachedThreshold).toBe(30);

    // 75% -> umbral 70 alcanzado
    await updateTransaction(db, expCustom.id, { amount: 75000 });
    statusCustom = await budgetStatus(db, budgetCustom, periodSettings, '2026-10-14');
    expect(statusCustom.reachedThreshold).toBe(70);
  });

  test('exceeded no bloquea guardar gastos', async () => {
    const budget = await createBudget(db, {
      category_id: catFood,
      period_type: 'weekly',
      amount: 50000, // $500.00
    });

    // Gasto que excede el presupuesto ($600.00 > $500.00)
    await createTransaction(db, {
      kind: 'expense',
      amount: 60000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-14 12:00:00',
    });

    let status = await budgetStatus(db, budget, periodSettings, '2026-10-14');
    expect(status.exceeded).toBe(true);
    expect(status.remaining).toBe(-10000);

    // Guardar otro gasto posterior en la misma categoría NO se bloquea y se guarda exitosamente
    const extraExp = await createTransaction(db, {
      kind: 'expense',
      amount: 30000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-15 12:00:00',
    });
    expect(extraExp.id).toBeDefined();

    status = await budgetStatus(db, budget, periodSettings, '2026-10-14');
    expect(status.spent).toBe(90000);
    expect(status.exceeded).toBe(true);
    expect(status.remaining).toBe(-40000);
  });

  test('previewBudgetImpact avisa sin impedir', async () => {
    const budget = await createBudget(db, {
      category_id: catFood,
      period_type: 'weekly',
      amount: 50000,
    });

    // Gasto previo de $400.00
    await createTransaction(db, {
      kind: 'expense',
      amount: 40000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-14 12:00:00',
    });

    // Preview de un nuevo gasto de $200.00 que superaría el límite de $500.00
    const warnings = await previewBudgetImpact(
      db,
      {
        categoryId: catFood,
        amount: 20000,
        occurredAt: '2026-10-14 15:00:00',
      },
      periodSettings,
    );

    // Avisa con los detalles del impacto
    expect(warnings).toHaveLength(1);
    expect(warnings[0].budget.id).toBe(budget.id);
    expect(warnings[0].after).toBe(60000);
    expect(warnings[0].over).toBe(10000);

    // Sin impedir: el gasto se puede guardar de todas formas
    const tx = await createTransaction(db, {
      kind: 'expense',
      amount: 20000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-14 15:00:00',
    });
    expect(tx.id).toBeDefined();
  });

  test('presupuestos duplicados (misma categoría y periodo) se rechazan', async () => {
    // 1. Duplicado por categoría y periodo
    await createBudget(db, {
      category_id: catFood,
      period_type: 'weekly',
      amount: 50000,
    });

    await expect(
      createBudget(db, {
        category_id: catFood,
        period_type: 'weekly',
        amount: 80000,
      }),
    ).rejects.toThrow(ValidationError);

    // 2. Duplicado de presupuesto general (category_id = null) para el mismo periodo
    await createBudget(db, {
      category_id: null,
      period_type: 'weekly',
      amount: 200000,
    });

    await expect(
      createBudget(db, {
        category_id: null,
        period_type: 'weekly',
        amount: 300000,
      }),
    ).rejects.toThrow(ValidationError);
  });

  test('budgetHistory devuelve N periodos', async () => {
    const budget = await createBudget(db, {
      category_id: catFood,
      period_type: 'weekly',
      amount: 100000,
    });

    // Semana actual: 2026-10-12 a 2026-10-19
    await createTransaction(db, {
      kind: 'expense',
      amount: 40000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-14 12:00:00',
    });

    // Semana previa: 2026-10-05 a 2026-10-12
    await createTransaction(db, {
      kind: 'expense',
      amount: 80000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-10-07 12:00:00',
    });

    // 2 semanas antes: 2026-09-28 a 2026-10-05
    await createTransaction(db, {
      kind: 'expense',
      amount: 120000,
      account_id: account.id,
      category_id: catFood,
      payment_method: 'debit',
      occurred_at: '2026-09-30 12:00:00',
    });

    // Pedimos historial de 4 periodos
    const history = await budgetHistory(db, budget, periodSettings, 4, '2026-10-14');

    expect(history).toHaveLength(4);

    // Verificamos orden cronológico (de más antiguo a más reciente)
    for (let i = 0; i < history.length - 1; i++) {
      expect(history[i].period.start < history[i + 1].period.start).toBe(true);
    }

    // Comprobamos los consumos de cada periodo en el historial
    // history[3] es la semana actual (2026-10-12)
    expect(history[3].spent).toBe(40000);
    expect(history[3].percent).toBe(40);
    expect(history[3].exceeded).toBe(false);

    // history[2] es la semana anterior (2026-10-05)
    expect(history[2].spent).toBe(80000);
    expect(history[2].percent).toBe(80);
    expect(history[2].exceeded).toBe(false);

    // history[1] es 2 semanas antes (2026-09-28)
    expect(history[1].spent).toBe(120000);
    expect(history[1].percent).toBe(120);
    expect(history[1].exceeded).toBe(true);

    // history[0] es 3 semanas antes (sin gastos registrados)
    expect(history[0].spent).toBe(0);
    expect(history[0].percent).toBe(0);
    expect(history[0].exceeded).toBe(false);
  });
});
