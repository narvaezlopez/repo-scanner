# Code Insight AI — Ingeniería Inversa Automatizada de Repositorios

Kata Senior Fullstack/Cloud. Aplicación web que analiza un repositorio de código
fuente (por URL de Git pública o `.zip` subido) e **infiere automáticamente**,
con ayuda de un LLM, su propósito funcional, su arquitectura, sus componentes
clave y sus riesgos/recomendaciones — mostrando todo en tiempo real mientras
se procesa.

## 1. Descripción de la solución

El usuario se loguea con Google, entrega un repositorio (URL de GitHub pública
o ZIP) y ve el progreso del análisis en vivo (barra + mensajes por fase). Al
terminar, el dashboard muestra:

- **Resumen funcional** — 2-4 frases de qué hace la aplicación
- **Tecnologías detectadas** — con versión y evidencia (de qué archivo salió)
- **Arquitectura inferida** — patrón (hexagonal, MVC, n-capas, clean
  architecture, microservicios, monolito…), confianza, justificación y capas
- **Hallazgos** — componentes identificados, recomendaciones y riesgos
  (dependencias desactualizadas, falta de manejo de errores, reglas de
  seguridad sin revisar, etc.)

El análisis combina **procesamiento determinista** (nada de lo que ve el LLM es
"a ojo"): se escanea el árbol de archivos, se detectan y parsean los
manifiestos según su tipo (`package.json`, `requirements.txt`/`pyproject.toml`,
`pom.xml`, `build.gradle`, `go.mod`, `Cargo.toml`, `*.csproj`, `Dockerfile`,
`docker-compose.yml`, `*.tf`), y solo ese contexto ya estructurado se le
manda a Claude, que responde con un JSON validado contra un esquema fijo — no
texto libre a interpretar en el frontend.

## 2. Arquitectura implementada

Monorepo con 3 proyectos independientes:

| Carpeta | Qué es | Stack |
|---|---|---|
| [`web-ui-repo-scanner/`](web-ui-repo-scanner/) | SPA | Angular 22 (standalone + signals) |
| [`ws-repo-scanner/`](ws-repo-scanner/) | API + análisis | Node.js 24 + Express + TypeScript, arquitectura hexagonal |
| [`infra-repo-scanner/`](infra-repo-scanner/) | Infraestructura como código | Terraform, AWS |

### Backend — hexagonal (puertos y adaptadores)

`core/` (dominio + casos de uso) no conoce ningún detalle externo: no sabe si
el repo llegó por ZIP o por URL de Git, si la IA es Claude u otra, ni si la
persistencia es Postgres o memoria. Todo eso vive en `adapters/`, detrás de
puertos (`RepoSourcePort`, `LlmPort`, `JobStorePort`, `TokenVerifierPort`,
`UserStorePort`, `ProgressPort`). Eso hace que, por ejemplo, cambiar de
proveedor de IA sea agregar un adaptador nuevo, no reescribir el caso de uso.

### Flujo de un análisis (asíncrono, no bloqueante)

```
POST /api/v1/jobs (.zip ó { gitUrl })
        │
        ▼
  crea el Job (estado: en cola) ──► responde 202 { jobId } al instante
        │
        ▼  (en background, fire-and-forget — el request HTTP no espera esto)
  materializa el repo (descomprime / clona)
        ▼
  escanea estructura (árbol, conteos, ficheros clave)
        ▼
  lee y parsea manifiestos por tipo
        ▼
  arma el contexto (overview) y llama a Claude en streaming
        ▼
  valida y repara el JSON de salida (esquema zod)
        ▼
  guarda el resultado, estado: hecho
```

El progreso de cada fase se emite por un **bus de eventos en memoria** y se
transporta al navegador por **WebSocket** (`/ws`) en tiempo real — no hay
polling. La llamada al LLM va en streaming (`messages.stream`), así que el
progreso durante esa fase (la más lenta, con diferencia) también se actualiza
de forma continua en vez de saltar de golpe al terminar; si el modelo tarda en
mandar el primer texto, un heartbeat de respaldo sigue moviendo el número para
que nunca se sienta trabado. Si el WebSocket se cae, el frontend cae a
`GET /api/v1/jobs/:id` como respaldo.

### Autenticación

Login con Google vía **Firebase Authentication**, 100% del lado del cliente —
el backend nunca ve credenciales, solo recibe el ID token de Firebase como
`Authorization: Bearer <token>` en cada request y lo valida con
`firebase-admin` (verificación local contra las claves públicas de Google, sin
llamar a Firebase en cada petición). La primera vez que un usuario se loguea,
se crea su registro en Postgres (JIT) ligado a su `firebaseUid`.

