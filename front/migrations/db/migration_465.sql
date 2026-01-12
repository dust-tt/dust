UPDATE vaults
SET
    kind = 'project'
WHERE
    "conversationsEnabled" = true;

ALTER TABLE "public"."vaults"
DROP COLUMN "conversationsEnabled";