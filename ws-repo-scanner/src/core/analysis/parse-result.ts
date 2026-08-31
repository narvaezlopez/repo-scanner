import { z } from 'zod';
import type { AnalysisOverview, AnalysisResult } from '../domain/analysis-result.js';

// el LLM a veces manda null en vez de omitir el campo
const optionalString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);
const stringOr = (fallback: string) =>
  z
    .string()
    .nullish()
    .transform((v) => v ?? fallback);
const optionalStringArray = z
  .array(z.string())
  .nullish()
  .transform((v) => v ?? undefined);

const category = z
  .enum(['language', 'framework', 'runtime', 'library', 'database', 'infrastructure', 'tooling'])
  .catch('library');

const pattern = z
  .enum([
    'monolito',
    'monolito-modular',
    'mvc',
    'n-capas',
    'clean-architecture',
    'hexagonal',
    'microservicios',
    'event-driven',
    'serverless',
    'desconocida',
  ])
  .catch('desconocida');

const componentType = z
  .enum(['ui', 'api', 'service', 'worker', 'module', 'database', 'infrastructure', 'config', 'library'])
  .catch('module');

const severity = z.enum(['high', 'medium', 'low']).catch('medium');

// AnalysisResult sin generatedAt/model, que se añaden abajo
const llmSchema = z.object({
  functionalSummary: z.string().min(1),
  technologies: z
    .array(
      z.object({
        name: z.string(),
        category,
        version: optionalString,
        evidence: stringOr(''),
      }),
    )
    .default([]),
  architecture: z
    .object({
      pattern,
      confidence: z.coerce.number().min(0).max(1).catch(0.5),
      rationale: stringOr(''),
      evidence: z.array(z.string()).nullish().transform((v) => v ?? []),
      layers: optionalStringArray,
    })
    .default({ pattern: 'desconocida', confidence: 0, rationale: '', evidence: [] }),
  findings: z
    .object({
      components: z
        .array(
          z.object({
            name: z.string(),
            path: stringOr(''),
            type: componentType,
            responsibility: stringOr(''),
          }),
        )
        .default([]),
      recommendations: z
        .array(z.object({ title: z.string(), description: stringOr(''), priority: severity }))
        .default([]),
      risks: z
        .array(
          z.object({
            title: z.string(),
            description: stringOr(''),
            severity,
            evidence: optionalString,
          }),
        )
        .default([]),
    })
    .default({ components: [], recommendations: [], risks: [] }),
});

// saca el JSON de la respuesta del LLM, lo valida y le añade overview + metadatos.
// si no cuaja, lanza -> el job queda en 'error'
export function parseAnalysisResult(
  text: string,
  model: string,
  overview: AnalysisOverview,
): AnalysisResult {
  const json = extractJson(text);
  const parsed = llmSchema.parse(json);
  return { overview, ...parsed, generatedAt: new Date().toISOString(), model };
}

function extractJson(text: string): unknown {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = s.indexOf('{');
  if (start === -1) throw new Error('la respuesta del LLM no contiene un objeto JSON');
  s = s.slice(start);

  const end = s.lastIndexOf('}');
  const candidate = end === -1 ? s : s.slice(0, end + 1);

  try {
    return JSON.parse(stripTrailingCommas(candidate));
  } catch {
    // seguramente cortado por el límite de tokens: intentar cerrarlo
    const repaired = stripTrailingCommas(closeTruncated(s));
    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error('el LLM devolvió un JSON inválido o incompleto');
    }
  }
}

function stripTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, '$1');
}

// recorta el JSON al último elemento completo y cierra los { / [ que quedaron abiertos
function closeTruncated(s: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let cutAt = 0;
  let stackAtCut: string[] = [];

  const mark = (index: number): void => {
    cutAt = index;
    stackAtCut = [...stack];
  };

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      stack.pop();
      mark(i + 1);
    } else if (c === ',') {
      mark(i); // hasta antes de la coma: el elemento anterior está completo
    }
  }

  let out = s.slice(0, cutAt).replace(/,\s*$/, '').trimEnd();
  for (let i = stackAtCut.length - 1; i >= 0; i -= 1) out += stackAtCut[i];
  return out;
}
