# Notas de Desarrollo — Kamerinos SPA Backend

## Stack actual

| Componente   | Versión            | Estado                        |
|-------------|--------------------|-------------------------------|
| NestJS      | v11.1.28           | Actualizado (nov 2026)        |
| TypeScript  | v5.x               | —                             |
| Prisma      | v5.22              | —                             |
| PostgreSQL  | 15 (pgvector)      | —                             |
| npm audit   | **0 vulnerabilidades** | Auditado tras migrar a v11 |

## Inicio rápido

```bash
# Infra
docker compose up -d postgres redis

# Backend
npm run start:dev        # Levanta en :3001 (seed si RUN_SEED=true; migraciones manuales)
npm run test             # Tests unitarios
npm run test:e2e         # Tests end-to-end
npm run prisma:studio    # Explorar DB con Prisma Studio
```

## Comandos Prisma

```bash
npx prisma migrate dev --name <nombre>   # Crear migración
npx prisma migrate deploy                # Aplicar migraciones en prod
npx prisma db seed                       # Poblar datos iniciales
npx prisma generate                      # Regenerar cliente
```

## Turn token ES256 (servicio de IA `saaspa-IA`)

Este backend es el **único emisor** del turn token: firma en ES256 (P-256) la identidad del turno y
`saaspa-IA` lo verifica con la clave pública. El contrato y los claims están en el **ADR 0006** de
`saaspa-IA` y en la sección 6 de `AGENTS.md`.

El claim opcional **`clientIp`** es la dirección que `resolveClientIp` extrae de `req.ip` de Express, resuelta
con `TRUSTED_PROXY_HOPS = 1` (`applyProxyTrust`): la que **añade** Nginx al final de `X-Forwarded-For`,
idéntica a la que usa el `ThrottlerGuard` para el bucket (hallazgo J-03). Nunca se toma de una cabecera sin
validar, se emite cruda (sin normalizar IPv6, para no divergir del bucket) y se omite si no hay dirección;
`saaspa-IA` la usa para topear por origen además de por tenant/conversación.

### Variables

| Variable | Descripción |
|---|---|
| `TURN_TOKEN_PRIVATE_KEY` | Clave privada PKCS#8 PEM en **base64 de una sola línea** (sobrevive a Docker Compose). |
| `TURN_TOKEN_KID` | Identificador de la clave que viaja en el header del JWT (`kid`). |
| `TURN_TOKEN_ISSUER` / `TURN_TOKEN_AUDIENCE` | `saaspa-backend` / `saaspa-ia` (defaults). |
| `TURN_TOKEN_TTL_SECONDS` | Vida del token (default `300`). |
| `INTERNAL_API_KEY` | Secreto de la dirección `saaspa-IA` → NestJS (`X-Internal-Api-Key`). |
| `IA_BOT_URL` | URL interna del servicio de IA; en Compose apunta al contenedor `ia-bot` (no `localhost`). Sin ella el código cae a `http://localhost:8000` y cada turno responde **502**. En `NODE_ENV=production` es **obligatoria**. |
| `IA_BOT_TIMEOUT_MS` | Timeout de `POST /api/v1/chat` en ms (default `25000`); al superarlo se responde **504**. En `NODE_ENV=production` es **obligatoria**. |
| `IA_BOT_API_KEY` | Secreto de la dirección NestJS → `saaspa-IA` (no confundir con el anterior). |
| `TENANT_ID` | Debe coincidir **exactamente** con `IA_TENANT_DEFAULT` de `saaspa-IA`. |
| `TENANT_TIMEZONE` | Debe coincidir con `saaspa.tenant.timezone` de `saaspa-IA` (default `America/Bogota`). En `NODE_ENV=production` es **obligatoria**. |
| `BOOKING_PAYMENT_TTL_MINUTES` | Ventana de pago de una cita (default `30`). Pasada, la franja se libera y la cita pasa a `EXPIRADA`. |
| `BOOKING_MAX_PENDING_PER_USER` | Citas `PENDIENTE_PAGO` simultáneas por usuario (default `2`; el camino admin no lo consume). |
| `NODE_ENV` | `development` \| `production` \| `test` (default `development`). |

Con `NODE_ENV=production` el esquema Joi (`src/config/env.validation.ts`) **aborta el arranque** con
`Config validation error: ...` si falta `IA_BOT_URL`, `IA_BOT_TIMEOUT_MS` o `TENANT_TIMEZONE`, igual que ya
ocurre con `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `IA_BOT_API_KEY`, `INTERNAL_API_KEY`,
`TURN_TOKEN_PRIVATE_KEY`, `TURN_TOKEN_KID` y `TENANT_ID`. La decisión es deliberada: sin esto, un contenedor
mal configurado arrancaba apuntando a `localhost`, con un timeout inventado o con una zona horaria adivinada.
Fuera de producción las tres conservan su default (tabla de arriba) para no romper el flujo local. Cubierto
por `src/config/__tests__/env.validation.spec.ts`.

### Generar el par de claves (una sola vez por entorno)

El material se crea **fuera del repositorio** y **nunca** se commitea, ni se pega en un PR, ni se loguea.
Solo `TURN_TOKEN_PRIVATE_KEY` (el base64) entra en el `.env` local o en el secreto del despliegue; la
clave pública se entrega a `saaspa-IA` en `TURN_TOKEN_KEY_CURRENT_PUBLIC_KEY`.

```bash
mkdir -p ~/.config/kamerinos && cd ~/.config/kamerinos && chmod 700 .

# 1) Par ES256 (P-256) en PKCS#8 PEM
openssl ecparam -genkey -name prime256v1 -noout | openssl pkcs8 -topk8 -nocrypt -out turn.key.pem

