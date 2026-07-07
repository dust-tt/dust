/*
Add the podType discriminator to project_metadata: NULL for normal project spaces,
'activation' for activation pods. Nullable, no default data: only activation pods set it.

Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" ADD COLUMN "podType" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;
