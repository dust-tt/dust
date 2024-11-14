-- Migration created on Nov 14, 2024
ALTER TABLE
    "public"."content_fragments"
ADD
    COLUMN "sId" VARCHAR(255);

CREATE INDEX CONCURRENTLY "content_fragments_s_id" ON "content_fragments" ("sId");