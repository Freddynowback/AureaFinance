/**
 * Asistente financiero opcional.
 *
 * - Desactivado por defecto. Las funciones principales no dependen de él.
 * - La app NUNCA contiene una clave de Anthropic: habla con un backend propio
 *   (función serverless) configurado en Ajustes (`ai.endpoint`), que es quien
 *   llama a la API con su clave. Ver docs/INTEGRACIONES.md.
 * - Solo bajo demanda, con un límite mensual de solicitudes y agregados
 *   mínimos (sin movimientos individuales).
 * - Modelo previsto en el backend: claude-haiku-5-5 (Claude Haiku 5.5),
 *   0.10 / 0.50 USD por millón de tokens de entrada / salida (referencia
 *   oficial consultada el 2026-10-17).
 * - Los importes los calcula la app; la IA solo redacta y no ejecuta acciones.
 */
import { getSettings, setSettings } from '../settings/settingsService';
import { buildAggregateContext } from './insightsEngine';

export const ASSISTANT_MODEL = 'claude-haiku-5-5';

export async function assistantStatus(db, now = new Date()) {
  const s = await getSettings(db);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const used = s['ai.requestsMonth'] === month ? Number(s['ai.requestsThisMonth'] || 0) : 0;
  const limit = Number(s['ai.monthlyRequestLimit'] || 0);
  const endpoint = (s['ai.endpoint'] || '').trim();
  return {
    enabled: !!s['ai.enabled'],
    configured: /^https:\/\//.test(endpoint),
    endpoint,
    used,
    limit,
    month,
    nearLimit: limit > 0 && used >= Math.ceil(limit * 0.8),
    exhausted: limit > 0 && used >= limit,
    maxTokens: Number(s['ai.maxResponseTokens'] || 300),
    accessToken: s['ai.accessToken'] || '',
  };
}

/**
 * Envía una pregunta al backend. Lanza errores claros si está desactivado,
 * sin configurar o sin cupo; nunca simula una respuesta.
 */
export async function askAssistant(db, question, ctx, { fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const st = await assistantStatus(db, now);
  if (!st.enabled) throw new Error('El asistente está desactivado. Actívalo en Ajustes.');
  if (!st.configured) throw new Error('Falta configurar el servidor del asistente (URL https).');
  if (st.exhausted) throw new Error(`Alcanzaste el límite de ${st.limit} consultas este mes.`);
  const q = String(question || '').trim().slice(0, 300);
  if (!q) throw new Error('Escribe una pregunta.');
  // Se cuenta antes de enviar: una solicitud fallida también puede costar.
  await setSettings(db, { 'ai.requestsMonth': st.month, 'ai.requestsThisMonth': st.used + 1 });
  const res = await fetchImpl(st.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Token de TU servidor (no es una clave de Anthropic).
      ...(st.accessToken ? { Authorization: `Bearer ${st.accessToken}` } : {}),
    },
    body: JSON.stringify({ question: q, context: buildAggregateContext(ctx), maxTokens: st.maxTokens, model: ASSISTANT_MODEL }),
  });
  if (!res.ok) throw new Error(`El servidor del asistente respondió ${res.status}`);
  const data = await res.json();
  if (!data || typeof data.answer !== 'string') throw new Error('Respuesta del asistente no válida');
  return { answer: data.answer.slice(0, 2000), remaining: st.limit ? st.limit - st.used - 1 : null };
}
