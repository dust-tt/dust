CREATE TABLE trigger_runs (
  id BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "workspaceId" BIGINT NOT NULL REFERENCES workspaces(id),
  "triggerId" BIGINT NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  "conversationId" BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  "userId" BIGINT REFERENCES users(id),
  "status" VARCHAR(255) NOT NULL DEFAULT 'running',
  "errorMessage" TEXT,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "completedAt" TIMESTAMPTZ
);

CREATE INDEX CONCURRENTLY "trigger_runs_wid_tid" ON trigger_runs("workspaceId", "triggerId");
CREATE INDEX CONCURRENTLY "trigger_runs_wid_cid" ON trigger_runs("workspaceId", "conversationId");
