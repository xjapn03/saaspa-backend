# Notas de Desarrollo — Kamerinos SPA Backend

## Inicio rápido

```bash
# Infra
docker compose up -d postgres redis

# Backend
npm run start:dev        # Levanta en :3001
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
| 3 | Services    | Pendiente   | —                                          |
| 4 | Bookings    | Pendiente   | Users, Services, Redis                     |
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

## Guards Globales

- **JwtAuthGuard**: Protege todas las rutas por defecto. Usar `@Public()` para eximir.
- **RolesGuard**: Verifica roles. Usar `@Roles(Role.ADMIN)` para restringir.
