/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ADD CONSTRAINT "pgschemadiff_tmpnn_4EqU48Y9Qjm2GrORrLv5qQ" CHECK("availability" IS NOT NULL) NOT VALID;

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" VALIDATE CONSTRAINT "pgschemadiff_tmpnn_4EqU48Y9Qjm2GrORrLv5qQ";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ALTER COLUMN "availability" SET NOT NULL;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ALTER COLUMN "availability" SET DEFAULT 'workspace_users'::character varying;

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" DROP CONSTRAINT "pgschemadiff_tmpnn_4EqU48Y9Qjm2GrORrLv5qQ";

/*
Statement 5
  - DELETES_DATA: Deletes the isDefault column. The availability backfill must have run.
  - Also implicitly drops the skill_configurations_workspace_id_status_is_default index
    (replaced by skill_configurations_workspace_id_status_availability, created pre-deploy):
    DROP COLUMN drops indexes referencing the column.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" DROP COLUMN IF EXISTS "isDefault";

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" ADD CONSTRAINT "pgschemadiff_tmpnn_5$OMSWeWSYqINKgDMvg68Q" CHECK("availability" IS NOT NULL) NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" VALIDATE CONSTRAINT "pgschemadiff_tmpnn_5$OMSWeWSYqINKgDMvg68Q";

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" ALTER COLUMN "availability" SET NOT NULL;

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" ALTER COLUMN "availability" SET DEFAULT 'workspace_users'::character varying;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" DROP CONSTRAINT "pgschemadiff_tmpnn_5$OMSWeWSYqINKgDMvg68Q";

/*
Statement 11
  - DELETES_DATA: Deletes the isDefault column. The availability backfill must have run.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" DROP COLUMN IF EXISTS "isDefault";
