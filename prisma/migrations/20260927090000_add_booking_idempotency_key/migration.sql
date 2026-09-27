-- Idempotency-Key of the request that created the booking (ADR 0008 / 0012).
-- Additive: NULL for the clients that do not send the header.
ALTER TABLE "bookings" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "bookings_idempotencyKey_key" ON "bookings"("idempotencyKey");
