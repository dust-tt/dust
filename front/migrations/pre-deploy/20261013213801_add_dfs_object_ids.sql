/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."vaults" ADD COLUMN "dfsObjectId" character varying(255) COLLATE "pg_catalog"."default";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversations" ADD COLUMN "dfsObjectId" character varying(255) COLLATE "pg_catalog"."default";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."files" ADD COLUMN "dfsObjectId" character varying(255) COLLATE "pg_catalog"."default";

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."dfs_user_folders_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."dfs_user_folders" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('dfs_user_folders_id_seq'::regclass) NOT NULL,
	"userId" bigint NOT NULL,
	"dfsObjectId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL
);

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY dfs_user_folders_pkey ON public.dfs_user_folders USING btree (id);

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."dfs_user_folders" ADD CONSTRAINT "dfs_user_folders_pkey" PRIMARY KEY USING INDEX "dfs_user_folders_pkey";

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY dfs_user_folders_workspace_id_user_id_idx ON public.dfs_user_folders USING btree ("workspaceId", "userId");

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."dfs_user_folders_id_seq" OWNED BY "public"."dfs_user_folders"."id";

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."dfs_user_folders" ADD CONSTRAINT "dfs_user_folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."dfs_user_folders" VALIDATE CONSTRAINT "dfs_user_folders_userId_fkey";

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."dfs_user_folders" ADD CONSTRAINT "dfs_user_folders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."dfs_user_folders" VALIDATE CONSTRAINT "dfs_user_folders_workspaceId_fkey";
