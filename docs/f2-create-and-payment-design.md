# Fase 2 (lado del backend): creación de cita por chat y deep-link de pago

**Estado:** diseño aceptado por la persona el 2026-09-28, **sin implementar**. Este documento fija las
decisiones ya tomadas para que la implementación (ramas `feature/*` propias) no las reabra, y deja
explícitas las que siguen abiertas.

**Contexto:** tercera revisión conjunta de integración
(`saaspa-IA/docs/reviews/2026-09-28-joint-integration-review-3.md`, secciones 5 y 6), ADR 0008/0012/0016/0017
de `saaspa-IA` y el mecanismo de identidad ya probado en este repo (`requireTurnUser`, turn token ES256).
Lo que ya existe y no se duplica: `misCitas` (`GET /api/internal/v1/me/bookings`, PR #87), la idempotencia
del público (`bookings.idempotencyKey`, índice único), la ocupación que excluye `EXPIRADA`/`PAGO_TARDE`
(`occupancyFilter`), el tope de pendientes por usuario (`BOOKING_MAX_PENDING_PER_USER`, default 2) y las dos
pruebas arquitectónicas que cubren cualquier controlador interno nuevo.

---

## 1. `paymentUrl` — opción A: enlace firmado de vida corta a una página del frontend

Decisión de la persona (elección A entre las tres presentadas: enlace firmado, links de pago de Wompi,
pago asistido por el salón).

- **Qué es:** el backend emite `paymentUrl = ${FRONTEND_BASE_URL}/pago?booking=<bookingId>&exp=<unix>&sig=<hmac>`.
  La página nueva del frontend lee esos parámetros y llama a un endpoint público del backend que devuelve la
  **config del widget existente** (`PaymentWidgetConfig`); el dinero sigue el único camino actual
  (widget + webhook, sin tocar el proveedor).
- **Firma y separación de dominio:** `hmac = HMAC-SHA256(k, booking|exp)` con `k` derivada de `JWT_SECRET`
  por una **etiqueta distinta** a la de `chat-session` (derivación por etiqueta: la clave del enlace de pago
  nunca sirve para fabricar sesiones del chat ni al revés). Igual patrón que `kamerinos_chat_session`, con
  etiqueta propia.
- **TTL:** igual a la ventana de pago (`BOOKING_PAYMENT_TTL_MINUTES`, default 30). `exp` viaja en el enlace
  y se verifica; un enlace vencido responde **410** (o 404; a fijar en implementación) y el bot reenvía a
  `/agendar` o reagenda.
- **Endpoint público nuevo:** `POST /api/payments/link-checkout` (nombre tentativo) que solo acepta el
  `sig` válido y no vencido y **solo devuelve la config si la cita sigue `PENDIENTE_PAGO`**; en cualquier
  otro estado responde error estable (la cita ya se confirmó, expiró o es `PAGO_TARDE`). Conviene que
  devuelva también el `reference` para que el frontend pinte el widget sin otra llamada.
- **Throttle propio:** el endpoint es público y lleva su propio `@Throttle` (no hereda el bucket del chat).
- **El enlace es reenviable, y se acepta a propósito:** cualquiera con el enlace puede *pagar* esa cita.
  El dinero entra igual al salón por la cita de la clienta, la ventana es de 30 minutos y el estado de la
  cita es la única llave real. No lleva PII: `bookingId` opaco + `exp` + `sig`.
- **Pedidos que esto genera** (anotados en `AGENTS.md` §9):
  - `saaspa-frontend`: página `/pago` que lee `booking`/`exp`/`sig` y arranca el widget con la config del
    endpoint público.
  - `kamerinos-infra`: `FRONTEND_BASE_URL` en el servicio `backend` (URL pública del frontend, no la interna
    del compose).
  - `saaspa-IA`: cuando su sesión actualice el contrato, `Booking.paymentUrl` (schema `uri`, nullable) pasa
    a existir de verdad: lo produce el `POST /api/internal/v1/bookings` y puede caducar (la IA no debe
    cachearlo ni reenviarlo en turnos posteriores; debe pedir uno nuevo).

## 2. `POST /api/internal/v1/bookings` (crearCita)

- **Sujeto:** `@TurnContext()` + `requireTurnUser` — **403** si el turno es anónimo. El primer camino real
  es una clienta logueada (`WEB_LOGGED`); el widget anónimo sigue recibiendo el enlace pre-diligenciado a
  `/agendar` (Hermes §5.3.1).
- **`Idempotency-Key`:** la construye **el llamador** (`saaspa-IA`) con el formato acordado
  **`bookings.create:<jti>`** — el backend nunca la deriva (R1 de ADR 0012; ya documentado en `docs/dev.md`
  como `jti` + operación). Semántica: dedup de reintentos **dentro** del turno. Entre turnos no hay dedup por
  diseño: el freno es el chequeo de solape (**409**), fijado por el test-guarda E2E del PR #87 (dos
  `create()` secuenciales al mismo slot con claves distintas → el segundo responde 409).
