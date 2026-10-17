/**
 * Backend de referencia para el asistente de Aurea Finance (NO forma parte de
 * la app móvil). Despliégalo como función serverless o servidor propio.
 *
 * - La clave de Anthropic vive SOLO aquí (variable de entorno ANTHROPIC_API_KEY).
 * - La app envía { question, context, maxTokens } con totales agregados en
 *   pesos (sin movimientos individuales) y espera { answer }.
 * - Exige un token propio (AUREA_ACCESS_TOKEN) para que nadie más use tu cuota.
 *
 * Ejemplo con Node 20+ y el SDK oficial:  npm install @anthropic-ai/sdk
 * Revisa precios y modelos vigentes antes de desplegar.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createServer } from "node:http";

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno
const MODEL = "claude-haiku-5-5";
const ACCESS_TOKEN = process.env.AUREA_ACCESS_TOKEN;
const MAX_BODY = 16_000;

const SYSTEM = [
  "Eres un asistente de finanzas personales para una persona en México (MXN).",
  "Respondes en español, en 2-4 frases, claras y prácticas.",
  "Usa SOLO las cifras del contexto JSON que recibes; no inventes saldos, tasas,",
  "intereses, transacciones ni condiciones de crédito. Si faltan datos, dilo.",
  "No ejecutas pagos ni cambias datos: solo orientas. No afirmes que un plan es",
  "óptimo si desconoces intereses o comisiones.",
].join(" ");

async function answer(question: string, context: unknown, maxTokens: number): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: Math.min(Math.max(maxTokens || 300, 100), 800),
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Contexto financiero agregado (JSON):\n${JSON.stringify(context)}\n\nPregunta: ${question}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    return "No puedo responder a esa pregunta. Prueba a formularla de otra manera.";
  }
  const text = response.content
    .map(block => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  return text || "No obtuve una respuesta.";
}

createServer(async (req, res) => {
  const send = (status: number, body: object) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") return send(405, { error: "Método no permitido" });
  if (!ACCESS_TOKEN || req.headers.authorization !== `Bearer ${ACCESS_TOKEN}`) {
    return send(401, { error: "No autorizado" });
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) return send(413, { error: "Solicitud demasiado grande" });
  }
  try {
    const { question, context, maxTokens } = JSON.parse(raw);
    if (typeof question !== "string" || !question.trim()) return send(400, { error: "Falta la pregunta" });
    send(200, { answer: await answer(question.slice(0, 300), context, Number(maxTokens)) });
  } catch (error) {
    // No registres el contexto: contiene datos financieros.
    send(500, { error: "Error del asistente" });
  }
}).listen(Number(process.env.PORT || 8787));
