SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."agent_tables_query_configuration_tables" DROP COLUMN IF EXISTS "_dataSourceId";
ALTER TABLE "public"."agent_user_relations" DROP COLUMN IF EXISTS "listStatusOverride";
ALTER TABLE "public"."conversations" DROP COLUMN IF EXISTS "lastThreadVersion";
ALTER TABLE "public"."feature_flags" DROP COLUMN IF EXISTS "groupIds";
ALTER TABLE "public"."files" DROP COLUMN IF EXISTS "sharedAt";
ALTER TABLE "public"."kill_switches" DROP COLUMN IF EXISTS "enabled";
ALTER TABLE "public"."messages"
    DROP COLUMN IF EXISTS "nextThreadVersion",
    DROP COLUMN IF EXISTS "previousThreadVersion",
    DROP COLUMN IF EXISTS "threadVersions";
ALTER TABLE "public"."skill_suggestions" DROP COLUMN IF EXISTS "sourceConversationId";

DROP TABLE IF EXISTS "public"."labs_personal_salesforce_connections";
