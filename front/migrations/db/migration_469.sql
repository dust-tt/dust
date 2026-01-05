-- Migration: Create workspace_verification_attempts table
-- Purpose: Store phone verification attempts for workspace verification

CREATE TABLE "workspace_verification_attempts" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT,
    "phoneNumberHash" VARCHAR(64) NOT NULL,
    "twilioVerificationSid" VARCHAR(64),
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "verifiedAt" TIMESTAMP WITH TIME ZONE,
    "failedAt" TIMESTAMP WITH TIME ZONE
);

-- Index for workspace queries
CREATE INDEX "workspace_verification_attempts_workspace_id_idx"
    ON "workspace_verification_attempts"("workspaceId");

-- Unique index: one phone number globally (phone can only be used by one workspace)
CREATE UNIQUE INDEX "workspace_verification_attempts_phone_hash_unique_idx"
    ON "workspace_verification_attempts"("phoneNumberHash");

-- Index for webhook lookups by Twilio SID
CREATE INDEX "workspace_verification_attempts_twilio_sid_idx"
    ON "workspace_verification_attempts"("twilioVerificationSid")
    WHERE "twilioVerificationSid" IS NOT NULL;

