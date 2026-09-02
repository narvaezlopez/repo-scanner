# ws-repo-scanner

API de **Code Insight AI**. Express + TypeScript sobre Node 24, arquitectura
hexagonal (`core/` = dominio y casos de uso, aislado de `adapters/` = HTTP,
Postgres/TypeORM, Firebase, Git/Zip, Anthropic).

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check para el target group del ALB |
| `POST` | `/api/v1/jobs` | Crea un job de análisis. Body: `.zip` (campo `repo`, multipart) **o** JSON `{ "gitUrl": "https://github.com/..." }`. → `202 { jobId }` de inmediato; el análisis corre en background. Protegido por `requireAuth`. |
| `GET` | `/api/v1/jobs/:id` | Estado/resultado del job (fallback si el WebSocket se cae). Protegido por `requireAuth`. |
| `POST` | `/api/v1/llm/complete` | Llamada directa al modelo, sin pasar por el pipeline de análisis. Body: `{ "prompt": string, "system"?: string, "maxTokens"?: number }` → `{ text, model }`. **Sin auth** — pensado para debug/pruebas rápidas, no para el flujo de producto. |
| `WS` | `/ws` | Canal de progreso en tiempo real (ver protocolo abajo). |

`AUTH_ENABLED=false` (default) hace que `requireAuth` sea opcional — deja
pasar sin token, útil para correr local sin configurar Firebase. Con
`AUTH_ENABLED=true`, un `Authorization: Bearer <token>` inválido o ausente
responde `401`.

## El pipeline de análisis

`AnalyzeRepoUseCase` orquesta, siempre en background respecto al request HTTP
que creó el job (nunca lanza — cualquier fallo se guarda como `status: error`
en el job en vez de tumbar el proceso):

1. **Materializar** el origen (`ZipSourceAdapter` descomprime el buffer subido;
   `GitSourceAdapter` descarga el repo de GitHub como zip vía
   `codeload.github.com`, sin necesitar `git` instalado) a una carpeta temporal.
2. **Escanear estructura** (`scan-structure.ts`): árbol, conteo de archivos por
   extensión, y detección de "ficheros clave" por nombre (manifiestos, config,
   README) — se leen los primeros 12.
3. **Leer manifiestos** (`read-manifests.ts`), con un parser dedicado por
   ecosistema: `npm` (`package.json`), `python` (`requirements.txt` /
   `pyproject.toml`), `maven` (`pom.xml`), `gradle`, `go` (`go.mod`), `cargo`
   (`Cargo.toml`), `dotnet` (`.csproj`), `docker` (`Dockerfile`), `compose`
   (`docker-compose.yml`), `terraform` (`*.tf`).
4. **Construir el overview** (nombre, lenguaje y framework principal, nº de
   archivos) a partir de lo anterior — sin LLM todavía.
5. **Llamar a Claude en streaming** (`messages.stream`) con el contexto ya
   armado; el progreso emitido durante esta fase viene del streaming real (más
   un heartbeat de respaldo si el modelo tarda en responder).
6. **Validar y reparar el JSON** de salida contra un esquema `zod` — si Claude
   cortó la respuesta por el límite de tokens, se recupera lo parseable en vez
   de descartar todo.
7. Guardar el resultado (estado `done`, `progress: 100`) y limpiar la carpeta
   temporal.

Cada fase actualiza el job en la base y emite un evento de progreso (bus en
memoria → `/ws`). Progreso aproximado por fase: extracción 5%, estructura 15%,
manifiestos 25%, inicio del LLM 30%, y de ahí sube de forma continua hasta 95%
mientras llega el streaming, saltando a 100% al terminar.

## WebSocket (`/ws`)

Protocolo simple, cliente → servidor:

```json
{ "type": "subscribe", "jobId": "...", "token": "<firebase ID token o vacío>" }
```

Servidor → cliente (uno o más, según el estado del job):

```json
{ "type": "snapshot", "jobId": "...", "job": { ... } }
{ "type": "progress", "jobId": "...", "step": "llm", "progress": 62, "message": "..." }
{ "type": "done", "jobId": "...", "result": { ... } }
{ "type": "error", "jobId": "...", "message": "..." }
```

Si `AUTH_ENABLED=true`, el `subscribe` sin un `token` válido cierra el socket
con código `4401`.

## Autenticación (Firebase)

`firebase-admin` verifica el ID token que llega en `Authorization: Bearer` (o
en el `subscribe` del WS). La verificación es **local** (claves públicas de
Google cacheadas), no una llamada a Firebase por request. La primera vez que
un `uid` se ve, se crea el usuario en Postgres (JIT); las siguientes, se
reutiliza.

```bash
FIREBASE_SERVICE_ACCOUNT_FILE=./firebase-service-account.json   # local, JSON descargado de la consola
FIREBASE_SERVICE_ACCOUNT='{"project_id":...}'                    # producción, inyectado desde Secrets Manager
AUTH_ENABLED=true                                                 # exige el token en /api/v1/jobs y /ws
```

Sin ninguna de las dos variables de Firebase, la app arranca igual — la auth
queda deshabilitada salvo que `AUTH_ENABLED=true` (en ese caso falla al
arrancar con un mensaje explícito).

## LLM

`src/llm/` llama a Claude vía la **API de Anthropic** (`@anthropic-ai/sdk`),
en streaming. Necesita `ANTHROPIC_API_KEY` (de console.anthropic.com); en
local va en `.env`, en producción se inyecta desde AWS Secrets Manager.

```bash
cp .env.example .env      # y pon tu ANTHROPIC_API_KEY
npm run dev
curl -s localhost:3000/api/v1/llm/complete \
  -H 'content-type: application/json' \
  -d '{"prompt":"En una frase, ¿qué es un package.json?"}'
```

## Base de datos

Con `DB_HOST` definida se usa Postgres (`DB_HOST`/`DB_PORT`/`DB_USER`/
`DB_PASSWORD`/`DB_NAME`, esquema `DB_SCHEMA`, por defecto `sch_repo_scanner`);
sin ella, un `JobStore` en memoria (no persiste, útil para probar rápido).

El proyecto **no crea ni modifica el esquema**: solo se conecta. Tablas:
`jobs` (estado del análisis, resultado en `jsonb`) y `users` (`firebase_uid`
único, `email`). Cárgalo una vez antes de arrancar:

```bash
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f db/schema.sql   # o pégalo en Adminer
```

## Desarrollo local

```bash
nvm use                 # Node 24.15.0
npm install
cp .env.example .env
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f db/schema.sql   # una vez, opcional (ver arriba)
npm run dev              # http://localhost:3000
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
