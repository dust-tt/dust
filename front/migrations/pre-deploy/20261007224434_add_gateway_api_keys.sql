/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."gateway_api_keys_id_seq"
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
CREATE TABLE "public"."gateway_api_keys" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('gateway_api_keys_id_seq'::regclass) NOT NULL,
	"userId" bigint,
	"gateway" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"credentialId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"gatewayKeyId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY gateway_api_keys_pkey ON public.gateway_api_keys USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."gateway_api_keys" ADD CONSTRAINT "gateway_api_keys_pkey" PRIMARY KEY USING INDEX "gateway_api_keys_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY gateway_api_keys_user_id ON public.gateway_api_keys USING btree ("userId");

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY gateway_api_keys_workspace_id ON public.gateway_api_keys USING btree ("workspaceId");

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY gateway_api_keys_workspace_gateway_no_user_idx ON public.gateway_api_keys USING btree ("workspaceId", gateway) WHERE ("userId" IS NULL);

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY gateway_api_keys_workspace_gateway_user_idx ON public.gateway_api_keys USING btree ("workspaceId", gateway, "userId") WHERE ("userId" IS NOT NULL);

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."gateway_api_keys_id_seq" OWNED BY "public"."gateway_api_keys"."id";

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."gateway_api_keys" ADD CONSTRAINT "gateway_api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."gateway_api_keys" VALIDATE CONSTRAINT "gateway_api_keys_userId_fkey";

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."gateway_api_keys" ADD CONSTRAINT "gateway_api_keys_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."gateway_api_keys" VALIDATE CONSTRAINT "gateway_api_keys_workspaceId_fkey";
