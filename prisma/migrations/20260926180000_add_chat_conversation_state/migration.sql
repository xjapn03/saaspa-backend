-- CreateTable
CREATE TABLE "chat_conversation_states" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'kamerinos',
    "conversationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "identityKind" TEXT NOT NULL,
    "userId" TEXT,
    "sessionKeyHash" TEXT NOT NULL,
    "handoffActive" BOOLEAN NOT NULL DEFAULT false,
    "handoffReason" TEXT,
    "lastTurnId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversation_states_conversationId_key" ON "chat_conversation_states"("conversationId");

-- CreateIndex
CREATE INDEX "chat_conversation_states_tenantId_idx" ON "chat_conversation_states"("tenantId");
