DELETE FROM
    "zendesk_timestamp_cursors"
WHERE
    "timestampCursor" IS NULL;

ALTER TABLE
    "zendesk_timestamp_cursors"
ALTER COLUMN
    "timestampCursor"
SET
    NOT NULL;