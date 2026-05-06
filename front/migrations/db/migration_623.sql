-- Migration created on May 05, 2026
ALTER TABLE "public"."takeaways" DROP COLUMN "notableFacts";
ALTER TABLE "public"."takeaways" DROP COLUMN "keyDecisions";
ALTER TABLE "public"."takeaway_versions" DROP COLUMN "notableFacts";
ALTER TABLE "public"."takeaway_versions" DROP COLUMN "keyDecisions";
