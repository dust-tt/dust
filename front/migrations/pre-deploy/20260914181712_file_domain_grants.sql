-- Generated with migration:generate:pre-deploy; scoped to the domain-grant model change.

/*
Statement 48
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sharing_grants" ADD COLUMN "domain" character varying(253) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

/*
Statement 49
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sharing_grants" ALTER COLUMN "email" DROP NOT NULL;

/*
Statement 50
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sharing_grants" ALTER COLUMN "email" SET DEFAULT NULL::character varying;

/*
Statement 51
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sharing_grants_workspace_id_shareable_file_id_domain ON public.sharing_grants USING btree ("workspaceId", "shareableFileId", domain) WHERE (("revokedAt" IS NULL) AND (domain IS NOT NULL));
