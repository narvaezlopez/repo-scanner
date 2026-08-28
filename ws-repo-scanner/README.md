# ws-repo-scanner

API del proyecto **Code Insight AI**. De momento es un esqueleto desplegable:
Express + TypeScript sobre Node 24, con un endpoint de salud y un canal
WebSocket mínimo. La lógica de análisis (cola, persistencia, LLM) se añadirá
en iteraciones posteriores.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check para el target group del ALB |
| `GET` | `/api/v1/ping` | Prueba de vida de la API |
| `WS`  | `/ws` | Canal WebSocket (responde a `{"type":"ping"}`) |

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
