import { openTestDb } from '../helpers/testDb';
import { askAssistant, assistantStatus } from '../../services/ai/assistantService';
import { setSettings } from '../../services/settings/settingsService';

const ctx = {
  summary: {
    period: { type: 'weekly', start: '2026-10-12', end: '2026-10-19' },
    spent: 43000, income: 140000, remaining: { remaining: 97000, base: 'income', estimated: false },
    segments: [{ name: 'Alimentación', amount: 18000, percent: 42, categoryId: 'secret-id' }],
  },
  budgets: [], upcoming: [],
};

let db;
beforeEach(async () => { db = await openTestDb(); });
afterEach(() => db.close());

test('desactivado por defecto: no hace ninguna llamada de red', async () => {
  const fetchImpl = jest.fn();
  await expect(askAssistant(db, '¿En qué gasté más?', ctx, { fetchImpl })).rejects.toThrow(/desactivado/);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('exige URL https', async () => {
  await setSettings(db, { 'ai.enabled': true, 'ai.endpoint': 'http://inseguro.example' });
  const fetchImpl = jest.fn();
  await expect(askAssistant(db, 'hola', ctx, { fetchImpl })).rejects.toThrow(/https/);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('envía solo agregados, token propio y respeta el límite mensual', async () => {
  await setSettings(db, { 'ai.enabled': true, 'ai.endpoint': 'https://srv.example/a', 'ai.monthlyRequestLimit': 2, 'ai.accessToken': 'tok' });
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ answer: 'Gastaste más en Alimentación.' }) }));
  const now = new Date(2026, 9, 17);
  const r = await askAssistant(db, '¿En qué gasté más?', ctx, { fetchImpl, now });
  expect(r.answer).toMatch(/Alimentación/);
  const [, init] = fetchImpl.mock.calls[0];
  expect(init.headers.Authorization).toBe('Bearer tok');
  const body = JSON.parse(init.body);
  expect(body.model).toBe('claude-haiku-5-5');
  expect(JSON.stringify(body)).not.toContain('secret-id');
  expect(body.context.gastoTotal).toBe(430); // pesos, no centavos
  await askAssistant(db, 'otra', ctx, { fetchImpl, now });
  await expect(askAssistant(db, 'tercera', ctx, { fetchImpl, now })).rejects.toThrow(/límite/);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect((await assistantStatus(db, now)).exhausted).toBe(true);
  // Mes nuevo: el contador se reinicia.
  expect((await assistantStatus(db, new Date(2026, 10, 1))).used).toBe(0);
});

test('respuesta inválida del servidor no se presenta como respuesta', async () => {
  await setSettings(db, { 'ai.enabled': true, 'ai.endpoint': 'https://srv.example/a' });
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 502 }));
  await expect(askAssistant(db, 'hola', ctx, { fetchImpl })).rejects.toThrow(/502/);
});
