SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."subscriptions"
    ADD COLUMN "hubspotDealId" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;
