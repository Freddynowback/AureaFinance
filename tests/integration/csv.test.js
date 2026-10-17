import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { prepareImport, buildPreview, commitImport, undoImport } from '../../services/csv/importService';
import { transactionsToCSV, exportTransactionsCSV } from '../../services/csv/exportService';
import { parseCSV, detectDelimiter } from '../../services/csv/csvParser';
import { createTransaction } from '../../services/transactions/transactionService';

let db;
let account;
let food;
beforeEach(async () => {
  db = await openTestDb();
  account = await makeAccount(db, { openingAmount: 100000 });
  food = await categoryId(db, 'Alimentación');
});
afterEach(() => db.close());

const count = async () => (await db.get('SELECT COUNT(*) AS n FROM transactions')).n;

describe('parser', () => {
  test('detecta punto y coma, comillas, BOM y CRLF', () => {
    const text = '﻿Fecha;Concepto;Importe\r\n17/10/2026;"Tacos; ""El Güero""";-120,50\r\n';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseCSV(text)).toEqual([
      ['Fecha', 'Concepto', 'Importe'],
      ['17/10/2026', 'Tacos; "El Güero"', '-120,50'],
    ]);
  });
  test('comillas sin cerrar es error, no corrupción', () => {
    expect(() => prepareImport('Fecha,Importe\n"17/10/2026,10')).toThrow();
  });
});

describe('15: detección de duplicados', () => {
  const csv = [
    'Fecha,Descripción,Cargo,Abono,Referencia',
    '15/10/2026,OXXO,"$1,250.00",,A1',
    '15/10/2026,OXXO,"$1,250.00",,A2',
    '16/10/2026,Nómina,,"12,000.00",B1',
  ].join('\n');

  test('mapea cargo/abono, marca duplicados dentro del archivo y contra la BD sin descartarlos', async () => {
    const prepared = prepareImport(csv);
    expect(prepared.hasHeader).toBe(true);
    expect(prepared.mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, reference: 4 });
    const preview = await buildPreview(db, prepared, { accountId: account.id, defaultCategories: { expense: food } });
    expect(preview.items.map(i => [i.kind, i.amount])).toEqual([
      ['expense', 125000],
      ['expense', 125000],
      ['income', 1200000],
    ]);
    // La segunda fila idéntica es un posible duplicado, pero sigue disponible.
    expect(preview.items[1].duplicates[0].strength).toBe('possible');
    expect(preview.items[1].selected).toBe(true);

    await commitImport(db, { accountId: account.id, items: preview.items, fileName: 'a.csv' });
    expect(await count()).toBe(3);

    const again = await buildPreview(db, prepareImport(csv), { accountId: account.id, defaultCategories: { expense: food } });
    expect(again.items.every(i => i.duplicates.some(d => d.strength === 'strong'))).toBe(true);
    expect(again.items.every(i => !i.selected)).toBe(true);
  });

  test('deshacer una importación elimina solo ese lote', async () => {
    await createTransaction(db, { kind: 'expense', amount: 500, account_id: account.id, category_id: food, occurred_at: '2026-10-01 10:00:00' });
    const preview = await buildPreview(db, prepareImport(csv), { accountId: account.id, defaultCategories: { expense: food } });
    const { batchId } = await commitImport(db, { accountId: account.id, items: preview.items });
    expect(await count()).toBe(4);
    await undoImport(db, batchId);
    expect(await count()).toBe(1);
  });
});

describe('16: formatos inválidos', () => {
  test('filas inválidas se reportan y no se importan', async () => {
    const csv = 'fecha,importe,concepto\n32/13/2026,-10,mal\n17/10/2026,abc,mal\n17/10/2026,-99.90,bien\n';
    const preview = await buildPreview(db, prepareImport(csv), { accountId: account.id, defaultCategories: { expense: food } });
    expect(preview.errorCount).toBe(2);
    expect(preview.items[0].errors[0]).toMatch(/Fecha/);
    expect(preview.items[1].errors[0]).toMatch(/Importe/);
    await commitImport(db, { accountId: account.id, items: preview.items });
    expect(await count()).toBe(1);
  });

  test('un fallo al confirmar revierte toda la importación', async () => {
    const csv = 'fecha,importe,concepto\n17/10/2026,-10,a\n17/10/2026,-20,b\n';
    const preview = await buildPreview(db, prepareImport(csv), { accountId: account.id, defaultCategories: { expense: food } });
    preview.items[1].category_id = 'no-existe';
    await expect(commitImport(db, { accountId: account.id, items: preview.items })).rejects.toThrow(/Fila 2/);
    expect(await count()).toBe(0);
    expect((await db.get('SELECT COUNT(*) AS n FROM import_batches')).n).toBe(0);
  });

  test('archivo vacío o de una sola columna', () => {
    expect(() => prepareImport('')).toThrow();
    expect(() => prepareImport('solo\nuna\ncolumna')).toThrow(/columnas/);
  });
});

describe('exportación', () => {
  test('CSV con BOM, escapado y protección contra fórmulas', async () => {
    await createTransaction(db, {
      kind: 'expense', amount: 123456, account_id: account.id, category_id: food,
      description: '=HYPERLINK("x"), "comillas"', occurred_at: '2026-10-17 09:30:00',
    });
    const { csv, count: n } = await exportTransactionsCSV(db);
    expect(n).toBe(1);
    expect(csv.startsWith('﻿id,fecha,tipo,importe')).toBe(true);
    expect(csv).toContain(',1234.56,MXN,');
    expect(csv).toContain(`"'=HYPERLINK(""x""), ""comillas"""`);
    // El CSV exportado se puede volver a leer.
    const rows = parseCSV(csv.slice(1));
    expect(rows[1][9]).toBe(`'=HYPERLINK("x"), "comillas"`);
  });
  test('transactionsToCSV sin filas solo trae encabezado', () => {
    expect(transactionsToCSV([]).trim().split('\r\n')).toHaveLength(1);
  });
});
