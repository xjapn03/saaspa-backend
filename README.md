# Kamerinos SPA — Backend API

Backend Core de Kamerinos SPA Bogotá. Monolito modular construido con
NestJS (TypeScript) que gestiona usuarios, catálogo de servicios y productos,
agendamiento con pagos fraccionados (Wompi), e-commerce con carrito de compras,
sincronización con Google Calendar, emails transaccionales (SendGrid) y
atribución de conversiones (Meta CAPI).

## Stack

| Componente   | Tecnología                        |
|-------------|-----------------------------------|
| Runtime     | Node.js 20+ / TypeScript 5        |
| Framework   | NestJS                            |
| ORM         | Prisma + PostgreSQL 15 (pgvector) |
| Caché       | Redis                             |
| Pagos       | Wompi (webhooks + widget)         |
| Email       | SendGrid                          |
| Docs API    | Swagger (`/docs`)                 |
| DevOps      | Docker Compose                    |

## Estructura

```
src/
├── common/          # Guards, decorators, filters, email, google-calendar, redis, audit
├── config/          # Variables de entorno (Joi + @nestjs/config)
├── database/        # PrismaService global
├── modules/
│   ├── auth/        # JWT, registro, login, refresh, forgot/reset password
│   ├── users/       # Gestión de usuarios con sort/filtros + includeInactive
│   ├── services/    # Catálogo de servicios (con slug + category FK)
│   ├── bookings/    # Reservas con Redis slot locking (bloqueo GLOBAL de horarios)
│   ├── payments/    # Wompi (ABONO + SALDO, webhooks idempotentes, cart checkout, pago manual)
│   ├── coupons/     # Cupones con límites de uso (maxUses/usedCount/perUserLimit)
│   ├── calendar/    # Google Calendar API
│   ├── categories/  # Categorías con subcategorías (tree)
│   ├── products/    # Productos e-commerce (Shop)
│   ├── cart/        # Carrito server-side (CartItem)
│   ├── orders/      # Pedidos (Order + OrderItem)
│   ├── meta/        # Meta Conversions API (CAPI)
│   ├── health/      # Health check (DB + Redis)
│   ├── upload/      # Subida de imágenes (multer)
│   └── whatsapp/    # Webhook WhatsApp Cloud API + recepcionista (menú interactivo)
├── repositories/    # Repository Pattern (interfaces + implementaciones Prisma)
├── app.module.ts
└── main.ts
```

## Requisitos

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15 (o `docker compose up -d postgres`)

## Arranque Rápido

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npx prisma migrate deploy      # aplicar migraciones
npx prisma db seed             # poblar datos (admin + 8 categorías + 8 servicios + 8 productos)
npm run start:dev
```

- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/docs`

## Despliegue (un solo dominio)

En producción todo se sirve bajo **un solo dominio**:
`https://kamerinos.sandrapinzonsaludybelleza.com.co` — frontend (Next.js) + backend
vía proxy `/api/*` en Nginx. **No** hay subdominio `api.` separado.

Webhooks:
- WhatsApp: `https://kamerinos.sandrapinzonsaludybelleza.com.co/api/whatsapp/webhook` (verify token `kamerinos_webhook_2026`)
- Wompi: `https://kamerinos.sandrapinzonsaludybelleza.com.co/api/payments/webhook`

## Tests

```bash
npm test                 # Unit tests (287 tests, 42 suites) — maxWorkers=2 optimizado
npm run test:cov         # Cobertura
npm run test:e2e         # End-to-end (requiere PostgreSQL corriendo)
```

Ver [`docs-general/TEST-COVERAGE.md`](../docs-general/TEST-COVERAGE.md) para el plan completo de cobertura.

## Variables de Entorno

Ver `.env.example` para la lista completa. Claves principales:

| Variable                | Descripción                          |
|-------------------------|--------------------------------------|
| `DATABASE_URL`          | PostgreSQL connection string         |
| `REDIS_URL`             | Redis connection string              |
| `JWT_SECRET`            | Secreto para firmar tokens JWT       |
| `WOMPI_PUBLIC_KEY`      | API key pública de Wompi (widget)    |
| `WOMPI_PRIVATE_KEY`     | API key privada de Wompi (consultas) |
| `WOMPI_EVENTS_KEY`      | Secreto para validar firma de webhooks |
| `WOMPI_INTEGRITY_SECRET`| Secreto para generar firma de integridad |
| `GOOGLE_CLIENT_EMAIL`   | Service account Google Calendar      |
| `GOOGLE_PRIVATE_KEY`    | Clave privada de la service account  |
| `SENDGRID_API_KEY`      | API key de SendGrid (recuperación de contraseña, opcional) |
| `META_*`                | Credenciales WhatsApp Cloud API y CAPI |
| `IA_BOT_URL`            | URL del microservicio Python IA Bot  |

## Repositorios Relacionados

- **saaspa-frontend** — Frontend Next.js (SSR, checkout, dashboard)
- **saaspa-IA** — Bot WhatsApp IA (Python, pendiente de crear)

## Licencia

Privado. Todos los derechos reservados © Kamerinos SPA Bogotá.
