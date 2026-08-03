-- Add the generic sandbox ownership table.
SET lock_timeout = '5s';

ALTER TABLE "public"."sandboxes"
  ALTER COLUMN "conversationId" DROP NOT NULL;

CREATE TABLE "public"."sandbox_owners"
(
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "conversationId" BIGINT REFERENCES "public"."conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "spaceId"        BIGINT REFERENCES "public"."vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sandboxId"      BIGINT                   NOT NULL REFERENCES "public"."sandboxes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId"    BIGINT                   NOT NULL REFERENCES "public"."workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id"             BIGSERIAL,
  PRIMARY KEY ("id"),
  CONSTRAINT "sandbox_owners_exactly_one_owner_check"
    CHECK (num_nonnulls("conversationId", "spaceId") = 1)
);

CREATE UNIQUE INDEX CONCURRENTLY "sandbox_owners_workspace_sandbox_idx"
  ON "public"."sandbox_owners" ("workspaceId", "sandboxId");

CREATE UNIQUE INDEX CONCURRENTLY "sandbox_owners_workspace_conversation_idx"
  ON "public"."sandbox_owners" ("workspaceId", "conversationId")
  WHERE "conversationId" IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY "sandbox_owners_workspace_space_idx"
  ON "public"."sandbox_owners" ("workspaceId", "spaceId")
  WHERE "spaceId" IS NOT NULL;

CREATE INDEX CONCURRENTLY "sandbox_owners_conversation_id_idx" ON "public"."sandbox_owners" ("conversationId");

CREATE INDEX CONCURRENTLY "sandbox_owners_space_id_idx" ON "public"."sandbox_owners" ("spaceId");

CREATE INDEX CONCURRENTLY "sandbox_owners_sandbox_id_idx" ON "public"."sandbox_owners" ("sandboxId");
