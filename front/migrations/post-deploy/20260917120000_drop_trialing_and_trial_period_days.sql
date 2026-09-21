/*
Post-deploy: drop the dead `trialing` (subscriptions) and `trialPeriodDays` (plans) columns.

Stripe subscription free trials are no longer supported (see #32670): all code reading or writing
these columns was removed and the columns were dropped from the Sequelize models. This runs after
that code is fully rolled out, so no live pod reads them anymore.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."subscriptions" DROP COLUMN IF EXISTS "trialing";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."plans" DROP COLUMN IF EXISTS "trialPeriodDays";
