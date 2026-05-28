/*
Statement 0
*/
ALTER TABLE "public"."workspaces" ADD COLUMN "programmaticCreditState" character varying(255) COLLATE "pg_catalog"."default" DEFAULT 'active'::character varying NOT NULL;
