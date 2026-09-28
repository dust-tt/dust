SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspaces" ADD COLUMN "locale" character varying(255) COLLATE "pg_catalog"."default" DEFAULT 'en-US'::character varying NOT NULL;
