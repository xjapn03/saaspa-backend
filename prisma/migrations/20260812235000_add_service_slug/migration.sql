-- AlterTable
ALTER TABLE "services" ADD COLUMN "slug" TEXT;

-- Backfill slugs for the seeded services (URL-safe, sin acentos)
UPDATE "services" SET "slug" = 'masaje-relajante' WHERE "id" = 'seed-masaje-relajante';
UPDATE "services" SET "slug" = 'masaje-deportivo' WHERE "id" = 'seed-masaje-deportivo';
UPDATE "services" SET "slug" = 'limpieza-facial-profunda' WHERE "id" = 'seed-limpieza-facial-profunda';
UPDATE "services" SET "slug" = 'hidratacion-facial-premium' WHERE "id" = 'seed-hidratación-facial-premium';
UPDATE "services" SET "slug" = 'manicure-semi-permanente' WHERE "id" = 'seed-manicure-semi-permanente';
UPDATE "services" SET "slug" = 'pedicure-spa' WHERE "id" = 'seed-pedicure-spa';
UPDATE "services" SET "slug" = 'depilacion-con-cera-piernas' WHERE "id" = 'seed-depilación-con-cera-piernas';
UPDATE "services" SET "slug" = 'depilacion-axilas-brazos' WHERE "id" = 'seed-depilación-axilas-+-brazos';

-- Fallback: cualquier otro servicio usa su id como slug
UPDATE "services" SET "slug" = "id" WHERE "slug" IS NULL;

-- Enforce NOT NULL + unique
ALTER TABLE "services" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");
