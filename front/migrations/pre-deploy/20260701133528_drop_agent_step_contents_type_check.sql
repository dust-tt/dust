/*
Drop the legacy CHECK constraint on agent_step_contents.type.

The constraint only allowed ('text_content','reasoning','function_call','error')
and was never updated when 'provider_passthrough' was added (PR #28129), causing
inserts of provider_passthrough rows to fail. Allowed values are enforced in code
via the Sequelize `isIn` validate on AgentStepContentModel, so the DB-level check
is redundant. This constraint is not generated from the model, hence this
hand-written migration rather than a pg-schema-diff one.

Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_step_contents" DROP CONSTRAINT IF EXISTS "agent_step_contents_type_check";
