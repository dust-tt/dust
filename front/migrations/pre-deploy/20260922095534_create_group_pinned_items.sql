SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."group_pinned_items_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."group_pinned_items" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"groupId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('group_pinned_items_id_seq'::regclass) NOT NULL,
	"position" integer NOT NULL,
	"type" character varying(32) COLLATE "pg_catalog"."default" NOT NULL,
	"itemId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL
);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY group_pinned_items_pkey ON public.group_pinned_items USING btree (id);

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pinned_items" ADD CONSTRAINT "group_pinned_items_pkey" PRIMARY KEY USING INDEX "group_pinned_items_pkey";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY group_pinned_items_group_position_unique ON public.group_pinned_items USING btree ("groupId", "position");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY group_pinned_items_group_type_item_unique ON public.group_pinned_items USING btree ("groupId", type, "itemId");

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."group_pinned_items_id_seq" OWNED BY "public"."group_pinned_items"."id";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pinned_items" ADD CONSTRAINT "group_pinned_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES groups(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pinned_items" VALIDATE CONSTRAINT "group_pinned_items_groupId_fkey";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pinned_items" ADD CONSTRAINT "group_pinned_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_pinned_items" VALIDATE CONSTRAINT "group_pinned_items_workspaceId_fkey";
