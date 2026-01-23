UPDATE "triggers" SET "origin" = 'user' WHERE "origin" IS NULL;
ALTER TABLE "triggers" ALTER COLUMN "origin" SET NOT NULL;
