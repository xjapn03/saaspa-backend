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
- **`trust proxy` = 1 salto (`applyProxyTrust`, `src/common/http/proxy-trust.ts`), nunca `true`:** Nginx es
  el único salto de confianza y el único que **añade** la IP real al final de `X-Forwarded-For`, así que un
  valor que anteponga el cliente no define `req.ip` y no puede mover el bucket del rate limit, los logs ni
  el AuditLog (hallazgo J-03 del informe conjunto).
- **La sesión anónima del chat la emite el servidor:** la cookie `kamerinos_chat_session` solo transporta
  `<id de 128 bits>.<hmac>`, firmado con una clave derivada de `JWT_SECRET`; un valor fabricado, truncado o
  manipulado se rechaza y el servidor emite uno nuevo. La cookie nunca es identidad por sí misma.
- **El sujeto de una escritura interna sale del turn token, no de la petición:** `@TurnContext()` +
  `requireTurnUser()` (**403** si el turno no trae `userId`), con una prueba arquitectónica que falla si un
  handler interno toma identidad del cuerpo, la query, la ruta o una cabecera; `POST /bookings` honra la
  `Idempotency-Key` (ADR 0008/0012) en una columna única, así que un reintento devuelve la misma cita.

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
  `localhost`) e `IA_BOT_TIMEOUT_MS` (**25000**, o cualquier valor mayor que el turn-deadline de la IA: la
  escalera es `backend > turn-deadline de saaspa-IA > read-timeout por intento`, hallazgo J-04; si infra
  fijara 20000 el orden vuelve a invertirse); sin `IA_BOT_URL` el backend cae a `http://localhost:8000` y cada turno
  responde **502**. Falta crear el contenedor `ia-bot` en la red interna y confirmar que `TZ: America/Bogota`
  es efectiva en la imagen `node:20-alpine` (no instala `tzdata`); la disponibilidad ya no depende de
  `tzdata` porque la zona se calcula con `Intl`/ICU, pero los logs y los procesos de Node sí.
- **`saaspa-IA`:** documentar el acoplamiento `TENANT_ID` ↔ `IA_TENANT_DEFAULT` (ver sección 6) en su
  `AGENTS.md`.
- **`saaspa-frontend`:** el widget de chat envía `credentials: 'include'` y reenvía `conversationId`
  en cada turno.
- **`kamerinos-infra`:** inyectar `SALON_NOTIFICATION_EMAIL` en el servicio `backend` (J-05 / ADR 0013): es la
  bandeja que recibe los avisos de handoff del chat. **No es un secreto**, así que puede ir en el compose o en
  el `.env` del despliegue sin fricción; si no se define, los avisos caen en `ADMIN_NOTIFY_EMAIL`
  (`kamerinosg@gmail.com`), que ya recibe las copias de citas y pedidos.

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
- 2026-09-26 — fix/trust-proxy-and-session-id — hallazgo **J-03** del informe conjunto: `trust proxy` pasa
  de `true` a **1 salto** (`applyProxyTrust`, `src/common/http/proxy-trust.ts`), así que Express lee la
  entrada que Nginx **añade** al final de `X-Forwarded-For` y el bucket del rate limit, los logs y el
  AuditLog dejan de ser falsificables con una cabecera (`test/e2e/rate-limit.e2e-spec.ts`: con el
  comportamiento anterior la petición 21 responde 200 en vez de 429); la sesión anónima del chat pasa a ser
  un id de 128 bits **emitido y firmado por el servidor** (`src/modules/chat/chat-session.ts`, HMAC con clave
  derivada de `JWT_SECRET`, la cookie solo lo transporta) y se rechaza cualquier valor fabricado, truncado o
  manipulado (con la regla anterior fallan 9 de los 42 tests del chat); tests nuevos: 11 de `chat-session`,
  1 de `proxy-trust` y 4 de `ChatService`, más el E2E del chat actualizado; queda documentado el límite
  conocido del tope por sesión (se cuenta por conversación y borrar la cookie da una sesión nueva), y el
  límite global del lado de `saaspa-IA` va en su propio repo — verify verde (56 suites, 434 tests) con el
  E2E completo local en verde.
