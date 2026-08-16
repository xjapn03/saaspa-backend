-- AlterTable
ALTER TABLE "services" ADD COLUMN     "carouselImages" JSONB,
ADD COLUMN     "compareAtPrice" DECIMAL(10,2),
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mainImage" TEXT;
