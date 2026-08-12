-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('WOMAPI', 'EFECTIVO', 'TRANSFERENCIA');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "paymentMethod" "PaymentMethod" DEFAULT 'WOMAPI';
