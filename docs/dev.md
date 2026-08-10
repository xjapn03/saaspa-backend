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
| 1 | Auth        | **Completo** | `POST /api/auth/register`, `/login`, `/refresh` |
| 2 | Users       | **Completo** | `GET /me`, `PATCH /me`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| 3 | Services    | **Completo** | `GET /`, `GET /public`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` |
| 4 | Bookings    | **Completo** | `GET /`, `GET /slots`, `GET /:id`, `POST /`, `PATCH /:id/confirm`, `PATCH /:id/cancel`, `PATCH /:id/complete` |
| 5 | Payments    | Pendiente   | Bookings, Wompi API                        |
| 6 | Calendar    | Pendiente   | Bookings, Google API                       |
| 7 | Coupons     | Pendiente   | Users                                      |
| 8 | Whatsapp    | Pendiente   | Meta API, IA Bot                           |
| 9 | Meta        | Pendiente   | Meta CAPI, Payments                        |

## Modelo de Datos

```
User (users)
├── email (unique), passwordHash, firstName, lastName
├── phone?, birthday?, description? (Text)
├── role: CLIENTE | EMPLEADO | ADMIN
├── isActive, refreshToken
├── → bookings, payments, coupons

Service (services)
├── name, description?, price (Decimal), duration (min)
├── category?, imageUrl?, isActive
├── → bookings

Booking (bookings)
├── userId → User, serviceId → Service
├── startTime, endTime, status: PENDIENTE_PAGO → CONFIRMADA → COMPLETADA
├── googleEventId?, notes?
├── → payment (1:1)

Payment (payments)
├── bookingId → Booking (unique), userId → User
├── amount (Decimal), status: PENDIENTE → APROBADO | RECHAZADO | REEMBOLSADO
├── wompiPaymentId?, wompiReference?, paidAt?

Coupon (coupons)
├── code (unique), discount (Decimal 5,4)
├── isUsed, expiresAt, userId? → User

ConversationState (conversation_states)
├── waId (unique), state (JSONB)
```

## Auto-Migrate al Arrancar

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
- Crea 4 servicios de ejemplo
- Si ya existe el admin, no duplica nada

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
npm test              # Unit tests (46 tests) — no requiere BD
npm run test:e2e      # E2E (requiere PostgreSQL corriendo)
npm run test:cov      # Cobertura
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

| Suite | Archivo | Tests |
|-------|---------|-------|
| Unit | `users.repository.spec.ts` | findById, findByEmail, findAll, create, update, remove, setRefreshToken, error cases |
| Unit | `token.service.spec.ts` | generateTokens, verifyToken |
| Unit | `auth.service.spec.ts` | register, login, refresh con casos de error |
| Unit | `users.service.spec.ts` | Delegación al repositorio |
| Unit | `auth.controller.spec.ts` | HTTP status, formato de respuesta |
| Unit | `users.controller.spec.ts` | CRUD, admin vs cliente |
| Unit | `jwt-auth.guard.spec.ts` | Rutas @Public(), autenticación |
| Unit | `roles.guard.spec.ts` | Validación de roles |
| E2E | `auth.e2e-spec.ts` | Register, Login, Refresh flujo completo |
| E2E | `users.e2e-spec.ts` | CRUD con tokens reales, admin vs cliente 403 |
