SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."global_feature_flags" ADD COLUMN "conditions" character varying(255)[] COLLATE "pg_catalog"."default" DEFAULT (ARRAY[]::character varying[])::character varying(255)[] NOT NULL;
