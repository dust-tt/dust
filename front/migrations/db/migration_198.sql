-- Migration created on Apr 03, 2025
ALTER TABLE "public"."conversations" DROP COLUMN "groupIds";
ALTER TABLE "public"."agent_configurations" DROP COLUMN "groupIds";
