/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."activation_pods_id_seq"
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
ALTER TABLE "public"."activation_nudges" ADD COLUMN "activationPodId" bigint;

/*
Statement 2
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY activation_nudges_activation_pod_id ON public.activation_nudges USING btree ("activationPodId");

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."activation_pods" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('activation_pods_id_seq'::regclass) NOT NULL,
	"spaceId" bigint NOT NULL,
	"userId" bigint NOT NULL,
	"triggerId" bigint
);

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY activation_pods_pkey ON public.activation_pods USING btree (id);

/*
Statement 5
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ADD CONSTRAINT "activation_pods_pkey" PRIMARY KEY USING INDEX "activation_pods_pkey";

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY activation_pods_space_id ON public.activation_pods USING btree ("spaceId");

/*
Statement 7
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY activation_pods_trigger_id ON public.activation_pods USING btree ("triggerId");

/*
Statement 8
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY activation_pods_user_id ON public.activation_pods USING btree ("userId");

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" ADD CONSTRAINT "activation_nudges_activationPodId_fkey" FOREIGN KEY ("activationPodId") REFERENCES activation_pods(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_nudges" VALIDATE CONSTRAINT "activation_nudges_activationPodId_fkey";

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."activation_pods_id_seq" OWNED BY "public"."activation_pods"."id";

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD COLUMN "activationPodId" bigint;

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" ADD CONSTRAINT "activation_recommendations_activationPodId_fkey" FOREIGN KEY ("activationPodId") REFERENCES activation_pods(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 14
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_recommendations" VALIDATE CONSTRAINT "activation_recommendations_activationPodId_fkey";

/*
Statement 15
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY activation_recommendations_activation_pod_id ON public.activation_recommendations USING btree ("activationPodId");

/*
Statement 16
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ADD CONSTRAINT "activation_pods_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES triggers(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 17
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" VALIDATE CONSTRAINT "activation_pods_triggerId_fkey";

/*
Statement 18
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ADD CONSTRAINT "activation_pods_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES vaults(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 19
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" VALIDATE CONSTRAINT "activation_pods_spaceId_fkey";

/*
Statement 20
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ADD CONSTRAINT "activation_pods_userId_fkey" FOREIGN KEY ("userId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 21
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" VALIDATE CONSTRAINT "activation_pods_userId_fkey";

/*
Statement 22
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" ADD CONSTRAINT "activation_pods_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 23
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" VALIDATE CONSTRAINT "activation_pods_workspaceId_fkey";
