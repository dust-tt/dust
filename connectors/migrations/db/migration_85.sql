-- Migration created on Jul 21, 2025
ALTER TABLE "webcrawler_configuration" ADD COLUMN "sitemapOnly" boolean NOT NULL DEFAULT FALSE;
UPDATE "webcrawler_configuration" SET "sitemapOnly" = FALSE;
