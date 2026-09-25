/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."eval_runs" (
  "id" bigserial PRIMARY KEY,
  "workspaceId" bigint NOT NULL REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL,
  "sId" varchar(255) NOT NULL,
  "config" jsonb NOT NULL,
  "configHash" varchar(64) NOT NULL,
  "status" varchar(255) NOT NULL,
  "cancelRequested" boolean NOT NULL,
  "requestedBy" varchar(255)
);

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY eval_runs_workspace_id_s_id ON public.eval_runs ("workspaceId", "sId");

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY eval_runs_workspace_id_created_at ON public.eval_runs ("workspaceId", "createdAt");

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."eval_steps" (
  "id" bigserial PRIMARY KEY,
  "workspaceId" bigint NOT NULL REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL,
  "runId" varchar(255) NOT NULL,
  "caseIndex" integer NOT NULL,
  "voteIndex" integer NOT NULL,
  "status" varchar(255) NOT NULL,
  "conversationId" varchar(255),
  "userMessageId" varchar(255),
  "output" jsonb,
  "error" varchar(1024)
);

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY eval_steps_workspace_id_run_id_case_index_vote_index ON public.eval_steps ("workspaceId", "runId", "caseIndex", "voteIndex");
