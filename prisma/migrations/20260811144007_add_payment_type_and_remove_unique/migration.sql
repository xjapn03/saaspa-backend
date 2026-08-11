-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('ABONO', 'SALDO');

-- DropIndex
DROP INDEX "payments_bookingId_key";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "type" "PaymentType" NOT NULL DEFAULT 'ABONO';
