-- Generated with migration:generate:pre-deploy; scoped to this model change.

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."file_viewer_dailies_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

/*
Statement 36
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."file_viewer_dailies" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"firstViewedAt" timestamp with time zone NOT NULL,
	"lastViewedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('file_viewer_dailies_id_seq'::regclass) NOT NULL,
	"fileId" bigint NOT NULL,
	"viewedOn" date NOT NULL,
	"email" character varying(255) COLLATE "pg_catalog"."default" NOT NULL
);

/*
Statement 37
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY file_viewer_dailies_pkey ON public.file_viewer_dailies USING btree (id);

/*
Statement 38
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."file_viewer_dailies" ADD CONSTRAINT "file_viewer_dailies_pkey" PRIMARY KEY USING INDEX "file_viewer_dailies_pkey";

/*
Statement 39
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY file_viewer_dailies_file_id ON public.file_viewer_dailies USING btree ("fileId");

/*
Statement 40
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY file_viewer_dailies_workspace_id_file_id_email_viewed_on ON public.file_viewer_dailies USING btree ("workspaceId", "fileId", email, "viewedOn");

/*
Statement 41
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."file_viewer_dailies_id_seq" OWNED BY "public"."file_viewer_dailies"."id";

/*
Statement 112
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."file_viewer_dailies" ADD CONSTRAINT "file_viewer_dailies_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 113
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."file_viewer_dailies" VALIDATE CONSTRAINT "file_viewer_dailies_fileId_fkey";

/*
Statement 188
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."file_viewer_dailies" ADD CONSTRAINT "file_viewer_dailies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 189
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."file_viewer_dailies" VALIDATE CONSTRAINT "file_viewer_dailies_workspaceId_fkey";
