/*
Add tabsOrder (system tab ids + frame paths) for interleaved pod nav.
Settings stays last and is never stored here.

Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" ADD COLUMN "tabsOrder" varchar(255)[] NOT NULL DEFAULT ARRAY[]::varchar(255)[];
