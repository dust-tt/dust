-- Migration created on Jul 21, 2025
ALTER TABLE "webcrawler_configurations" ADD COLUMN "sitemapOnly" boolean NOT NULL DEFAULT FALSE;