# 2) Valor de una línea para TURN_TOKEN_PRIVATE_KEY (base64 del PEM)
base64 -w0 turn.key.pem > turn.key.b64

# 3) Clave pública de la MISMA privada, para saaspa-IA (base64 del SPKI PEM)
openssl pkey -in turn.key.pem -pubout -out turn.key.pub.pem
base64 -w0 turn.key.pub.pem

# 4) Borrar el material temporal en claro
chmod 600 turn.key.pem turn.key.b64 && rm -f turn.key.pem && shred -u turn.key.b64 2>/dev/null || true
```

- `TURN_TOKEN_PRIVATE_KEY` ← contenido de `turn.key.b64`
- `TURN_TOKEN_KID` ← un identificador propio (p. ej. `kamerinos-2026-09`); al rotar se publica el nuevo
  `kid` en `TURN_TOKEN_KEY_CURRENT_PUBLIC_KEY` y el anterior en `TURN_TOKEN_KEY_PREVIOUS_PUBLIC_KEY`
  de `saaspa-IA`, sin cortar el servicio.
- En **CI** no se usa una clave real: el workflow genera una efímera en el propio job (no se commitea).

### Guard de servicio en `/api/internal/v1/*`

Las rutas internas que consume `saaspa-IA` se declaran con `@Public()` (para saltar el guard de sesión de
usuario), `@SkipThrottle()` y `@UseGuards(InternalAuthGuard)`. El guard exige, en este orden:

1. `X-Internal-Api-Key` con el valor de `INTERNAL_API_KEY` (comparación en tiempo constante; fallo cerrado
   si la variable está vacía).
2. `Authorization: Bearer <turn token>` válido: `kid` conocido, `alg` ES256 (rechaza el JWT de sesión
   HS256), `aud`/`iss` correctos y claims obligatorios presentes.
3. `tenantId` del token igual a `TENANT_ID` (si no, 403).

La identidad se lee **del token** con `@TurnContext()` (`@TurnContext('userId')`, …), nunca de la query ni
de argumentos generados por el modelo. Código en `src/modules/internal/`.

### Endpoints internos de lectura (Fase 1)

Contrato: `saaspa-IA/docs/contracts/internal-api.openapi.yaml`. Envuelven los servicios reales
(`ServicesService`, `BookingsService`), así que no hay lógica duplicada.

| Endpoint | Equivale a | Notas |
|---|---|---|
| `GET /api/internal/v1/services?page&limit&featured` | `GET /api/services/public` | Paginado, `isActive=true`, orden por nombre; `limit` 1..100 (default 20) |
| `GET /api/internal/v1/services/{id\|slug}` | `GET /api/services/public/:slug` | Acepta UUID o slug; no filtra `isActive` |
| `GET /api/internal/v1/availability?serviceId&date` | `GET /api/bookings/slots` | `serviceId` acepta UUID o slug; devuelve `{ serviceId, date, timezone, slots:[{start,end}] }` con **offset explícito** (`-05:00`) |

Detalles de forma:
- El repositorio expone la relación como `categoryRel`; el contrato interno la expone como `category`.
  El mapeo vive en `internal-services.controller.ts` y solo devuelve los campos del contrato.
- `availability` calcula el offset con `Intl`/ICU (`src/common/time/timezone.util.ts`), por lo que el
  resultado **no** depende del `tzdata` del contenedor; la zona sale de `TENANT_TIMEZONE`.
- `BookingsService.getAvailabilityWindow()` es la fuente única del cálculo de franjas: `getAvailability()`
  (endpoint público) es ahora un mapeo sobre él, así que ambos no pueden divergir.

### Escrituras de Fase 2 (ADR 0012): sujeto desde el turn token e idempotencia

- **El sujeto sale del token.** Todo endpoint interno de escritura resuelve `userId` con `@TurnContext()` /
  `@TurnContext('userId')` (el guard deja el payload verificado en `request.turn`) y el rol con
  `@TurnContext('role')`. Nunca del cuerpo, la query ni argumentos generados por el modelo (regla R1 de
  `saaspa-IA`). Un turno sin `userId` (canal anónimo) **no escribe**: `requireTurnUser(turn)` responde **403**
  (`src/modules/internal/turn-identity.ts`).
- **Mecanismo listo, sin endpoint todavía.** Cuando llegue el primer endpoint de escritura basta con
  `create(@TurnContext() turn: TurnTokenPayload, @Body() dto: …) { const subject = requireTurnUser(turn); … }`.
  El decorador y el helper están cubiertos por `turn-identity.spec.ts` (payload completo, un claim suelto,
  403 sin identidad y 403 si el guard no corrió).
- **Prueba que lo impide aguas arriba** (`internal-identity-contract.spec.ts`): descubre los controladores de
  `src/modules/internal/` desde el sistema de archivos (uno nuevo entra solo) y falla si un handler toma un
  nombre identitario (`userId`, `clientId`, `phone`, `role`, `tenantId`, `sessionKeyHash`, …) del cuerpo, la
  query, la ruta o una cabecera; si el esquema del cuerpo declara un campo identitario; o si un handler que
  recibe cuerpo no lee el turno. La prueba se autocomprueba con handlers de mentira que sí incumplen, para que
  no pueda pasar en vacío.
- **Idempotencia (ADR 0008 + ADR 0012 punto 4).** `POST /api/bookings` (y su variante admin) acepta la
  cabecera `Idempotency-Key`, que construye el llamador a partir de `jti` + operación: se guarda en
  `bookings.idempotencyKey` (columna única) y **un reintento con la misma clave devuelve la misma cita** sin
  crear otra. Detalles: la repetición se resuelve *antes* del tope de pendientes y del lock de Redis (un
  reintento no puede ser rechazado por el estado que creó la primera llamada); si la clave existe pero es de
  otro usuario → **409** (no se filtra una cita ajena); formato admitido `[A-Za-z0-9._:@-]{1,200}` → **400** si
  no encaja; sin cabecera no hay idempotencia, así que los canales que no la envían siguen igual. La atomicidad
  la da el índice único: si dos llamadas empatan, la que pierde devuelve la cita de la que ganó.

### Chat web (`POST /api/chat`) — Fase 1

Punto de entrada único del canal web (widget anónimo y clienta logueada). El frontend **nunca** habla con
`saaspa-IA`: este backend resuelve tenant, canal, agente e identidad, emite el turn token y llama a
`POST {IA_BOT_URL}/api/v1/chat`.

| Aspecto | Implementación |
|---|---|
| Cuerpo | solo `message.text` (≤1000) y `conversationId` opcional; el `ValidationPipe` global rechaza campos desconocidos (400) |
| Identidad | cookie de sesión (`kamerinos_access_token`, HS256) → canal `WEB_LOGGED`; ausente o caducada → anónimo y canal `WEB_WIDGET` (el canal `DASHBOARD` llega en la Fase 3) |
| `conversationId` | ausente → aleatorio de **128 bits** (32 hex) y se devuelve en la respuesta |
| Sesión anónima | cookie httpOnly `kamerinos_chat_session` con un id de **128 bits emitido por el servidor** y firmado (`<id>.<hmac>`); un valor fabricado o manipulado por el cliente se rechaza y el servidor emite uno nuevo. El estado guarda `sha256(sessionKey)`, así que un `conversationId` de otra sesión responde **403** |
| Handoff (A-10a) | `ChatConversationState.handoffActive`; mientras esté activo el backend responde el mensaje canónico **sin** llamar a la IA. Se cierra o se reabre desde el endpoint admin (ver «Handoff: aviso al salón y cierre/reapertura») |
| Anti-abuso | 20 req/min por IP (`@Throttle`), tope de 30 mensajes por sesión anónima en ventana de 1 h (**429**) y mensaje de más de 1000 caracteres (**413**) |
| Errores de la IA | `ProblemDetail` mapeado: 400 → 400, **429 → 429** (tope de coste de la IA, ADR 0010; se registra un aviso cuando el `scope` es `tenant`, señal de abuso o de tope por subir), 501 → 501, timeout → **504**, resto → **502** |
| Formato de error (J-07) | **RFC 9457** (`application/problem+json`): `type` (`about:blank`), `title`, `status`, `detail` (el texto de la IA o el nuestro) e `instance` (la ruta), más las extensiones del tope (`scope`, `measure`, `measured`, `limit`, `window`) cuando vienen. Lo aplica `ProblemDetailsFilter` **solo a los endpoints del chat**; el resto del API conserva la forma de Nest `{ statusCode, message, error }` |

Errores del chat (hallazgo J-07): los contratos describen los errores del chat como RFC 9457, pero el backend
respondía la forma por defecto de Nest (`{ statusCode, message, error }`) y, además, el `detail` de la IA llegaba
como `message` y sus extensiones (`scope`, `measure`, `measured`, `limit`, `window`) se perdían por el camino.
`ProblemDetailsFilter` (`src/common/filters/problem-details.filter.ts`) acota la forma RFC 9457 a los endpoints
del chat y `pickProblemExtensions` (`src/common/http/problem-extensions.ts`) es la **única** definición de qué
extensiones se copian, de modo que el widget puede distinguir un tope por conversación de uno por tenant o por
origen. Un error no-HTTP se responde **500** con `detail` genérico: el mensaje interno y el stack quedan en los
logs. El `AllExceptionsFilter` anterior (sin registrar y con una tercera forma distinta) se eliminó.

Anti-abuso y `trust proxy` (hallazgo J-03):

- `applyProxyTrust()` (`src/common/http/proxy-trust.ts`) fija `trust proxy` en **1 salto**: Express lee la
  entrada **derecha** de `X-Forwarded-For`, que es la que añade Nginx (`$proxy_add_x_forwarded_for`), y
  **ignora** el prefijo que pueda escribir el cliente. Con `true` leería la entrada izquierda (la del
  cliente) y el bucket del rate limit —y con él los logs y el AuditLog— quedarían a merced de una cabecera.
- La firma de la cookie de sesión anónima usa una clave derivada de `JWT_SECRET` (`deriveSessionKey`), así
  que el chat no necesita otra variable de entorno; sin secreto falla en cerrado.
- Cubierto por `src/common/http/__tests__/proxy-trust.spec.ts` (unidad),
  `src/modules/chat/__tests__/chat-session.spec.ts` (unidad) y `test/e2e/rate-limit.e2e-spec.ts` (el bucket
  no cambia cuando el cliente inyecta `X-Forwarded-For`).

> **Límite conocido:** el tope de 30 mensajes/hora se cuenta por conversación y la cookie es la única
> identidad anónima, así que quien borre la cookie obtiene una sesión nueva. El control efectivo del abuso
> anónimo es el límite por IP del `ThrottlerGuard`; un tope por identidad fuerte (cuenta o IP+sesión) es una
> tarea aparte.

Escalera de plazos de un turno (hallazgo J-04):

- Orden correcto: **backend > turn-deadline de `saaspa-IA` > read-timeout de un intento**. Números acordados
  hoy: **25 s > 20 s > 8-10 s**. Si el backend corta primero responde 504 mientras el asistente sigue
  trabajando (gasta tokens, puede llamar a la API interna tras una respuesta que ya nadie espera y puede dejar
  en su memoria un turno que la clienta nunca vio).
- `DEFAULT_IA_BOT_TIMEOUT_MS` (`chat.constants.ts`) es el techo del backend y `IA_BOT_TIMEOUT_MS` lo puede
  sobrescribir por entorno (mismo default). La relación la vigila `chat/__tests__/timeout-ladder.spec.ts`:
  baja el timeout del backend por debajo del deadline del asistente y la suite falla, incluido un test que fija
  los números acordados para que moverlos sea una decisión consciente y conjunta.

### Handoff del chat: aviso al salón y cierre/reapertura (J-05 / ADR 0013)

El handoff era un **latch permanente**: el backend guardaba `handoffActive`/`handoffReason`, nadie recibía el
aviso y nada permitía desactivarlo. Ahora:

- **Aviso por correo al salón.** Cuando el turno lo pide `saaspa-IA` se envía un correo interno a
  `SALON_NOTIFICATION_EMAIL` (si no está configurada, a `ADMIN_NOTIFY_EMAIL`) con el **motivo**, la
  **conversación**, el **turno**, el **mensaje que lo disparó** y **cómo cerrarlo**. Se eligió correo y no
  WhatsApp porque un mensaje saliente fuera de la ventana de 24 h exige plantilla aprobada por Meta, y el correo
  ya está integrado. El texto de la clienta se escapa antes de llegar al HTML.
- **El disparo queda persistido** en `chat_conversation_states`: `handoffMessage` (el texto), `handoffAt`
  (cuándo) y `handoffReason`; `handoffClosedAt` guarda cuándo se cerró, y **quién** lo cerró vive en el
  `AuditLog`.
- **El aviso sabe si se entregó y se reintenta (H-03).** `EmailService.send` y `sendHandoffNotification`
  devuelven un booleano, y `chat_conversation_states` guarda `handoffNotifiedAt` (solo cuando el proveedor
  aceptó el correo), `handoffNotifyError` (motivo corto si falló) y `handoffNotifyAttempts`. Mientras
  `handoffNotifiedAt` siga nulo, el **siguiente turno** de la conversación reintenta el aviso antes de
  responder el mensaje canónico: un correo caído ya no deja la conversación muerta para siempre. Una vez
  entregado no se vuelve a intentar. Sin scheduler: el reintento viaja en el turno de la clienta.
- **Cierre y reapertura por endpoint admin** (mismo patrón que `POST /bookings/admin`):
  `PATCH /api/chat/conversations/:id/handoff` con `{ "action": "close" }` o `{ "action": "reopen" }`
  (`ADMIN`/`EMPLEADO`). El interceptor global de auditoría registra acción, entidad (`chat`), `entityId` (el
  `conversationId`), actor e IP.
  - `close`: la persona ya atendió a la clienta → el handoff termina y **el bot vuelve a responder** ese hilo.
  - `reopen`: devolver la conversación a una persona (motivo `MANUAL_REOPEN`); no vuelve a avisar al salón,
    porque lo pidió una persona a propósito.
- **Sigue pendiente (J-02):** no hay endpoint del widget que consuma este estado ni vista visual de la
  conversación; este trabajo es de datos y notificación. La interfaz es tarea futura de `saaspa-frontend`.
  **Tampoco existe todavía una bandeja de lectura** («conversaciones derivadas sin cerrar / avisos no
  entregados»): se decidió no construir el consumidor antes de que exista quien lo necesite, igual que el
  resto de J-02; los datos ya están en `chat_conversation_states` para cuando haga falta.
- Cubierto por `chat/__tests__/chat.service.spec.ts`, `chat-conversation-state.repository.spec.ts`,
  `email.service.spec.ts`, `audit.interceptor.spec.ts` y el E2E `chat-handoff.e2e-spec.ts` (el handoff se activa
  → llega el aviso → se cierra por el endpoint → el bot responde otra vez; y, si el envío falla, el turno
  siguiente reintenta el aviso y lo registra).

Tabla `chat_conversation_states` (migración `20260926180000_add_chat_conversation_state`, más
`20260927120000_add_chat_handoff_detail` y `20260928120000_add_chat_handoff_notify_status`): `tenantId`
(default `kamerinos`), `conversationId` único, `channel`, `identityKind`, `userId`, `sessionKeyHash`,
`handoffActive`, `handoffReason`, `handoffMessage`, `handoffAt`, `handoffClosedAt`, `handoffNotifiedAt`,
`handoffNotifyError`, `handoffNotifyAttempts`, `lastTurnId`, `messageCount`, `lastMessageAt`.

> **Nota sobre `npm run test:e2e`:** requiere la base `kamerinos_db_tests` con las migraciones y el seed
> aplicados (`npx prisma migrate deploy && npx prisma db seed`, exportando `DATABASE_URL` con la credencial
> de tu `.env` y el nombre de esa base). Todos los specs aplican el prefijo global `api` igual que `main.ts`.
> Los specs `auth`/`users` dependen del admin sembrado (`admin123`, la credencial documentada).

## Ventana de pago y tope de reservas pendientes (triaje conjunto B-01)

Una cita se crea en `PENDIENTE_PAGO`, que hasta ahora **ocupaba la franja para siempre** si nadie pagaba
(`findOccupied` contaba como ocupada toda cita que no fuera `CANCELADA`/`NO_ASISTIO` y no existía ningún job
que la expirara). Ahora:

- **Ventana de pago configurable** (`BOOKING_PAYMENT_TTL_MINUTES`, default **30**). El número sale de dos
  datos: un checkout de Wompi se completa normalmente en 2-10 minutos y la agenda es una jornada de 8 horas,
  así que 30 minutos dan margen a una clienta lenta sin que una cita impaga se coma media tarde. El hold de
  Redis (`resolveSlotLockTtlSeconds`) cubre **toda la ventana más un intervalo del barrido** (35 min), no los
  10 minutos fijos que dejaban sin cubrir los últimos 20.
- **Regla perezosa (sin depender del job)**: `findOccupied`, `findOverlapping` y `findBySlot` aplican la misma
  condición (`occupancyFilter`), así que una cita `PENDIENTE_PAGO` creada **antes** del plazo deja de ocupar su
  franja en el instante en que vence, aunque el barrido todavía no haya corrido, y una `PAGO_TARDE` nunca
  ocupa franja. `findOccupied` y `findOverlapping` no pueden divergir: comparten cláusula.
- **Barrido periódico** (`PendingPaymentExpiryScheduler`, cada 5 minutos + una pasada al arrancar): mueve esas
  citas a **`EXPIRADA`** (`updateMany` condicionado a que sigan en `PENDIENTE_PAGO`, así que un pago que
  llegue a mitad del barrido gana), borra el evento de Google Calendar si lo tuviera y suelta el lock de Redis.
  Es idempotente y seguro con varias instancias. Se usa un `setInterval` con `unref()` en lugar de
  `@nestjs/schedule` porque el barrido no tiene semántica de calendario y el repo mantiene su conjunto de
  dependencias pequeño.
- **Tope por usuario** (`BOOKING_MAX_PENDING_PER_USER`, default **2**): `POST /api/bookings` responde **409** si
  el usuario ya tiene ese número de citas `PENDIENTE_PAGO` dentro de la ventana, para que una sola
  conversación no bloquee varias franjas antes de pagar ninguna. El camino administrativo
  (`POST /api/bookings/admin`) no lo consume: esas citas las crea el salón a propósito.
- **Carrera pago ↔ expiración (H-01)**: el webhook de un pago que llega después del vencimiento ya **no
  lanza** ni puede duplicar la franja. `BookingSyncService.confirmOnPayment` vuelve a comprobar la ventana y el
  solape (excluyendo la propia cita) y devuelve un desenlace explícito: `CONFIRMED` (en ventana y libre),
  `NEEDS_SLOT` (vencida y libre) o `NEEDS_REVIEW` (la franja ya la tomó otra cita, o la cita no era
  confirmable). Los dos últimos dejan la cita en **`PAGO_TARDE`** (pago aprobado, sin franja — la resuelve una
  persona: reagendar = asignar franja y confirmar, o cancelar y reembolsar), marcan el pago con
  `metadata.reviewRequired`/`reviewReason`, avisan **a la clienta** y **al salón** por correo (J-05/ADR 0013) y
  dejan un `AuditLog` (`PAYMENT_LATE_WINDOW_CLOSED` / `PAYMENT_LATE_SLOT_TAKEN`). El atajo de «webhook
  duplicado» solo corta si el desenlace ya quedó registrado (`metadata.paymentOutcome`), así que un intento que
  murió a mitad se reintenta. `manualPayment` comparte el mismo camino.
- Cubierto por `bookings.repository.spec.ts`, `bookings.service.spec.ts`, `booking-sync.service.spec.ts`,
  `payments.service.spec.ts`, `pending-payment-expiry.scheduler.spec.ts` y `email.service.spec.ts` (unidad)
  más `test/e2e/pending-payment-expiry.e2e-spec.ts` y `test/e2e/late-payment-race.e2e-spec.ts` (HTTP + BD real:
  la franja se libera, la cita queda `EXPIRADA` o `PAGO_TARDE`, el tope responde 409 y un pago tardío nunca
  confirma una segunda cita).

---

## Módulos (orden de implementación)

| # | Módulo      | Estado       | Endpoints                                  |
|---|-------------|-------------|--------------------------------------------|
| 1 | Auth        | **Completo** | `POST /api/auth/register`, `/login`, `/refresh`, `/logout` (**cookies httpOnly**: access `Path=/`, refresh `Path=/api/auth`), `/forgot-password`, `/reset-password`, `GET /verify-email/:token` (idempotente), `POST /auth/email-change/request` + `/confirm` (cambio de email con código) |
| 2 | Users       | **Completo** | `GET /me`, `PATCH /me`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| 3 | Services    | **Completo** | `GET /`, `GET /public` (+ `?featured=true`), `GET /public/:slug`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` — slug único; `mainImage`, `carouselImages`, `isFeatured`, `compareAtPrice` |
| 4 | Bookings    | **Completo** | `GET /`, `GET /slots`, `GET /:id`, `POST /`, `POST /admin`, `PATCH /:id/confirm`, `PATCH /:id/cancel`, `PATCH /:id/complete`, `PATCH /:id/reopen`, `PATCH /:id/reschedule`, `GET /:id/balance`, `POST /admin/sync-calendar` — bloqueo GLOBAL de horarios (agenda única), completa solo con saldo pagado, Google Calendar síncrono con reintento (`calendarSync`), **ventana de pago con expiración automática a `EXPIRADA` y tope de pendientes por usuario** (ver «Ventana de pago y tope de reservas pendientes») |
| 5 | Payments    | **Completo** | `POST /init` (ABONO/SALDO, `payFull` opcional, captura IP/User-Agent del cliente), `POST /init-cart` (con `fbc`/`fbp`/`eventId` + `shippingNit`), `POST /webhook` (idempotente; dispara Meta CAPI Purchase: e-commerce siempre, citas **solo ABONO**), `POST /manual` (efectivo/transferencia), `GET /transactions` (admin, trazabilidad con filtros), `GET /revenue?month=` (admin), `GET /:bookingId/status`. **Pasarela abstraída** tras `IPaymentProvider` (`modules/payments/providers/`), con implementación Wompi (`wompi.payment-provider.ts`) |
| 6 | Categories  | **Completo** | `GET /` (includeInactive), `GET /tree`, `GET /:slug`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| 7 | Products    | **Completo** | `GET /` (público + filtros), `GET /admin/all`, `GET /:slug`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| 8 | Cart        | **Completo** | `GET /`, `POST /items`, `PATCH /items/:productId`, `DELETE /items/:productId`, `DELETE /`, `POST /merge` |
| 9 | Coupons     | **Completo** | CRUD + `POST /validate` + `GET /:id/usages` — límites de uso y trazabilidad por usuario |
| 10| Calendar    | **Completo** | Google Calendar sync (common/google-calendar) |
| 11| Meta        | **Completo** | Meta CAPI (Schedule + Purchase — citas **solo ABONO** (SALDO no dispara), e-commerce en webhook de carrito; `fbc`/`fbp` + `event_id` dedup, `client_ip_address`/`client_user_agent`) |
| 12| Email       | **Completo** | SendGrid transaccional — welcome/verificación, password reset, booking receipt, payment receipt, order receipt y order status (replyTo configurable) |
| 13| Health      | **Completo** | `GET /api/health` — DB + Redis check |
| 14| Upload      | **Completo** | `POST /api/upload` — multer + **sharp**: resize 1600px + **WebP q80** + auto-orientación; límite 10 MB; folders genéricos (`products/<slug>`, `services/<slug>`, `banners`) |
| 21| Banners      | **Completo** | CRUD admin + `GET /banners/public?position=HERO|STRIP` — campañas de temporada en el home |
| 15| Throttler   | **Completo** | Rate limiting global (100 req/min) |
| 16| Orders      | **Completo** | `GET /` (admin, con filtros: search/status/dateFrom/dateTo), `GET /my` (cliente), `PATCH /:id/status` (admin) — auto-creados desde webhook de pago de carrito + emails de estado |
| 17| Whatsapp    | **Completo** | `GET/POST /api/whatsapp/webhook` — verificación (GET: hub.mode + hub.verify_token → 200 + challenge / 403) + recepción (POST → 200) + recepcionista con menú interactivo (ConversationState). IA conversacional pendiente en `saaspa-IA` |
| 18| Audit       | **Completo** | `GET /audit-logs` (admin) — registro de mutaciones vía interceptor global |
| 19| Chat        | **Fase 1 completa** | `POST /api/chat` (público) — resuelve canal/identidad, emite el turn token, llama a `saaspa-IA`, mantiene el estado del handoff por conversación (A-10a) y aplica anti-abuso. Ver la sección "Chat web" |

> **Paginación:** Todos los endpoints `GET /` list retornan `PaginatedResult<T>` con `{ data, total, page, limit, totalPages }`. Default limit: 20. Los repositorios usan `Promise.all([findMany({ skip, take }), count()])` en paralelo.

> **Producción (un solo dominio):** `https://kamerinos.sandrapinzonsaludybelleza.com.co` sirve frontend + backend vía proxy `/api/*` en Nginx. Webhook WhatsApp: `https://kamerinos.sandrapinzonsaludybelleza.com.co/api/whatsapp/webhook` (verify token `kamerinos_webhook_2026`).

## Modelo de Datos

```
User (users)
├── email (unique), passwordHash, firstName, lastName
├── phone?, birthday?, description? (Text)
├── role: CLIENTE | EMPLEADO | ADMIN
├── isActive, refreshToken
├── → bookings, payments, coupons, cartItems

Service (services)
├── name, slug (unique), description?, price (Decimal), duration (min)
├── categoryId?, imageUrl?, isActive
├── → bookings

Category (categories)
├── name, slug (unique), description?, imageUrl?
├── parentId? (self-reference para subcategorías)
├── isActive
├── → services, products, children (subcategorías)

Product (products)
├── name, slug (unique), description? (Text), price (Decimal)
├── compareAtPrice? (Decimal), stock, sku? (unique)
├── mainImage?, carouselImages? (JSON), sponsor?
├── isActive, isFeatured, categoryId?
├── → cartItems

Booking (bookings)
├── userId → User, serviceId → Service
├── startTime, endTime, status: PENDIENTE_PAGO → CONFIRMADA → COMPLETADA
│   (+ CANCELADA, NO_ASISTIO y EXPIRADA: la franja queda libre con cualquiera de los cuatro)
├── googleEventId?, notes?
├── → payments (1:N)

Payment (payments)
├── bookingId → Booking, userId → User
├── amount (Decimal), type: ABONO | SALDO
├── status: PENDIENTE → APROBADO | RECHAZADO | REEMBOLSADO
├── paymentMethod?: WOMAPI | EFECTIVO | TRANSFERENCIA
├── wompiPaymentId?, wompiReference?, metadata? (JSON)
├── paidAt?

CartItem (cart_items)
├── userId → User, productId → Product
├── quantity
├── @@unique([userId, productId])

Order (orders)
├── userId → User, paymentId? → Payment
├── total (Decimal), status: PENDIENTE → CONFIRMADO → ENVIADO → ENTREGADO | CANCELADO
├── shippingName, shippingEmail, shippingPhone, shippingAddress, shippingCity, shippingState?, shippingNit?, shippingNotes?
├── → items (OrderItem[])

OrderItem (order_items)
├── orderId → Order, productId → Product
├── name, price (Decimal), quantity (snapshot al momento de compra)

Coupon (coupons)
├── code (unique), discount (Decimal 5,4)
├── isActive, maxUses?, usedCount, perUserLimit, expiresAt, userId? → User
├── usages (CouponUsage[])

CouponUsage (coupon_usages)
├── couponId → Coupon, userId → User, orderId?, usedAt
├── @@unique([couponId, userId]) — una vez por usuario

AuditLog (audit_logs)
├── actorId?, actorEmail?, action, entity, entityId?, ip?, createdAt

ConversationState (conversation_states)
├── waId (unique), state (JSONB)

ResetToken (reset_tokens)
├── email, token (unique), expiresAt
```

### Índices de Base de Datos

| Modelo | Índices | Propósito |
|--------|---------|-----------|
| Booking | `@@index([userId, status])`, `@@index([startTime])`, `@@index([serviceId, startTime])` | Cliente filtrando por estado, ordenamiento por fecha, búsqueda de slots |
| Payment | `@@index([bookingId])`, `@@index([status, createdAt])` | Pagos por cita, revenue/facturación por mes |
| AuditLog | `@@index([entity, entityId])`, `@@index([createdAt])` | Consultas de auditoría por entidad y fecha |

## Módulo de Recuperación de Contraseña

El módulo Auth incluye recuperación self-service:
1. `POST /api/auth/forgot-password` — recibe `{ email }`, genera token temporal (1h), envía email vía SendGrid si `SENDGRID_API_KEY` está configurado, o loguea la URL en consola
2. `POST /api/auth/reset-password` — recibe `{ token, newPassword }`, valida token, actualiza contraseña

Las migraciones se aplican en el arranque del contenedor de producción (`Dockerfile`: `npx prisma migrate deploy && node dist/main`).
En desarrollo local, aplicar migraciones manualmente:

```bash
npx prisma migrate dev --name <descripcion>   # crea la migración a partir de schema.prisma
npx prisma migrate deploy                      # aplica migraciones pendientes
npm run start:dev                              # levanta la API (seed si RUN_SEED=true)
```

### Prisma en la imagen Docker (alpine)

- La imagen final es `node:20-alpine`. El generator de `schema.prisma` incluye
  `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` para que el Query
  Engine del cliente cargue correctamente (con `openssl` instalado en la imagen).
- `ts-node` y `typescript` están en **`dependencies`** (no devDependencies):
  `npm prune --production` los eliminaría y el seed (`npx ts-node prisma/seed.ts`)
  no correría en producción.
- El `Dockerfile` copia **`tsconfig.json`** a la imagen final: `ts-node` lo
  necesita para compilar `seed.ts` (target ES2021, soporta `async/await`).
- El volumen de uploads (`/app/uploads`) se crea con `chown node:node` y los
  directorios de Prisma (`node_modules/@prisma`, `.prisma`) quedan escribibles
  por el usuario `node` (no-root).

## Auto-Seed (RUN_SEED)

El seed solo se ejecuta si `RUN_SEED=true` en el `.env` **y** el admin no existe en la DB.
Así se protege producción: si no está definida la variable, no se ejecuta.

```bash
# .env (desarrollo)
RUN_SEED=true

# .env.test (tests E2E)
RUN_SEED=false

# Producción: NO definir la variable (o false)
```

El seed usa `upsert` en `prisma/seed.ts`, así que es idempotente:
- Crea admin `admin@sandrapinzonsaludybelleza.com.co` / `admin123` si no existe
- Crea 8 categorías (Masajes, Faciales, Uñas, Depilación, Corporal, Cremas, Sérums, Mascarillas)
- Crea 8 servicios con `categoryId` FK apuntando a las categorías
- Crea 8 productos con `slug`, `sku`, `sponsor`, `categoryId` FK
- Si ya existen los datos, no duplica nada (usa `upsert`)

## Logging de Requests

`src/common/interceptors/logging.interceptor.ts` loguea cada request HTTP en consola
(format: `método URL statusCode duración - ip`). Registrado como `APP_INTERCEPTOR` global:

```
[Nest] LOG [HTTP] POST /api/auth/login 201 45ms - ::1
[Nest] LOG [HTTP] GET /api/users 200 12ms - ::1
[Nest] WARN [HTTP] GET /api/users/me 401 8ms - ::1
```

Es una clase `@Injectable()` reusable: si en el futuro se necesita enviar logs a
CloudWatch/Datadog, se inyecta un servicio de logging dentro del interceptor.

## Autenticación y Logout

### Ciclo de vida de tokens

```
Login/Register ──► accessToken (15m) + refreshToken (1d, guardado en DB)
                         │
Refresco ──► refreshToken válido ──► nuevos tokens (rotación)
                         │
Logout ──► accessToken → blacklist en Redis (TTL = tiempo restante)
           refreshToken → se limpia de la DB (ya no se puede rotar)
```

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Crear usuario + tokens |
| POST | `/api/auth/login` | Autenticar + tokens |
| POST | `/api/auth/refresh` | Rotar tokens (lee la cookie httpOnly `kamerinos_refresh_token`) |
| POST | `/api/auth/logout` | Invalidar tokens (lee cookies httpOnly y las limpia) |

### Cómo funciona el logout (Token Blacklist)

1. **`TokenBlacklistService`** (`src/common/redis/token-blacklist.service.ts`) guarda el
   accessToken en Redis con `EX` (expiración = tiempo de vida restante del token).
   Redis lo elimina automáticamente al expirar.
2. El refreshToken se limpia de la columna `users.refreshToken` en la DB.
3. **`JwtAuthGuard`** verifica en cada request si el token está en la blacklist →
   devuelve 401 si fue revocado.

### Redis

- `src/common/redis/redis.service.ts` — wrapper de ioredis con `lazyConnect` y
  degradación elegante: si Redis no está disponible, la API sigue funcionando
  (el logout no crashea, y el blacklist check devuelve `false`).
- Variables: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (default: localhost:6379).

## Arquitectura (SOLID + Repository Pattern)

```
Controller → Service → Repository Interface (abstract class) ← Repository (Prisma)
                ↕
          TokenService (JWT)
```

| Capa | Ubicación | Responsabilidad |
|------|-----------|-----------------|
| Controller | `src/modules/*/` | HTTP, DTOs, delega al Service |
| Service | `src/modules/*/` | Lógica de negocio, depende de abstracciones |
| Repository Interface | `src/repositories/interfaces/` | Contrato (`IUsersRepository` abstract class) |
| Repository | `src/repositories/` | Implementación concreta con PrismaService |

**Principios SOLID aplicados:**
- **S**: AuthService delega tokens a TokenService, repositorio maneja solo data access
- **O**: Interfaces abstractas permiten extender sin modificar
- **D**: Services dependen de `IUsersRepository`, no de `PrismaService` directamente

## Tests

```bash
npm test              # Unit tests (512 tests, 61 suites) — no requiere BD
npm run test:cov      # Cobertura
npm run test:e2e      # E2E (requiere PostgreSQL corriendo)
```

### Configuración optimizada

El `jest` config en `package.json` incluye `maxWorkers: 2` y `ts-jest` con `isolatedModules: true` para evitar consumo excesivo de RAM en desarrollo (~500-800 MB vs ~3-4 GB sin optimizar). Ver `docs-general/TEST-COVERAGE.md` para el plan completo.

### Comandos seguros

```bash
npx jest --runInBand --no-cache      # 1 worker, sin caché (~1 min)
npm test                              # 2 workers (recomendado)
```

### Bases de datos por entorno

| Archivo | Base de datos | Cuándo se usa |
|---------|---------------|---------------|
| `.env` | `kamerinos_db` | Desarrollo (`npm run start:dev`) |
| `.env.test` | `kamerinos_db_tests` | E2E tests (`npm run test:e2e`) |
| VPS/Docker | `kamerinos_db` | Producción |

> **Nota de archivos:** `@nestjs/config` (`config.module.ts`) carga **solo `.env`**
> (`envFilePath: ['.env']`). No existe `.env.local`. Ver `docs-general/ENV.md`.

### Variables de integración por entorno (anti-contaminación)

En **dev**, `.env` usa valores de **prueba** para no afectar producción:

| Variable | Dev (`.env`) | Prod (Docker) |
|----------|-------------|---------------|
| `WOMPI_*` | **Sandbox** (`pub_test_` / `prv_test_` / `test_events_` / `test_integrity_`) | Reales (`pub_prod_` / `prv_prod_` / `prod_events_` / `prod_integrity_`) |
| `META_CAPI_PIXEL_ID` / `META_CAPI_ACCESS_TOKEN` | **vacías** → CAPI apagado | Reales |
| `META_WHATSAPP_*` | **vacías** | Reales |
| `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY` | **vacías** → sync omitido | Reales |
| `SENDGRID_API_KEY` | **vacía** → emails en consola | Reales |

Los servicios ya omiten envíos si la credencial está vacía (`MetaCapiService`,
`EmailService`, `GoogleCalendarService`). Las credenciales reales **solo** viven
en `kamerinos-infra/.env` (producción).

El flujo de E2E:
1. `test/e2e/setup.ts` (Jest `setupFiles`) carga `.env.test` ANTES de que `@nestjs/config` lea `.env`. Como dotenv no sobreescribe variables existentes en `process.env`, `DATABASE_URL` apunta a `kamerinos_db_tests`.
2. Cada test E2E ejecuta `npx prisma migrate deploy` en `beforeAll` contra la BD de tests.
3. Los datos de prueba se limpian con `DELETE FROM` en `beforeEach`.

> **Importante:** `kamerinos_db_tests` solo contiene datos de prueba. Nunca apuntar los E2E a la BD real.

### Inventario de suites (64 suites, 555 tests)

| Capa | Suites | Tests |
|------|--------|-------|
| Services | auth, users, services, bookings, payments, coupons, categories, products, cart, meta, email, google-calendar | ~150 |
| Controllers | auth, users, services, bookings, payments, coupons, categories, products, cart, health, upload | ~50 |
| Repositories | users, bookings, products, cart, payments, categories, services, coupons | ~55 |
| Guards | jwt-auth, roles | ~9 |
| Internal (IA) | turn-token, internal-auth, internal controllers, guards metadata | ~44 |
| Chat (IA) | chat service/controller, ia-bot client, chat state repository | ~34 |
| Redis | redis, token-blacklist | ~8 |
| HTTP | `applyProxyTrust` (\`trust proxy\` = 1 salto, hallazgo J-03), `resolveClientIp` (fuente única de la IP del cliente) y `pickProblemExtensions` (extensiones del `ProblemDetail` que viajan al widget) | 10 |
| Filtros | `ProblemDetailsFilter`: errores del chat en RFC 9457 (`application/problem+json`, J-07) | 5 |
| Chat session | emisión, firma y validación del id de sesión anónimo | 11 |
| Chat timeouts | escalera de plazos backend > IA (J-04) | 4 |
| Chat handoff | aviso al salón, entrega/reintento, cierre/reapertura y auditoría (J-05, H-03) | 14 |
| Audit | interceptor: actor, entidad e `entityId` | 5 |
| Scheduler | barrido de expiración de `PENDIENTE_PAGO` | 4 |
| Internal identity | contrato arquitectónico + `@TurnContext`/`requireTurnUser` (ADR 0012) | 17 |
| Config | `envValidationSchema` (Joi, fallo cerrado en producción) | 11 |
| E2E | auth, users | ~19 |
