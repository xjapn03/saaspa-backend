# AGENTS.md — saaspa-backend

> **Lee este archivo completo antes de tocar nada.** Es la fuente de verdad para cualquier agente de IA
> (o persona) que trabaje en este repositorio. Si algo aquí contradice `README.md` o `docs/dev.md`,
> **gana este archivo**. Al terminar cada tarea, actualiza la sección
> [9. Pedidos a otros repos](#9-pedidos-a-otros-repos) y el [registro de cambios](#11-registro-de-cambios).

Última actualización: 2026-09-26

---

## 1. Qué es este proyecto

**saaspa-backend** es el backend de negocio de **Kamerinos SPA Bogotá** y el **sistema de registro** de
todos los canales. Monolito modular NestJS 11 + Prisma 5 + PostgreSQL 15 (pgvector) + Redis.

- Es dueño de los datos y de la lógica de negocio: usuarios y roles, catálogo de servicios y productos,
  agenda con slot-locking en Redis, pagos Wompi, e-commerce, Google Calendar, Meta CAPI y auditoría.
- Es el **único punto de entrada** de los canales conversacionales: resuelve tenant, identidad y rol,
  emite el **turn token** y llama a `saaspa-IA` por HTTP.
- `saaspa-IA` es el cerebro conversacional; **no** es dueño de datos ni de lógica de negocio.

**Lo que NO se hace en este repo:** lógica de prompt/LLM, RAG ni llamadas al modelo. Eso vive en `saaspa-IA`.

### Repositorios y responsabilidades

| Repo | Rol |
|---|---|
| `saaspa-backend` (**este**) | NestJS 11 + Prisma + PostgreSQL/pgvector + Redis. Sistema de registro; expone `/api/*` y `/api/internal/v1/*`. |
| `saaspa-IA` | Cerebro conversacional (Java 21 + Spring Boot + Spring AI). Consume este backend por `/api/internal/v1/*` y expone `POST /api/v1/chat`. |
| `saaspa-frontend` | Next.js 16. Chat web (anónimo y logueado) y chat del dashboard; habla **solo** con este backend. |
| `kamerinos-infra` | Docker Compose + Nginx. |

**Regla:** desde este repositorio **nunca se modifican los otros repos** (ni commits, ni push, ni PRs
allí). Si hace falta un cambio, se documenta como pedido en la sección 9; la persona lo implementa.

---

## 2. Stack

| Elemento | Valor |
|---|---|
| Runtime | Node.js 20+ (Docker `node:20-alpine`) / TypeScript 5 |
| Framework | NestJS 11 |
| ORM | Prisma 5.22 + PostgreSQL 15 (pgvector) |
| Caché / locks | Redis (`ioredis`) |
| Auth de usuario | JWT **HS256** simétrico (`JWT_SECRET`), cookies httpOnly |
| Auth servicio a servicio | `X-Internal-Api-Key` (`IA_BOT_API_KEY` / `INTERNAL_API_KEY`) + **turn token ES256** |
| Tests | Jest 29 + `jest-mock-extended` + `supertest` (E2E) |
| CI | GitHub Actions: `tsc --noEmit` + `build` + `npm test` |

---

## 3. Arquitectura y capas

```text
Controller → Service → Repository Interface (abstract class) ← Repository (Prisma)
```

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Controller | `src/modules/*/` | HTTP, DTOs (class-validator), delega al Service |
| Service | `src/modules/*/` | Lógica de negocio; depende de abstracciones, no de Prisma |
| Repository Interface | `src/repositories/interfaces/` | Contrato (clase abstracta) |
| Repository | `src/repositories/` | Implementación con PrismaService |

Convenciones:
- Paquete por funcionalidad (`src/modules/<modulo>/`), tests en `__tests__/` junto al módulo.
- Repositorios nuevos: interfaz abstracta + implementación registrada en `RepositoriesModule` (`@Global`).
- Guards en directorios `guards/` (los globs de cobertura de Jest los incluyen).
- Errores HTTP con las excepciones de Nest (`NotFoundException`, `ConflictException`, `UnauthorizedException`,
  `PayloadTooLargeException`, …); la forma de respuesta es `{ statusCode, message, error }`.
- Llamadas HTTP externas con `fetch` nativo + `AbortController` (sin `axios`/`HttpModule`).
- Migraciones Prisma **inmutables**: nunca editar una migración ya aplicada.

---

## 4. Comandos y definición de "hecho"

```bash
npm ci                                  # dependencias (lockfile)
npx prisma generate                     # cliente Prisma
npx tsc --noEmit                        # typecheck
npm run build                           # nest build
npm test                                # tests unitarios (no requieren BD)
npm run test:e2e                        # E2E local (requiere PostgreSQL + Redis)
npm run lint                            # eslint --fix
```

**Verify (obligatorio antes de cada commit):**

```bash
npx prisma generate && npx tsc --noEmit && npm run build && npm test
```

Cada tarea se considera hecha cuando:
- [ ] `verify` en verde.
- [ ] Tests nuevos/actualizados (unitarios siempre; E2E cuando toque HTTP + BD real).
- [ ] Documentación actualizada (`README.md`, `docs/dev.md`, contratos o este archivo).
- [ ] Rama subida, PR abierto contra `develop` (inglés, sin emojis, con la plantilla) y CI en verde.

---

## 5. Seguridad: secretos y claves

- **Sin secretos en el repo.** Todo por variables de entorno; `.env` está en `.gitignore`.
  En `.env.example` solo van placeholders (p. ej. `BASE64_PKCS8_PRIVATE_KEY_HERE`).
- **`TURN_TOKEN_PRIVATE_KEY` (clave privada ES256):** vive **solo** en variable de entorno / secreto del
  despliegue. Nunca en el repo, ni en un commit, ni en un log, ni en un mensaje de error.
  El comando para generarla está en [`docs/dev.md`](docs/dev.md) y el material temporal se crea
  **fuera del repositorio**.
- **Dos claves de servicio, una por dirección, y no se unifican:**
  `IA_BOT_API_KEY` (NestJS → `saaspa-IA`) e `INTERNAL_API_KEY` (`saaspa-IA` → NestJS).
- **Sin PII en logs.** No volcar teléfonos, emails ni texto de conversación en `INFO`.
- Rutas internas (`/api/internal/v1/*`): `@Public()` solo para saltar el guard de sesión; la autorización
  real la hace el guard dedicado, y **siempre con la identidad del turn token**, nunca con parámetros de
  la petición ni con argumentos generados por el modelo.

---

## 6. Acoplamientos con otros repos (crítico)

| Este repo | `saaspa-IA` | Consecuencia si no coinciden |
|---|---|---|
| `TENANT_ID` (default `kamerinos`) | `IA_TENANT_DEFAULT` | `saaspa-IA` valida `tenantId` con fallo cerrado y responde **403** (hallazgo A-03). |
| `TENANT_TIMEZONE` (default `America/Bogota`) | `saaspa.tenant.timezone` | Fechas y disponibilidad interpretadas en zonas distintas. |
| `TURN_TOKEN_KID` / `TURN_TOKEN_PRIVATE_KEY` | `TURN_TOKEN_KEY_CURRENT_PUBLIC_KEY` / `TURN_TOKEN_KEY_PREVIOUS_PUBLIC_KEY` | `saaspa-IA` no puede verificar el turn token (401). La rotación usa dos ranuras por `kid`. |

El contrato del turn token es el **ADR 0006** de `saaspa-IA`: ES256 (P-256, PEM), header `kid`, claims
`iss`, `aud` (`saaspa-ia`), `iat`, `exp` corta, `jti` = `turnId`, `tenantId`, `conversationId`, `channel`,
`agent`, `userId?`, `role?`. Este backend lo **emite y lo verifica** (deriva la pública de la privada);
`saaspa-IA` solo lo verifica y lo reenvía tal cual en cada llamada interna.

---

## 7. Git flow, GitHub y pull requests

### Ramas

| Rama | Uso |
|---|---|
| `main` | Siempre desplegable. Protegida. Solo recibe PRs de release desde `develop` (o `hotfix/*`), cuando la persona lo pida. |
| `develop` | Integración. Solo recibe PRs desde ramas de trabajo. |
| `feature/<slug>` | Trabajo nuevo (p. ej. `feature/chat-turn-token`). Sale de `develop`. |
| `fix/<slug>` | Corrección de bugs. Sale de `develop`. |
| `docs/<slug>` · `chore/<slug>` | Documentación / mantenimiento. Salen de `develop`. |
| `hotfix/<slug>` | Urgente sobre `main`; luego se fusiona también a `develop`. |

### Commits

- [Conventional Commits](https://www.conventionalcommits.org/) en **inglés**: `feat:`, `fix:`, `docs:`,
  `test:`, `refactor:`, `chore:`, `build:`, `ci:`. Pequeños y enfocados.
- **Sin emojis** en commits, código ni PRs. Nunca commitear secretos, `.env`, dumps reales ni
  conversaciones reales sin anonimizar.

### Qué puede y qué no puede hacer el agente con git y `gh`

**Permitido:** `git fetch`, `git ls-remote`, `git status/log/diff`; crear ramas desde `develop`; commits;
`git push -u origin <rama-propia>` (`feature/*`, `fix/*`, `docs/*`, `chore/*`); volver a hacer push (sin
force) para corregir CI o comentarios; `gh pr create --base develop`; `gh pr edit` / `gh pr comment` en
**sus propios** PRs; `gh pr checks` / `gh run list|view`; lectura de otros repos con `gh api` (GET).

**Prohibido sin instrucción explícita de la persona:** fusionar PRs de cualquier forma
(`gh pr merge`, `--auto`, `--admin`, fusión por API, `git merge` o push directo a `main`/`develop`);
aprobar, cerrar o reabrir PRs; `--force` / `--force-with-lease`; tocar la configuración del repositorio
(branch protection, secrets, webhooks, remotos). **La persona valida y fusiona manualmente.**

### Ciclo de una rama

1. `git fetch origin && git checkout develop && git pull --ff-only`.
2. `git checkout -b feature/<slug>`.
3. Commits atómicos, con `verify` verde antes de cada uno.
4. `git push -u origin <rama>` y `gh pr create --base develop --title "..." --body-file /tmp/<archivo>.md`
   (el cuerpo va en un archivo temporal **fuera del repo**).
5. Revisar el CI; si falla, corregir con un commit nuevo y push (sin force).
6. **Detenerse y resumir a la persona.** El PR queda abierto esperando validación y merge manual (squash).
7. Cuando la persona confirme el merge: `git checkout develop && git pull --ff-only` y `git branch -d <rama>`.

### Reglas de los pull requests

- **Idioma: inglés. Sin emojis** en título, descripción ni comentarios.
- **Título** estilo Conventional Commits, imperativo, máximo 72 caracteres, sin punto final.
- **Descripción** con la plantilla de [`.github/pull_request_template.md`](.github/pull_request_template.md).
- Un PR = una tarea o un grupo coherente. Base siempre `develop`. Nada de secretos ni PII en el PR.

---

## 8. Contratos vigentes

- `saaspa-IA/docs/contracts/chat-api.openapi.yaml` — NestJS → `saaspa-IA` (`POST /api/v1/chat`).
- `saaspa-IA/docs/contracts/internal-api.openapi.yaml` — `saaspa-IA` → NestJS (`/api/internal/v1/*`).
- `saaspa-IA/docs/contracts/web-chat-api.openapi.yaml` — frontend → NestJS (`POST /api/chat`).
- `saaspa-IA/docs/contracts/t1.0-backend-validation.md` — estado real verificado de este backend.

Los cambios de contrato se mencionan en "Risks and notes" del PR y se avisan a la persona.

---

## 9. Pedidos a otros repos

Pendientes (van a otro repo; **no** se implementan aquí):

- **`kamerinos-infra`:** inyectar en el servicio `backend` las variables de la integración con `saaspa-IA`:
  `IA_BOT_API_KEY`, `INTERNAL_API_KEY`, `TURN_TOKEN_PRIVATE_KEY`, `TURN_TOKEN_KID`, `TENANT_ID` y
  `TENANT_TIMEZONE`; y además `TURN_TOKEN_ISSUER`, `TURN_TOKEN_AUDIENCE` y `TURN_TOKEN_TTL_SECONDS` con sus
  valores explícitos (`saaspa-backend`, `saaspa-ia`, `300`) en lugar de dejarlos en el default silencioso
  del código. El bloque de chat necesita también `IA_BOT_URL` (la URL interna del contenedor `ia-bot`, nunca
  `localhost`) e `IA_BOT_TIMEOUT_MS`; sin `IA_BOT_URL` el backend cae a `http://localhost:8000` y cada turno
  responde **502**. Falta crear el contenedor `ia-bot` en la red interna y confirmar que `TZ: America/Bogota`
  es efectiva en la imagen `node:20-alpine` (no instala `tzdata`); la disponibilidad ya no depende de
  `tzdata` porque la zona se calcula con `Intl`/ICU, pero los logs y los procesos de Node sí.
- **`saaspa-IA`:** documentar el acoplamiento `TENANT_ID` ↔ `IA_TENANT_DEFAULT` (ver sección 6) en su
  `AGENTS.md`.
- **`saaspa-frontend`:** el widget de chat envía `credentials: 'include'` y reenvía `conversationId`
  en cada turno.

---

## 10. Fases

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Alineación de contratos con `saaspa-IA` | Completada |
| 1 | Turn token ES256 + guard · `/api/internal/v1/*` de lectura (services, services/{id\|slug}, availability) · `POST /api/chat` con handoff por conversación y anti-abuso | Completada y **aceptada con un E2E real contra `saaspa-IA` en ejecución** (no simulado); el despliegue en producción sigue pendiente |
| 2 | Escrituras por chat (`Idempotency-Key`, deep-link Wompi, `me/bookings`) | Pendiente |
| 3 | Agente ADMIN + reportes internos | Pendiente |
| 4 | Canal WhatsApp con identidad (`waId` resuelto por este backend y firmado en el token) | Pendiente |

---

## 11. Registro de cambios

Añade una línea por tarea terminada: `fecha — rama — qué cambió — resultado de verify`.

- 2026-09-26 — docs/agents-md — `AGENTS.md` y plantilla de PR creados; corrección del stack de IA en el
  README (Java + Spring AI en lugar de Python); comando de generación del par ES256 documentado en
  `docs/dev.md`. Sin cambios de código.
- 2026-09-26 — feature/chat-turn-token — emisión y verificación del turn token ES256 (`TurnTokenService`,
  clave privada solo por entorno, pública derivada) + `InternalAuthGuard` (clave de servicio en tiempo
  constante, rechazo de HS256, `kid`/`aud`/`iss`, tenant) + `@TurnContext`; Joi estricto para
  `IA_BOT_API_KEY`, `INTERNAL_API_KEY`, `TURN_TOKEN_PRIVATE_KEY`, `TURN_TOKEN_KID` y `TENANT_ID`, con
  clave efímera generada en CI; `.env.example`/`.env.test`/README actualizados — verify verde
  (46 suites, 348 tests).
- 2026-09-26 — feature/internal-api-v1 — endpoints internos de lectura `GET /api/internal/v1/services`
  (paginado), `/services/{id|slug}` (UUID o slug, mapeo `categoryRel` -> `category`) y
  `/availability?serviceId&date` con offset explícito vía `Intl`/ICU y `TENANT_TIMEZONE`;
  `BookingsService.getAvailabilityWindow()` como fuente única del cálculo de franjas (el endpoint
  público pasa a mapear sobre él); `ServicesModule`/`BookingsModule` exportan sus servicios; 3 suites
  nuevas — verify verde (49 suites, 370 tests).
- 2026-09-26 — feature/web-chat-endpoint — `POST /api/chat` público (canal web anónimo y logueado):
  resuelve tenant/canal/agente/identidad, emite el turn token, llama a `saaspa-IA` con timeout y mapeo de
  `ProblemDetail`; **handoff persistido por conversación** (A-10a, tabla `chat_conversation_states` con
  `tenantId` default `kamerinos`) que impide al bot retomar la conversación; anti-abuso (20 req/min por IP,
  tope de 30 mensajes por sesión anónima, mensaje ≤1000 → 413) y `conversationId` de 128 bits atado a la
  sesión anónima (cookie httpOnly + `sha256`); E2E del chat con la IA simulada y E2E de la API interna
  (20 tests, `fetch` mockeado, BD real) — verify verde (53 suites, 403 tests).
- 2026-09-26 — fix/user-birthday-date — `PATCH /api/users/me` y `PATCH /api/users/:id` devolvían **500**
  cuando el body traía `birthday` como fecha (`@IsDateString`, ejemplo `1990-05-15`), porque el string
  llegaba tal cual a una columna `DateTime`; `UsersService.update` ahora lo convierte a `Date` (igual que
  `AuthService.register`) y responde 400 si no es parseable; 4 tests unitarios nuevos que **fallan sin el
  fix** más la aserción E2E del valor persistido; las suites E2E `auth`/`users` quedan **25/25** — verify
  verde (53 suites, 407 tests).
- 2026-09-26 — fix/production-config-fail-closed — el esquema Joi del entorno sale de `config.module.ts` a
  `src/config/env.validation.ts` y pasa a exigir `IA_BOT_URL`, `IA_BOT_TIMEOUT_MS` y `TENANT_TIMEZONE`
  cuando `NODE_ENV=production`: el arranque muere con `Config validation error: ...` en lugar de caer a
  `localhost`, a un timeout inventado o a una zona adivinada; fuera de producción conservan su default
  (`http://localhost:8000`, `20000`, `America/Bogota`); 11 tests unitarios nuevos que **fallan sin el fix**
  (6 de 11) y README/`docs/dev.md` actualizados con la obligatoriedad y los conteos — verify verde
  (54 suites, 418 tests).
- 2026-09-26 — docs/post-merge-sync — tras el merge del PR #73 (`develop` = `9fc8b12`) se alinea la
  documentación con el código real: la sección 9 pasa a listar las variables que `kamerinos-infra` debe
  inyectar (`TENANT_TIMEZONE`, `TURN_TOKEN_ISSUER`/`AUDIENCE`/`TTL_SECONDS` explícitos y `IA_BOT_URL`/
  `IA_BOT_TIMEOUT_MS` del bloque de chat), la Fase 1 refleja la aceptación E2E contra `saaspa-IA` real en
  ejecución y `docs/dev.md` documenta `IA_BOT_URL` e `IA_BOT_TIMEOUT_MS` — solo documentación; verify verde
  (53 suites, 407 tests).
