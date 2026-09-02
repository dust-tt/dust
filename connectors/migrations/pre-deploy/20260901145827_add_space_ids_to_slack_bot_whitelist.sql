SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."slack_bot_whitelist" ADD COLUMN "spaceIds" character varying(255)[];
