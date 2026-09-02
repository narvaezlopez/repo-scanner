# web-ui-repo-scanner

SPA de **Code Insight AI**. Angular 22, componentes standalone + `signals`
(sin `NgModule`, sin RxJS de más — solo donde el WebSocket lo pide).

## Pantallas

| Ruta | Componente | Qué hace |
|---|---|---|
| `/login` | `pages/login` | Login con Google vía Firebase Auth |
| `/` | `pages/home` | Carga de repo + progreso en vivo + dashboard de resultados. Protegida por `authGuard` |

`home` es una sola página con 3 estados según la fase del análisis:

- **`components/landing`** — formulario de entrada: URL de Git pública o ZIP
- **`components/loading`** — barra de progreso + mensaje por fase, con
  animación (`lottie-web`); el porcentaje llega en tiempo real por WebSocket
- **`components/dashboard`** — resultado: resumen funcional, tecnologías
  detectadas, arquitectura inferida (patrón + confianza + evidencia),
  componentes identificados, recomendaciones y riesgos

## Autenticación

`services/auth.ts` envuelve el SDK de Firebase (`signInWithPopup` +
`GoogleAuthProvider`). El login pasa directo del navegador a Firebase — el
backend nunca lo ve. `guards/auth.guard.ts` bloquea `/` si no hay sesión.
`interceptors/auth.interceptor.ts` agrega el ID token de Firebase como
`Authorization: Bearer` a toda llamada a `/api/v1/*`, y ante un `401` cierra
sesión y redirige a `/login`.

## Consumo de la API

`services/api.ts`:

- `createJob(zip)` / `createJobFromUrl(gitUrl)` → `POST /api/v1/jobs`
- `getJob(id)` → `GET /api/v1/jobs/:id` (fallback si el WebSocket se cae)
- `watchJob(jobId)` → abre `/ws`, manda `{ type: 'subscribe', jobId, token }`
  y emite el `Job` actualizado en cada evento (`snapshot` / `progress` /
  `done` / `error`) hasta que el análisis termina o falla

## Desarrollo local

```bash
nvm use                 # o Node 24
npm install
npm start                # http://localhost:4200 — apunta a localhost:3000 (ver src/environments/environment.ts)
```

Requiere el backend (`ws-repo-scanner`) corriendo aparte. Config de Firebase y
URLs de API/WS están en `src/environments/` (`environment.ts` para dev,
`environment.production.ts` para el build — vacío en prod porque CloudFront
enruta `/api/*` y `/ws` al mismo origen, sin CORS).

## Build

```bash
npm run build            # dist/web-ui-repo-scanner/
```

En AWS, el build se sube a S3 y se sirve por CloudFront (ver
[`../infra-repo-scanner/README.md`](../infra-repo-scanner/README.md)).

## Tests

```bash
npm test                 # Vitest
```

## Despliegue

Ver [`../infra-repo-scanner/README.md`](../infra-repo-scanner/README.md) —
`Angular → S3 + CloudFront`, con una CloudFront Function para el rewrite de
rutas de la SPA (deep links de Angular Router).
