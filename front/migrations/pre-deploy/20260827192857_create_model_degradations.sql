/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."model_degradations_id_seq"
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
CREATE TABLE "public"."model_degradations" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"endedAt" timestamp with time zone,
	"id" bigint DEFAULT nextval('model_degradations_id_seq'::regclass) NOT NULL,
	"modelId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"providerId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"status" character varying(255) COLLATE "pg_catalog"."default" NOT NULL
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY model_degradations_pkey ON public.model_degradations USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."model_degradations" ADD CONSTRAINT "model_degradations_pkey" PRIMARY KEY USING INDEX "model_degradations_pkey";

/*
Statement 4
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY model_degradations_model_id_ongoing_unique_idx ON public.model_degradations USING btree ("modelId") WHERE ((status)::text = 'ongoing'::text);

/*
Statement 5
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY model_degradations_started_at_idx ON public.model_degradations USING btree ("startedAt");

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."model_degradations_id_seq" OWNED BY "public"."model_degradations"."id";
