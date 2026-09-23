/* Statement 0: name — add the temporary constraint without scanning existing rows. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD CONSTRAINT "agents_name_not_null_check" CHECK("name" IS NOT NULL) NOT VALID;

/* Statement 1: name — validate existing rows without blocking normal reads and writes. */
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" VALIDATE CONSTRAINT "agents_name_not_null_check";

/* Statement 2: name — make the column NOT NULL using the validated constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ALTER COLUMN "name" SET NOT NULL;

/* Statement 3: name — remove the temporary constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" DROP CONSTRAINT "agents_name_not_null_check";

/* Statement 4: status — add the temporary constraint without scanning existing rows. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD CONSTRAINT "agents_status_not_null_check" CHECK("status" IS NOT NULL) NOT VALID;

/* Statement 5: status — validate existing rows without blocking normal reads and writes. */
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" VALIDATE CONSTRAINT "agents_status_not_null_check";

/* Statement 6: status — make the column NOT NULL using the validated constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ALTER COLUMN "status" SET NOT NULL;

/* Statement 7: status — remove the temporary constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" DROP CONSTRAINT "agents_status_not_null_check";

/* Statement 8: scope — add the temporary constraint without scanning existing rows. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD CONSTRAINT "agents_scope_not_null_check" CHECK("scope" IS NOT NULL) NOT VALID;

/* Statement 9: scope — validate existing rows without blocking normal reads and writes. */
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" VALIDATE CONSTRAINT "agents_scope_not_null_check";

/* Statement 10: scope — make the column NOT NULL using the validated constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ALTER COLUMN "scope" SET NOT NULL;

/* Statement 11: scope — remove the temporary constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" DROP CONSTRAINT "agents_scope_not_null_check";

/* Statement 12: reinforcement — add the temporary constraint without scanning existing rows. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD CONSTRAINT "agents_reinforcement_not_null_check" CHECK("reinforcement" IS NOT NULL) NOT VALID;

/* Statement 13: reinforcement — validate existing rows without blocking normal reads and writes. */
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" VALIDATE CONSTRAINT "agents_reinforcement_not_null_check";

/* Statement 14: reinforcement — make the column NOT NULL using the validated constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ALTER COLUMN "reinforcement" SET NOT NULL;

/* Statement 15: reinforcement — remove the temporary constraint. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" DROP CONSTRAINT "agents_reinforcement_not_null_check";
