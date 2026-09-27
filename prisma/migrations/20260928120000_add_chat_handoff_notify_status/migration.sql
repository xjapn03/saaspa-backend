-- AlterTable
ALTER TABLE "chat_conversation_states"
  ADD COLUMN "handoffNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "handoffNotifyError" TEXT,
  ADD COLUMN "handoffNotifyAttempts" INTEGER NOT NULL DEFAULT 0;
