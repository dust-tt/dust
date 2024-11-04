-- Migration created on Nov 04, 2024
ALTER TABLE "public"."agent_configurations" ADD COLUMN "requestedGroupIds" INTEGER[][] NOT NULL DEFAULT ARRAY[]::INTEGER[][];
ALTER TABLE "public"."conversations" ADD COLUMN "requestedGroupIds" INTEGER[][] NOT NULL DEFAULT ARRAY[]::INTEGER[][];

