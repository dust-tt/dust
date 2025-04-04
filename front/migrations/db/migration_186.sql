-- Migration created on 2025-03-19 -- "nodeId" accepts 512 characters
ALTER TABLE "content_fragments" ALTER COLUMN "nodeId" TYPE TEXT;
