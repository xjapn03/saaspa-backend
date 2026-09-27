-- Handoff detail (J-05 / ADR 0013): the triggering message and the timestamps, so a
-- person can take over the conversation and the reversal can be traced.
ALTER TABLE "chat_conversation_states" ADD COLUMN "handoffMessage" TEXT;

ALTER TABLE "chat_conversation_states" ADD COLUMN "handoffAt" TIMESTAMP(3);

ALTER TABLE "chat_conversation_states" ADD COLUMN "handoffClosedAt" TIMESTAMP(3);
