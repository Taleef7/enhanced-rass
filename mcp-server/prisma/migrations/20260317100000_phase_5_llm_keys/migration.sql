-- Phase 5.2: Per-user LLM API key storage
-- Stores encrypted API keys for external LLM providers (OpenAI, Gemini, etc.)
-- so users can use their own quotas for model selection via /v1/chat/completions.

CREATE TABLE "UserLlmKey" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "provider"  TEXT NOT NULL,
    "keyIv"     TEXT NOT NULL,
    "keyTag"    TEXT NOT NULL,
    "keyCipher" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserLlmKey_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one key per provider per user
CREATE UNIQUE INDEX "UserLlmKey_userId_provider_key" ON "UserLlmKey"("userId", "provider");

-- Fast lookup by user
CREATE INDEX "UserLlmKey_userId_idx" ON "UserLlmKey"("userId");

-- Foreign key to User
ALTER TABLE "UserLlmKey"
    ADD CONSTRAINT "UserLlmKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
