-- Migration created on Nov 11, 2025
ALTER TABLE "public"."conversations" DROP COLUMN "requestedGroupIds";
ALTER TABLE "public"."agent_configurations" DROP COLUMN "requestedGroupIds";
