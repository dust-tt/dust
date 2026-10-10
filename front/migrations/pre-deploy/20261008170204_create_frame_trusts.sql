-- Generated with migration:generate:pre-deploy; scoped to the frame_trusts model (the local
-- database had drifted, so unrelated statements were dropped).

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."frame_trusts_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."frame_trusts" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('frame_trusts_id_seq'::regclass) NOT NULL,
	"userId" bigint NOT NULL,
	"publisherUserId" bigint NOT NULL,
	"fileId" bigint NOT NULL
);

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" ADD CONSTRAINT "frame_trusts_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" VALIDATE CONSTRAINT "frame_trusts_fileId_fkey";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY frame_trusts_pkey ON public.frame_trusts USING btree (id);

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" ADD CONSTRAINT "frame_trusts_pkey" PRIMARY KEY USING INDEX "frame_trusts_pkey";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY frame_trusts_file_id ON public.frame_trusts USING btree ("fileId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY frame_trusts_publisher_user_id ON public.frame_trusts USING btree ("publisherUserId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY frame_trusts_workspace_id_user_id_file_id_publisher_user_id ON public.frame_trusts USING btree ("workspaceId", "userId", "fileId", "publisherUserId");

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."frame_trusts_id_seq" OWNED BY "public"."frame_trusts"."id";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" ADD CONSTRAINT "frame_trusts_publisherUserId_fkey" FOREIGN KEY ("publisherUserId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" VALIDATE CONSTRAINT "frame_trusts_publisherUserId_fkey";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" ADD CONSTRAINT "frame_trusts_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" VALIDATE CONSTRAINT "frame_trusts_userId_fkey";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" ADD CONSTRAINT "frame_trusts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."frame_trusts" VALIDATE CONSTRAINT "frame_trusts_workspaceId_fkey";
