-- Create credits table to track programmatic API credits (amounts in cents)
CREATE TABLE IF NOT EXISTS "credits" (
  "id"  BIGSERIAL ,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "expirationDate" TIMESTAMP WITH TIME ZONE,
  "initialAmount" INTEGER NOT NULL,
  "remainingAmount" INTEGER NOT NULL,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);

-- Indexes for frequent queries and existence checks
CREATE INDEX IF NOT EXISTS "credits_workspaceId_idx"
  ON "credits" ("workspaceId");

CREATE INDEX IF NOT EXISTS "credits_workspaceId_expirationDate_idx"
  ON "credits" ("workspaceId", "expirationDate");

-- Partial index to speed-up lookups of still-usable credits (remainingAmount <> 0)
CREATE INDEX IF NOT EXISTS "credits_nonzero_remaining_idx"
  ON "credits" ("workspaceId", "expirationDate")
  WHERE "remainingAmount" <> 0;

