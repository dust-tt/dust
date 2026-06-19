SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspaces"
    ADD COLUMN "defaultModelId" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspaces"
    ADD COLUMN "backupModelId" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;