- 2026-09-26 — feature/pending-payment-expiry — hallazgo **B-01** del triaje conjunto (bloqueante de la
  escritura de Fase 2): la franja de una cita `PENDIENTE_PAGO` ya no queda bloqueada para siempre. Ventana de
  pago configurable (`BOOKING_PAYMENT_TTL_MINUTES`, default **30** min: el lock de Redis ya reserva 10, un
  checkout de Wompi tarda 2-10 y la jornada es de 8 h) aplicada de forma **perezosa** por una única cláusula
  compartida (`occupancyFilter`) en `findOccupied`/`findOverlapping`/`findBySlot`; nuevo estado `EXPIRADA`
  (migración `20260926235900_add_expired_booking_status`) al que un barrido periódico
  (`PendingPaymentExpiryScheduler`: cada 5 min y una pasada al arrancar, `setInterval` con `unref()`, sin
  `@nestjs/schedule`) mueve las citas vencidas con un `updateMany` condicionado a que sigan en
  `PENDIENTE_PAGO` (un pago a mitad del barrido gana) y liberando el lock de Redis; tope de pendientes
  simultáneas por usuario (`BOOKING_MAX_PENDING_PER_USER`, default 2 → **409**, el camino admin no lo
  consume); 22 tests unitarios nuevos y un E2E HTTP con BD real (la franja se libera, la cita queda
  `EXPIRADA` y el tope responde 409); documentado en `README.md`, `.env.example` y `docs/dev.md` — verify
  verde (57 suites, 456 tests).
- 2026-09-26 — feature/write-identity-and-idempotency — ADR 0012 aceptada (puntos 1, 2 y 6): el mecanismo de
  identidad queda listo y probado sin endpoint nuevo (`requireTurnUser` responde **403** si el turno no trae
  `userId`; `@TurnContext` cubierto con el payload, un claim suelto y el caso «el guard no corrió»); una prueba
  arquitectónica descubre los controladores de `src/modules/internal/` y falla si un handler toma identidad del
  cuerpo, la query, la ruta o una cabecera (o si recibe cuerpo sin leer el turno), autocomprobándose con
  handlers de mentira para que no pueda pasar en vacío; y `POST /bookings` (y su variante admin) pasa a honrar
  la cabecera `Idempotency-Key` (ADR 0008) guardándola en `bookings.idempotencyKey` con índice único: un
  reintento devuelve la misma cita, la repetición se resuelve antes del tope de pendientes y del lock, una clave
  de otro usuario responde **409** y una clave mal formada **400**; tests: 17 nuevos de identidad interna, 15 de
  idempotencia (repositorio, servicio y controlador) y un E2E HTTP nuevo — verify verde (59 suites, 488 tests).
- 2026-09-26 — fix/timeout-ladder — hallazgo **J-04** (escalera de timeouts invertida): `DEFAULT_IA_BOT_TIMEOUT_MS`
  pasa de **20 s a 25 s** para que el orden sea `backend > turn-deadline de saaspa-IA > read-timeout por
  intento` (**25 s > 20 s > 8-10 s**, el deadline del asistente bajado en paralelo en su repo); con el orden
  anterior el backend respondía 504 mientras la IA seguía trabajando (tokens gastados y un turno en su memoria
  que la clienta nunca vio); `chat/__tests__/timeout-ladder.spec.ts` (4 tests) vigila la relación —falla si el
  backend baja del deadline del asistente— y fija los números acordados; `.env.example`, `README.md` y
  `docs/dev.md` documentan la escalera — verify verde (60 suites, 492 tests).
- 2026-09-26 — feature/handoff-notification-and-reopen — hallazgo **J-05** / ADR 0013: el handoff deja de ser un
  latch permanente. Al activarse se envía un correo interno al salón (`SALON_NOTIFICATION_EMAIL`, con
  `ADMIN_NOTIFY_EMAIL` como respaldo; se eligió correo por la fricción de la plantilla de Meta en WhatsApp y
  porque SendGrid ya está integrado) con el motivo, la conversación, el turno, el mensaje que lo disparó y cómo
  cerrarlo; el disparo queda persistido (`handoffMessage`, `handoffAt`, `handoffClosedAt`, migración
  `20260927120000_add_chat_handoff_detail`) y un endpoint admin
  (`PATCH /api/chat/conversations/:id/handoff` con `close`/`reopen`, ADMIN/EMPLEADO) permite desactivarlo con
  constancia en el AuditLog (el interceptor ahora lee el `entityId` de rutas con una colección intermedia); 20
  tests unitarios nuevos (chat, repositorio, email y auditoría) y un E2E del flujo completo (handoff → aviso →
  cierre por endpoint → el bot responde otra vez) — verify verde (61 suites, 512 tests).
- 2026-09-26 — docs/post-merge-sync — tras el merge del PR #73 (`develop` = `9fc8b12`) se alinea la
  documentación con el código real: la sección 9 pasa a listar las variables que `kamerinos-infra` debe
  inyectar (`TENANT_TIMEZONE`, `TURN_TOKEN_ISSUER`/`AUDIENCE`/`TTL_SECONDS` explícitos y `IA_BOT_URL`/
  `IA_BOT_TIMEOUT_MS` del bloque de chat), la Fase 1 refleja la aceptación E2E contra `saaspa-IA` real en
  ejecución y `docs/dev.md` documenta `IA_BOT_URL` e `IA_BOT_TIMEOUT_MS` — solo documentación; verify verde
  (53 suites, 407 tests).
