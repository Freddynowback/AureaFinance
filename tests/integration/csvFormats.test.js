import fs from 'fs';
import path from 'path';
import { openTestDb, categoryId, makeAccount } from '../../tests/helpers/testDb';
import { accountsRepository } from '../../database/repositories/accountsRepository';
import { buildPreview, commitImport, prepareImport } from '../../services/csv/importService';

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const formats = [
  {
    file: '01-saldos-mexico.csv',
    delimiter: ';',
    mapping: { date: 0, description: 1, debit: 2, credit: 3 },
    valid: 3,
    kinds: ['expense', 'income', 'expense'],
    amounts: [123456, 1200000, 25000],
    dates: ['2026-10-15 12:00:00', '2026-10-16 12:00:00', '2026-10-17 12:00:00'],
    balance: 1151544,
  },
  {
    file: '02-operaciones.csv',
    delimiter: ',',
    mapping: { date: 0, description: 1, amount: 3, reference: 2 },
    valid: 3,
    kinds: ['expense', 'income', 'expense'],
    amounts: [89990, 250000, 34575],
    dates: ['2026-10-18 12:00:00', '2026-10-19 12:00:00', '2026-10-20 12:00:00'],
    balance: 225435,
  },
  {
    file: '03-tarjeta.csv',
    delimiter: ',',
    mapping: { date: 0, description: 1, amount: 2 },
    valid: 4,
    kinds: ['expense', 'expense', 'refund', 'refund'],
    amounts: [78025, 124999, 100000, 12550],
    dates: ['2026-10-21 12:00:00', '2026-10-22 12:00:00', '2026-10-23 12:00:00', '2026-10-24 12:00:00'],
    balance: -90474,
    credit: true,
    amountSign: 'positiveIsExpense',
  },
  {
    file: '04-bom-crlf.csv',
    delimiter: ',',
    mapping: { date: 0, description: 1, amount: 2 },
    valid: 3,
    kinds: ['expense', 'income', 'expense'],
    amounts: [8550, 250000, 43210],
    dates: ['2026-10-25 12:00:00', '2026-10-26 12:00:00', '2026-10-27 12:00:00'],
    balance: 298240,
  },
  {
    file: '05-tab-meses.csv',
    delimiter: '\t',
    mapping: { date: 0, description: 1, amount: 2 },
    valid: 3,
    kinds: ['expense', 'income', 'expense'],
    amounts: [67540, 180000, 12000],
    dates: ['2026-10-17 12:00:00', '2026-10-18 12:00:00', '2026-10-19 12:00:00'],
    balance: 200460,
  },
];

describe('formatos sintéticos de exportación bancaria mexicana', () => {
  test.each(formats)('$file: detecta, mapea, importa y calcula saldo', async format => {
    const db = await openTestDb();
    try {
      const expense = await categoryId(db, 'Alimentación');
      const account = await makeAccount(db, {
        name: format.credit ? 'Tarjeta sintética' : 'Cuenta sintética',
        type: format.credit ? 'credit' : 'debit',
        openingAmount: format.credit ? 0 : 100000,
        credit_limit: format.credit ? 3000000 : undefined,
      });
      const prepared = prepareImport(fixture(format.file));
      expect(prepared.delimiter).toBe(format.delimiter);
      expect(prepared.mapping).toMatchObject(format.mapping);

      const preview = await buildPreview(db, prepared, {
        accountId: account.id,
        amountSign: format.amountSign,
        defaultCategories: { expense },
      });
      expect(preview.validCount).toBe(format.valid);
      expect(preview.errorCount).toBe(0);
      expect(preview.items.map(item => item.kind)).toEqual(format.kinds);
      expect(preview.items.map(item => item.amount)).toEqual(format.amounts);
      expect(preview.items.map(item => item.occurred_at)).toEqual(format.dates);
      expect(preview.items.every(item => item.selected)).toBe(true);

      const committed = await commitImport(db, {
        accountId: account.id,
        items: preview.items,
        fileName: format.file,
      });
      expect(committed.imported).toBe(format.valid);
      expect((await accountsRepository.get(db, account.id)).balance).toBe(format.balance);
    } finally {
      await db.close();
    }
  });

  test('06-prefacio-bancario.csv: omite las líneas del banco antes de la tabla', async () => {
    const db = await openTestDb();
    try {
      const food = await categoryId(db, 'Alimentación');
      const account = await makeAccount(db, { name: 'Cuenta con prefacio', openingAmount: 100000 });
      const prepared = prepareImport(fixture('06-prefacio-bancario.csv'));
      expect(prepared.delimiter).toBe(',');
      expect(prepared.skippedLines).toBe(2);
      expect(prepared.headers).toEqual(['Fecha', 'Descripción', 'Importe']);
      expect(prepared.mapping).toMatchObject({ date: 0, description: 1, amount: 2 });
      const preview = await buildPreview(db, prepared, { accountId: account.id, defaultCategories: { expense: food } });
      expect(preview.validCount).toBe(2);
      expect(preview.items.map(i => [i.kind, i.amount])).toEqual([['expense', 30000], ['income', 150000]]);
      await commitImport(db, { accountId: account.id, items: preview.items });
      expect((await accountsRepository.get(db, account.id)).balance).toBe(100000 - 30000 + 150000);
    } finally {
      await db.close();
    }
  });
});
