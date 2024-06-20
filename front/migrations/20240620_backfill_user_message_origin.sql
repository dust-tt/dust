UPDATE user_messages SET "userContextOrigin" = 'slack' WHERE "userContextOrigin" IS NULL AND "userContextProfilePictureUrl" ILIKE '%slack%';
UPDATE user_messages SET "userContextOrigin" = 'web' WHERE "userContextOrigin" IS NULL AND "userId" IS NOT NULL;
UPDATE user_messages SET "userContextOrigin" = 'api' WHERE "userContextOrigin" IS NULL AND "userId" IS NULL;

SELECT "userContextOrigin", COUNT(*) FROM user_messages GROUP BY "userContextOrigin";
