-- Move conversation ownership out of sandboxes before adding other sandbox owners.
SET lock_timeout = '5s';

CREATE TABLE "public"."conversation_sandboxes"
(
  "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "conversationId" BIGINT                   NOT NULL REFERENCES "public"."conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sandboxId"      BIGINT                   NOT NULL REFERENCES "public"."sandboxes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId"    BIGINT                   NOT NULL REFERENCES "public"."workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id"             BIGSERIAL,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY "conversation_sandboxes_workspace_conversation_idx"
  ON "public"."conversation_sandboxes" ("workspaceId", "conversationId");

CREATE UNIQUE INDEX CONCURRENTLY "conversation_sandboxes_workspace_sandbox_idx"
  ON "public"."conversation_sandboxes" ("workspaceId", "sandboxId");
