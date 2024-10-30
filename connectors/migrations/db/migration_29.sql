ALTER TABLE
    microsoft_nodes DROP COLUMN IF EXISTS "web_url";

ALTER TABLE
    microsoft_nodes
ADD
    COLUMN IF NOT EXISTS "webUrl" TEXT;