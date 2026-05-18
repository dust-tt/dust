-- Credit state machine columns for the Enterprise Pooled plan.
--
-- Two orthogonal axes:
--   - a `memberships.creditState` (per-user): "normal" or "capped": only the
--   per-user admin-set spend cap. Pool exhaustion is not tracked here.
--   - `workspaces.poolCreditState` (workspace-wide): "active", "overage" or
--   "depleted": describes the pool itself.
--
-- A user is allowed to spend iff `membership.creditState = 'normal'` AND
-- `workspace.poolCreditState != 'depleted'`. The pre-flight check derives
-- this from the two corresponding Redis fast-path cache keys.

ALTER TABLE "public"."memberships"
  ADD COLUMN "creditState" VARCHAR(32) NOT NULL DEFAULT 'normal';

ALTER TABLE "public"."workspaces"
  ADD COLUMN "poolCreditState" VARCHAR(32) NOT NULL DEFAULT 'active';
