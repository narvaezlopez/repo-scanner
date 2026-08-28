# ws-repo-scanner

API del proyecto **Code Insight AI**. Express + TypeScript sobre Node 24, con
health check, canal WebSocket mínimo e integración con Claude vía la **API de
Anthropic**. La lógica de análisis (cola, persistencia) se añadirá en iteraciones
posteriores.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check para el target group del ALB |
| `GET` | `/api/v1/ping` | Prueba de vida de la API |
| `POST` | `/api/v1/llm/complete` | Llama al modelo. Body: `{ "prompt": string, "system"?: string, "maxTokens"?: number }` → `{ text, model, driver }` |
| `WS`  | `/ws` | Canal WebSocket (responde a `{"type":"ping"}`) |

## LLM

`src/llm/` llama a Claude vía la **API de Anthropic** (`@anthropic-ai/sdk`).
Necesita `ANTHROPIC_API_KEY` (de console.anthropic.com); en local va en `.env`,
en producción se inyecta desde AWS Secrets Manager. Sin key, el endpoint
responde `502` con un mensaje claro — no hay respuestas simuladas.

```bash
cp .env.example .env      # y pon tu ANTHROPIC_API_KEY
npm run dev
curl -s localhost:3000/api/v1/llm/complete \
  -H 'content-type: application/json' \
  -d '{"prompt":"En una frase, ¿qué es un package.json?"}'
```

## Desarrollo local

```bash
nvm use                 # Node 24.15.0
npm install
cp .env.example .env
npm run dev             # http://localhost:3000
```

Scripts: `build`, `start`, `typecheck`, `lint`, `test`.

## Docker

```bash
docker build -t ws-repo-scanner .
docker run --rm -p 3000:3000 ws-repo-scanner
curl localhost:3000/health
```

## Despliegue en AWS

La imagen se publica en ECR y corre en ECS Fargate detrás de un ALB.
Ver [`../infra-repo-scanner/README.md`](../infra-repo-scanner/README.md).
