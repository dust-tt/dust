-- Migration created on Feb 12, 2025
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "tagsIn" VARCHAR(255)[];
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "tagsNot" VARCHAR(255)[];


-- UPDATE agent_data_source_configurations as adsc
--     SET "tagsIn" = apc."tagsIn",
--         "tagsNotIn" = '{}',
--         "tagsMode" = 'custom'
--     FROM agent_process_configurations as apc
--     WHERE adsc."processConfigurationId" = apc.id
--         AND apc."tagsIn" IS NOT NULL
--         AND cardinality(apc."tagsIn") > 0;
-- ALTER TABLE "public"."agent_process_configurations" DROP COLUMN "tagsIn";

