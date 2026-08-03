/*
Post-deploy: drop the plans.isBrandedFramesAllowed column.

Whitelabel frames are now gated by the `whitelabel_frames` feature flag instead
of this per-plan column, so the column is no longer read by any code. Run after
the code that stops referencing it is live.
 */
ALTER TABLE "public"."plans"
    DROP COLUMN "isBrandedFramesAllowed";
