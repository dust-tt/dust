/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."workspace_seat_limits_id_seq"
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
CREATE TABLE "public"."workspace_seat_limits" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"seatType" character varying(255) NOT NULL,
	"minSeats" integer DEFAULT 0 NOT NULL,
	"maxSeats" integer,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('workspace_seat_limits_id_seq'::regclass) NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY workspace_seat_limits_pkey ON public.workspace_seat_limits USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_seat_limits" ADD CONSTRAINT "workspace_seat_limits_pkey" PRIMARY KEY USING INDEX "workspace_seat_limits_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY workspace_seat_limits_workspace_seat_type_idx ON public.workspace_seat_limits USING btree ("workspaceId", "seatType");

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."workspace_seat_limits_id_seq" OWNED BY "public"."workspace_seat_limits"."id";

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_seat_limits" ADD CONSTRAINT "workspace_seat_limits_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_seat_limits" VALIDATE CONSTRAINT "workspace_seat_limits_workspaceId_fkey";
