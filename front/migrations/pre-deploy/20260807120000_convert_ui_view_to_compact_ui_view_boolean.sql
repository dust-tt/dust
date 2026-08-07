/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" RENAME COLUMN "uiView" TO "compactUIView";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ALTER COLUMN "compactUIView" DROP DEFAULT;

/*
Statement 2
  - ACQUIRES_ACCESS_EXCLUSIVE_LOCK: This will completely lock the table while the data is being re-written.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."a`ctivation_pods"
  ALTER COLUMN "compactUIView" TYPE boolean
  USING (COALESCE("compactUIView", '') = 'compact'),
  ALTER COLUMN "compactUIView" SET DEFAULT false,
  ALTER COLUMN "compactUIView" SET NOT NULL;
