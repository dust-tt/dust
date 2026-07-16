/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."activation_nudges" (
	"id" bigserial NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"spaceId" bigint NOT NULL,
	"triggerId" bigint NOT NULL,
	"userId" bigint NOT NULL
);

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY activation_nudges_pkey ON public.activation_nudges USING btree (id);

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_pkey" PRIMARY KEY USING INDEX "activation_nudges_pkey";

/*
Statement 3
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY activation_nudges_space_id ON public.activation_nudges USING btree ("spaceId");

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY activation_nudges_trigger_id ON public.activation_nudges USING btree ("triggerId");

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY activation_nudges_user_id ON public.activation_nudges USING btree ("userId");

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES triggers(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_triggerId_fkey";

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES vaults(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_spaceId_fkey";

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_userId_fkey";

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_workspaceId_fkey";
