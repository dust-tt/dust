UPDATE user_messages
SET
    "userContextOrigin" = 'triggered'
WHERE
    "userContextOrigin" IS NULL
    AND content NOT LIKE 'Transcript%';

UPDATE user_messages
SET
    "userContextOrigin" = 'transcript'
WHERE
    "userContextOrigin" IS NULL
    AND content LIKE 'Transcript%';

ALTER TABLE "user_messages"
ALTER COLUMN "userContextOrigin"
SET NOT NULL;