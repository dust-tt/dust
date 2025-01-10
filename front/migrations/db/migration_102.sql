ALTER TABLE
    "agent_tables_query_actions"
ADD
    COLUMN "resultsFileId" INTEGER,
ADD
    COLUMN "resultsFileSnippet" TEXT;

ALTER TABLE
    "agent_tables_query_actions"
ADD
    FOREIGN KEY ("resultsFileId") REFERENCES "files" ("id") ON DELETE
SET
    NULL ON UPDATE CASCADE;