-- Generated with migration:generate:pre-deploy; scoped to the frame_publications model (the local
-- database had drifted, so unrelated statements were dropped).

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."frame_publications_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."frame_publications" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"fileId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('frame_publications_id_seq'::regclass) NOT NULL,
	"publishedByUserId" bigint,
	"publicationId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL
);

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications" ADD CONSTRAINT "frame_publications_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications" VALIDATE CONSTRAINT "frame_publications_fileId_fkey";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY frame_publications_pkey ON public.frame_publications USING btree (id);

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications" ADD CONSTRAINT "frame_publications_pkey" PRIMARY KEY USING INDEX "frame_publications_pkey";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY frame_publications_file_id ON public.frame_publications USING btree ("fileId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY frame_publications_published_by_user_id ON public.frame_publications USING btree ("publishedByUserId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY frame_publications_workspace_id_file_id_publication_id ON public.frame_publications USING btree ("workspaceId", "fileId", "publicationId");

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."frame_publications_id_seq" OWNED BY "public"."frame_publications"."id";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications" ADD CONSTRAINT "frame_publications_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications" VALIDATE CONSTRAINT "frame_publications_publishedByUserId_fkey";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications" ADD CONSTRAINT "frame_publications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_publications" VALIDATE CONSTRAINT "frame_publications_workspaceId_fkey";

