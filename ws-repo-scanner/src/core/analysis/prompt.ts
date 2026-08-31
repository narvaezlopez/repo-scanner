import type { Manifest } from './read-manifests.js';
import type { RepoStructure } from './scan-structure.js';

// system prompt: pedimos solo el JSON de AnalysisResult (sin generatedAt/model, que los pone el código)
export const SYSTEM_PROMPT = `Eres un ingeniero de software senior que hace ingeniería inversa de repositorios.
A partir de los datos deterministas que te doy (estructura de ficheros y manifiestos ya parseados), infieres el propósito y la arquitectura del proyecto.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto alrededor, sin bloques markdown. En español. No inventes ficheros ni dependencias que no aparezcan en los datos.

Forma exacta:
{
  "functionalSummary": "2-4 frases: qué hace la aplicación y para quién",
  "technologies": [
    { "name": "Express", "category": "framework", "version": "^4", "evidence": "package.json dependencies" }
  ],
  "architecture": {
    "pattern": "hexagonal",
    "confidence": 0.0,
    "rationale": "por qué ese patrón",
    "evidence": ["señal 1", "señal 2"],
    "layers": ["capa1", "capa2"]
  },
  "findings": {
    "components": [
      { "name": "API HTTP", "path": "src/app.ts", "type": "api", "responsibility": "expone los endpoints" }
    ],
    "recommendations": [
      { "title": "…", "description": "…", "priority": "medium" }
    ],
    "risks": [
      { "title": "…", "description": "…", "severity": "high", "evidence": "fichero o zona" }
    ]
  }
}

Valores permitidos:
- technologies[].category: language | framework | runtime | library | database | infrastructure | tooling
- architecture.pattern: monolito | monolito-modular | mvc | n-capas | clean-architecture | hexagonal | microservicios | event-driven | serverless | desconocida
- architecture.confidence: número entre 0 y 1
- findings.components[].type: ui | api | service | worker | module | database | infrastructure | config | library
- priority / severity: high | medium | low

Sé conciso para no exceder el límite de tokens: máximo 8 tecnologías, 8 componentes,
5 recomendaciones y 5 riesgos; descripciones de 1-2 frases. Cierra bien el JSON.`;

export function buildUserPrompt(structure: RepoStructure, manifests: Manifest[]): string {
  const ext = structure.byExtension
    .map((e) => `${e.ext}:${e.count}`)
    .join(', ');

  const manifestBlock = manifests.length
    ? manifests
        .map((m) => `- ${m.path} (${m.kind}): ${JSON.stringify(m.facts)}`)
        .join('\n')
    : '(ninguno)';

  const filesBlock = structure.keyFileContents
    .map((f) => `### ${f.path}\n${f.content}`)
    .join('\n\n');

  return `ESTRUCTURA
- ficheros analizados: ${structure.fileCount}
- tamaño total: ${humanBytes(structure.totalBytes)}
- extensiones (fichero:conteo): ${ext}
- raíz del repo: ${structure.topLevelEntries.join(', ')}
- ficheros clave: ${structure.keyFiles.join(', ') || '(ninguno)'}

ÁRBOL DE CARPETAS (para inferir la arquitectura: capas, ports/adapters, módulos, servicios…)
${structure.directories.join('\n') || '(sin subcarpetas)'}

MANIFIESTOS PARSEADOS
${manifestBlock}

CONTENIDO DE FICHEROS CLAVE (truncado)
${filesBlock || '(no legible)'}`;
}

function humanBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(u ? 1 : 0)} ${units[u]}`;
}
