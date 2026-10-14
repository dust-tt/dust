/*
Post-deploy: drop the `agent_suggestions.title` column. It was added for a planned user-facing title that
never shipped: no code path writes or reads it. This runs after the model stops declaring the column, so
no live pod selects it anymore.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggestions" DROP COLUMN IF EXISTS "title";
