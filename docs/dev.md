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
npm run start:dev        # Levanta en :3001 (aplica migraciones + seed si RUN_SEED=true)
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

## Módulos (orden de implementación)

| # | Módulo      | Estado       | Endpoints                                  |
|---|-------------|-------------|--------------------------------------------|
| 1 | Auth        | **Completo** | `POST /api/auth/register`, `/login`, `/refresh`, `/forgot-password`, `/reset-password`, `/logout` |
| 2 | Users       | **Completo** | `GET /me`, `PATCH /me`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| 3 | Services    | **Completo** | `GET /`, `GET /public`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| 4 | Bookings    | **Completo** | `GET /`, `GET /slots`, `GET /:id`, `POST /`, `POST /admin`, `PATCH /:id/confirm`, `PATCH /:id/cancel`, `PATCH /:id/complete`, `PATCH /:id/reschedule`, `GET /:id/balance` |
| 5 | Payments    | **Completo** | `POST /init` (ABONO/SALDO), `POST /init-cart`, `POST /webhook`, `POST /manual` (efectivo/transferencia), `GET /transactions` (admin, trazabilidad con filtros), `GET /revenue?month=` (admin), `GET /:bookingId/status` |
| 6 | Categories  | **Completo** | `GET /`, `GET /tree`, `GET /:slug`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| 7 | Products    | **Completo** | `GET /` (público + filtros), `GET /admin/all`, `GET /:slug`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| 8 | Cart        | **Completo** | `GET /`, `POST /items`, `PATCH /items/:productId`, `DELETE /items/:productId`, `DELETE /`, `POST /merge` |
| 9 | Coupons     | **Completo** | CRUD cupones + validación |
| 10| Calendar    | **Completo** | Google Calendar sync (common/google-calendar) |
| 11| Meta        | **Completo** | Meta CAPI (Schedule + Purchase) |
| 12| Email       | **Completo** | SendGrid transaccional (booking receipt + payment receipt) |
| 13| Health      | **Completo** | `GET /api/health` — DB + Redis check |
| 14| Upload      | **Completo** | `POST /api/upload` — imágenes con multer |
| 15| Throttler   | **Completo** | Rate limiting global (100 req/min) |
| 16| Orders      | **Completo** | `GET /` (admin, con filtros: search/status/dateFrom/dateTo), `GET /my` (cliente), `PATCH /:id/status` (admin) — auto-creados desde webhook de pago de carrito |
| 17| Whatsapp    | Pendiente   | Meta API, IA Bot |

## Modelo de Datos

```
User (users)
├── email (unique), passwordHash, firstName, lastName
├── phone?, birthday?, description? (Text)
├── role: CLIENTE | EMPLEADO | ADMIN
├── isActive, refreshToken
├── → bookings, payments, coupons, cartItems

Service (services)
├── name, description?, price (Decimal), duration (min)
├── category?, categoryId?, imageUrl?, isActive
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
├── shippingName, shippingEmail, shippingPhone, shippingAddress, shippingCity, shippingNotes?
├── → items (OrderItem[])

OrderItem (order_items)
├── orderId → Order, productId → Product
├── name, price (Decimal), quantity (snapshot al momento de compra)

Coupon (coupons)
├── code (unique), discount (Decimal 5,4)
├── isUsed, expiresAt, userId? → User

ConversationState (conversation_states)
├── waId (unique), state (JSONB)

ResetToken (reset_tokens)
├── email, token (unique), expiresAt
```

## Módulo de Recuperación de Contraseña

El módulo Auth incluye recuperación self-service:
1. `POST /api/auth/forgot-password` — recibe `{ email }`, genera token temporal (1h), envía email vía SendGrid si `SENDGRID_API_KEY` está configurado, o loguea la URL en consola
2. `POST /api/auth/reset-password` — recibe `{ token, newPassword }`, valida token, actualiza contraseña

El `main.ts` ejecuta `npx prisma migrate deploy` automáticamente antes de levantar la API.
Esto aplica las migraciones pendientes sin generar nuevas. Para crear nuevas migraciones:

```bash
npx prisma migrate dev --name <descripcion>   # crea la migración a partir de schema.prisma
npm run start:dev                              # auto-aplica la migración al arrancar
```

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
- Crea admin `admin@kamerinosspa.com` / `admin123` si no existe
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
Login/Register ──► accessToken (15m) + refreshToken (7d, guardado en DB)
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
| POST | `/api/auth/refresh` | Rotar tokens (body: refreshToken) |
| POST | `/api/auth/logout` | Invalidar tokens (header Bearer + body refreshToken) |

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
npm test              # Unit tests (241 tests, 36 suites) — no requiere BD
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

El flujo de E2E:
1. `test/e2e/setup.ts` (Jest `setupFiles`) carga `.env.test` ANTES de que `@nestjs/config` lea `.env`. Como dotenv no sobreescribe variables existentes en `process.env`, `DATABASE_URL` apunta a `kamerinos_db_tests`.
2. Cada test E2E ejecuta `npx prisma migrate deploy` en `beforeAll` contra la BD de tests.
3. Los datos de prueba se limpian con `DELETE FROM` en `beforeEach`.

> **Importante:** `kamerinos_db_tests` solo contiene datos de prueba. Nunca apuntar los E2E a la BD real.

### Inventario de suites (36 suites, 241 tests)

| Capa | Suites | Tests |
|------|--------|-------|
| Services | auth, users, services, bookings, payments, coupons, categories, products, cart, meta, email, google-calendar | ~150 |
| Controllers | auth, users, services, bookings, payments, coupons, categories, products, cart, health, upload | ~50 |
| Repositories | users, bookings, products, cart, payments, categories, services, coupons | ~55 |
| Guards | jwt-auth, roles | ~9 |
| Redis | redis, token-blacklist | ~8 |
| E2E | auth, users | ~19 |
