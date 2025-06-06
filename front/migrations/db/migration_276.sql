-- Migration created on Jun 06, 2025
ALTER TABLE "public"."plans" ADD COLUMN "maxWebcrawlerPages" INTEGER DEFAULT -1;
UPDATE "plans"
SET "maxWebcrawlerPages" = CASE
    WHEN "code" LIKE 'FREE\_%' AND NOT LIKE 'FREE\_PILOT\_%' THEN 256 -- all like FREE_SECURITY, FREE_TEST, FREE_PARNTER etc
    WHEN "code" LIKE 'PRO\_%' OR "code" LIKE 'FREE\_PILOT\_%' THEN 512
    ELSE "maxWebcrawlerPages" -- Keeps the default value for others
END;

