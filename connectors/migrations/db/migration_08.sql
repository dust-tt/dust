-- Migration created on Jul 22, 2024
ALTER TABLE "public"."microsoft_roots" DROP COLUMN "currentDeltaLink";
ALTER TABLE "public"."microsoft_nodes" ADD COLUMN "deltaLink" VARCHAR(1024);
