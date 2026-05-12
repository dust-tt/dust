-- Add creditState column to memberships (user-level credit consumption state).
-- Source of truth for the UserCreditStateMachine; Redis user_block key is a
-- derived fast-path cache populated by the machine's onTransition side-effects.
ALTER TABLE "public"."memberships"
  ADD COLUMN "creditState" VARCHAR(32) NOT NULL DEFAULT 'free_active';

-- Backfill existing rows based on current seatType.
UPDATE "public"."memberships"
SET "creditState" = CASE "seatType"
  WHEN 'pro'    THEN 'bundle_active'
  WHEN 'max'    THEN 'bundle_active'
  WHEN 'pooled' THEN 'pool_active'
  ELSE 'free_active'
END;

-- Audit log for every credit state transition.
CREATE TABLE "public"."metronome_credit_state_transitions" (
  "id"           BIGSERIAL PRIMARY KEY,
  "workspaceId"  BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  "userId"       BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "fromState"    VARCHAR(32) NOT NULL,
  "toState"      VARCHAR(32) NOT NULL,
  "eventType"    VARCHAR(64) NOT NULL,
  "eventPayload" JSONB,
  "triggeredBy"  VARCHAR(32) NOT NULL,
  "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX ON "public"."metronome_credit_state_transitions" ("workspaceId", "userId", "createdAt" DESC);
CREATE INDEX ON "public"."metronome_credit_state_transitions" ("createdAt" DESC);
