-- Migration created on Jun 19, 2025
ALTER TABLE "public"."webcrawler_configurations" ADD COLUMN "crawlId" VARCHAR(48) DEFAULT NULL;
[11:17:39.268] INFO (98664): Done;
