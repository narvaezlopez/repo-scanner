# Code Insight AI — Ingeniería Inversa Automatizada de Repositorios

Monorepo de la kata Senior Fullstack/Cloud. La aplicación permite cargar un
repositorio de código fuente, analizar su estructura, identificar componentes
clave e **inferir automáticamente** su propósito funcional y su arquitectura,
presentando el resultado en una interfaz web.

## Estructura del monorepo

| Carpeta | Qué es | Stack |
|---|---|---|
| [`web-ui-repo-scanner/`](web-ui-repo-scanner/) | Interfaz web (SPA) | Angular |
| [`ws-repo-scanner/`](ws-repo-scanner/) | API + worker de análisis | Node.js + Express + TypeScript + WebSocket |
| [`infra-repo-scanner/`](infra-repo-scanner/) | Infraestructura como código para AWS | Terraform |

## Arquitectura (objetivo)

> **Estado actual:** esqueleto desplegable. Implementado el camino
> SPA → ALB → ECS Fargate (API con `/health` y WebSocket) y SPA → CloudFront → S3.
> Cola SQS, persistencia DynamoDB y LLM (Bedrock) son de la siguiente iteración.


```
                    ┌──────────────────────────┐
   navegador  ─────►│  CloudFront + S3 (SPA)    │
                    └──────────────────────────┘
        │ REST (crear job) + WebSocket (progreso)
        ▼
   ┌─────────────────────────────┐        ┌──────────────────┐
   │  ALB → ECS Fargate (API)    │───────►│  SQS  (cola job) │
   └─────────────────────────────┘        └────────┬─────────┘
        │ estado/resultado                          │
        ▼                                           ▼
   ┌────────────┐  ┌──────────┐        ┌────────────────────────────┐
   │ DynamoDB   │  │ S3 repos │◄───────│  ECS Fargate (worker)      │
   │ (jobs)     │  │ /reports │        │  clona → heurística → LLM  │
   └────────────┘  └──────────┘        └─────────────┬──────────────┘
                                                     ▼
                                        ┌────────────────────────┐
                                        │  Amazon Bedrock (LLM)  │
                                        └────────────────────────┘
```

Decisiones clave:

- **Análisis asíncrono con estado de job**: clonar + N llamadas al LLM no cabe en
  un request síncrono. La API encola y responde `202`; el frontend sigue el
  progreso por WebSocket.
- **Heurística determinista antes que LLM**: se parsean manifiestos
  (`package.json`, `pom.xml`, `requirements.txt`, `go.mod`, `Dockerfile`, `*.tf`…)
  para abaratar tokens y dar señal fiable. El LLM sólo redacta la descripción
  funcional e infiere la arquitectura.
- **Salida estructurada del LLM** (JSON schema) para render consistente en la UI.
- **Nunca se ejecuta el código analizado**: el worker sólo lee ficheros.

## Desarrollo local

Requisitos: Node `24.15.0` (ver [`.nvmrc`](.nvmrc)), Docker, Terraform ≥ 1.9.

Opción 1 — con Docker (espejo del despliegue):

```bash
nvm use                      # Node 24.15.0
docker compose up --build    # API en :3000, SPA (nginx) en :8088
```

Opción 2 — modo dev:

- Frontend: `cd web-ui-repo-scanner && npm start` → http://localhost:4200
- Backend:  `cd ws-repo-scanner && npm run dev` → http://localhost:3000

## Despliegue

Ver [`infra-repo-scanner/README.md`](infra-repo-scanner/README.md).