- **Validación de `startTime`, tres capas:**
  1. **Offset explícito:** ISO 8601 con offset UTC obligatorio (lo que `/availability` devuelve). Un
     timestamp sin offset responde **400**; nunca se interpreta con `TENANT_TIMEZONE` en silencio.
  2. **Coherencia del offset:** el offset recibido debe igualar el offset real de la zona del tenant en ese
     instante (misma maquinaria `Intl`/ICU de `toOffsetIso`). Si no → **400**. Esto neutraliza R-06.b en la
     frontera de escritura aunque el lado IA mantenga su política de "avisar, no fallar" al leer.
  3. **Pertenencia al slot:** la fecha local (zona del tenant) del `startTime` debe ser uno de los slots de
     `getAvailabilityWindow(serviceId, date)`. Valida horario laboral (8-18), grilla de 30 min y re-chequea
     ocupación en el instante de la escritura, en una sola consulta. Si no → **409** (franja ya no libre) o
     **400** (hora imposible, p. ej. 10:17), a fijar en implementación.
- **Creación:** delega en `BookingsService.create(subject.userId, dto, { idempotencyKey })`, que ya aporta:
  replay por clave única antes del tope y del lock, tope de 2 pendientes (**409**), chequeo de solape
  (**409**), hold de Redis y `PAGO_TARDE`/`EXPIRADA` excluidos de la ocupación.
- **`payFull`: NO en v1.** Se ignora si llega (el campo es opcional en el contrato); el abono se define en el
  inicio de pago, no en la creación.
- **AuditLog:** toda escritura interna deja constancia con el **`userId` del turno** y el
  **`conversationId`** (quién pidió la escritura y desde qué conversación; hoy las llamadas internas no
  auditan — hueco heredado de Fase 1 anotado por Hermes §6).
- **409 con código estable** (propuesta de nombres, decisión de implementación con la persona si prefiere
  otros): los 409 del endpoint llevan un campo de máquina para que la IA distinga la causa y elija el texto
  correcto para la clienta:
  - Solape / franja tomada: **`SLOT_TAKEN`**
  - Tope de pendientes por usuario: **`PENDING_CAP_REACHED`**

  El campo viaja aditivo en la forma Nest de los endpoints internos (`{ statusCode, message, error, code }`);
  la sesión de IA lo recoge en el contrato cuando lo escriba.
- **Respuesta:** la cita (misma proyección que `me/bookings`) más `paymentUrl` (punto 1).

## 3. Cancelar una cita `EXPIRADA` se rechaza, con código estable

Hoy `BookingsService.cancel` acepta una cita `EXPIRADA` y la convierte en `CANCELADA` (pierde el matiz de
"venció por falta de pago"; `reschedule` ya la rechaza). Antes de construir `cancelarCita`, el backend rechaza
cancelar una `EXPIRADA` con **código estable `BOOKING_EXPIRED`** (propuesta de nombre), para que el bot
explique que la franja ya se liberó y ofrezca agendar de nuevo. Lo mismo aplica a `PAGO_TARDE`: su
resolución es reagendar o reembolsar, decisión manual del salón (H-01), no una cancelación silenciosa por
chat.

## 4. La carrera concurrente de `create()` — decisión pendiente, antes de `crearCita`

Verificado en la revisión del 2026-09-28: entre el `findOverlapping` y el INSERT no hay serialización (el
`setex` del slot en `create()` es incondicional, no un `SET NX`), así que dos turnos **simultáneos** al mismo
slot pueden pasar los dos el chequeo y crear dos `PENDIENTE_PAGO`. El daño está acotado por H-01 (el segundo
pago acaba en `PAGO_TARDE`, nunca dos `CONFIRMADA`), pero es un duplicado con decisión manual de por medio.

**Inclinación registrada (no decisión): constraint de exclusión en Postgres** — `btree_gist` + `tstzrange`
sobre `startTime`/`endTime` con predicado de los estados que ocupan franja, que además protege el
`POST /api/bookings` público. Alternativa: `SET NX` real en el hold del slot. Se decide antes de abrir la
rama de `crearCita`; mientras tanto queda documentado como conocido.

## 5. Pedidos a otros repos que este diseño deja anotados

Registrados en `AGENTS.md` §9; desde este repo no se tocan:

- **`saaspa-frontend`:** página `/pago` (lee `booking`/`exp`/`sig`, llama al endpoint público, pinta el
  widget de Wompi) y, más adelante, el consumidor de `EXPIRADA`/`PAGO_TARDE` del dashboard (H-06).
- **`kamerinos-infra`:** `FRONTEND_BASE_URL` en el servicio `backend`.
- **`saaspa-IA`:** cuando su sesión escriba el contrato: schema de `POST /api/internal/v1/bookings`
  (incluida la `Idempotency-Key` **obligatoria** con formato `bookings.create:<jti>`, las tres capas de
  validación, el campo aditivo `code` de los 409 con `SLOT_TAKEN`/`PENDING_CAP_REACHED`, el `BOOKING_EXPIRED`
  de la cancelación y `Booking.paymentUrl` con su vida corta); y corregir de paso la nota falsa de
  `internal-api.openapi.yaml` que dice que `POST /api/bookings` no acepta `Idempotency-Key` (HN-02 de la
  tercera revisión, falso desde el PR #78).