### Desplegado en AWS (no solo diagramado)

```
Usuario ──HTTPS──► CloudFront ─┬─► S3 (SPA Angular, privado, OAC)         [/*]
                                └─► ALB ──► ECS Fargate                    [/api/*, /ws]
                                              │
                                              ├─► RDS PostgreSQL (subredes privadas, SSL)
                                              ├─► Secrets Manager (API key, DB, Firebase)
                                              └─► API de Anthropic (HTTPS)

Login: Usuario ──► Firebase Authentication (Google) — directo, no pasa por AWS
```

Todo provisionado con Terraform (`infra-repo-scanner/`) y un único script
(`provision.sh`) que hace init+apply, build y push de la imagen, carga de
secretos, carga del esquema en RDS y redeploy de ECS de punta a punta. Detalle
completo en [`infra-repo-scanner/README.md`](infra-repo-scanner/README.md).

**Siguiente iteración** (bosquejada en el diagrama de arquitectura, no
implementada): cola SQS + un worker Fargate dedicado para desacoplar el
análisis del servicio que atiende HTTP/WebSocket.

## 3. Tecnologías utilizadas

**Frontend:** Angular 22 (standalone components, signals), Firebase Auth SDK,
lottie-web (animación de carga).

**Backend:** Node.js 24, Express, TypeScript, `@anthropic-ai/sdk` (streaming),
`firebase-admin`, TypeORM + `pg` (Postgres), `multer` (upload de ZIP), `zod`
(validación y reparación del JSON del LLM), `ws` (WebSocket), `pino` (logs),
Vitest (tests).

**IA:** Claude (`claude-sonnet-5`) vía la API de Anthropic directa — no
Bedrock (la cuenta de AWS de la kata no tenía cupo habilitado; la API key se
guarda en Secrets Manager, nunca en el repo).

**Infraestructura:** Terraform, AWS (S3, CloudFront, ALB, ECS Fargate, ECR,
RDS PostgreSQL, Secrets Manager, VPC), GitHub Actions con OIDC para CI/CD.

## 4. Instrucciones de ejecución

Requisitos: Node 24, npm, y credenciales de Firebase + una API key de
Anthropic para el modo con IA real (sin ellas, backend y frontend igual
levantan — ver **Supuestos**).

```bash
# Backend
cd ws-repo-scanner
npm install
cp .env.example .env        # completar ANTHROPIC_API_KEY (y Firebase si se quiere auth real)
npm run dev                 # http://localhost:3000

# Frontend (otra terminal)
cd web-ui-repo-scanner
npm install
npm start                   # http://localhost:4200
```

Con `DB_HOST` sin definir en `.env`, el backend usa un `JobStore` en memoria
(no persiste entre reinicios) — no hace falta Postgres para probar el flujo
completo en local. Para persistencia real, ver
[`ws-repo-scanner/README.md`](ws-repo-scanner/README.md) (carga de
`db/schema.sql`).

**Despliegue a AWS** (opcional, todo el proceso real de esta kata corrió
contra un ambiente `dev` desplegado):

```bash
cd infra-repo-scanner
ANTHROPIC_API_KEY=sk-ant-... ./provision.sh
```

Detalle completo, variables y troubleshooting en
[`infra-repo-scanner/README.md`](infra-repo-scanner/README.md).

## 5. Supuestos realizados

- **IA:** Claude vía API de Anthropic en vez de Amazon Bedrock — la cuenta de
  AWS provista para la kata no tenía cuota de Bedrock habilitada; se optó por
  la vía más simple dentro del tiempo disponible.
- **Repos de prueba:** solo repositorios públicos y personales/dummy, nunca
  repositorios internos del banco ni código propietario, siguiendo la
  restricción del reto.
- **Auth opcional por diseño:** `AUTH_ENABLED=false` por defecto — el backend
  funciona sin Firebase configurado (útil para correr/testear rápido); en
  producción (AWS) está desplegado con auth real.
- **Persistencia opcional en local:** sin `DB_HOST`, el backend cae a memoria
  en vez de exigir Postgres corriendo — prioriza poder probar el flujo
  completo sin infraestructura previa.
- **El esquema de base de datos no lo gestiona la aplicación**: `db/schema.sql`
  se carga una vez, a mano o vía `provision.sh`; no hay migraciones
  automáticas (fuera del alcance de las 4 horas).
- **Sin gestión de costos/límite de uso del LLM** más allá del `LLM_MAX_TOKENS`
  configurable — no hay rate limiting ni cuotas por usuario todavía.
- **Estado de Terraform local** (no S3 remoto) — documentado como limitación
  consciente en `infra-repo-scanner/README.md`, válido para el alcance de una
  kata de un solo desarrollador.
