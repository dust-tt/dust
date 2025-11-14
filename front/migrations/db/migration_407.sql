-- Create credits table to track programmatic API credits (amounts in cents)
CREATE TABLE IF NOT EXISTS "credits" (
  "id"  BIGSERIAL ,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "expirationDate" TIMESTAMP WITH TIME ZONE,
  "initialAmount" INTEGER NOT NULL CHECK ("initialAmount" >= 0),
  "remainingAmount" INTEGER NOT NULL CHECK ("remainingAmount" >= 0),
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);

-- Indexes for frequent queries and existence checks
CREATE INDEX IF NOT EXISTS "credits_workspace_id"
  ON "credits" ("workspaceId");

CREATE INDEX IF NOT EXISTS "credits_workspace_id_expiration_date"
  ON "credits" ("workspaceId", "expirationDate");

-- Partial index to speed-up lookups of still-usable credits (remainingAmount <> 0)
CREATE INDEX IF NOT EXISTS "credits_nonzero_remaining_idx"
  ON "credits" ("workspaceId", "expirationDate")
  WHERE "remainingAmount" <> 0;

