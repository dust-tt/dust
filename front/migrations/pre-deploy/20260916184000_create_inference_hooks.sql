SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE IF NOT EXISTS "public"."inference_hooks" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" BIGINT NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "providerId" VARCHAR(255) NOT NULL,
  "endpoint" TEXT NOT NULL,
  "encryptedCredentials" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "inference_hooks_workspace_id" ON "public"."inference_hooks" ("workspaceId");
