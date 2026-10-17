/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."notion_webhook_registrations_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."notion_webhook_registrations" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"id" bigint DEFAULT nextval('notion_webhook_registrations_id_seq'::regclass) NOT NULL,
	"notionWorkspaceId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"tokenHash" character varying(64) COLLATE "pg_catalog"."default" NOT NULL,
	"signingSecretHash" character varying(64) COLLATE "pg_catalog"."default"
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY notion_webhook_registrations_pkey ON public.notion_webhook_registrations USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."notion_webhook_registrations" ADD CONSTRAINT "notion_webhook_registrations_pkey" PRIMARY KEY USING INDEX "notion_webhook_registrations_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY notion_webhook_registrations_notion_workspace_id ON public.notion_webhook_registrations USING btree ("notionWorkspaceId");

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."notion_webhook_registrations_id_seq" OWNED BY "public"."notion_webhook_registrations"."id";
