-- Per-user credit state ("memberships"."creditState") rename + extension.
--
-- The former "normal" state is renamed to "on_pool" (user spending from the
-- workspace pool) and the set of states is extended to model the
-- personal-credits → workspace-pool → cap progression:
--   user_seat, user_seat_low_balance, on_pool, on_pool_low_balance, capped.
--
-- "on_pool" is the renamed former "normal" state, so every existing row
-- migrates to it and it becomes the new column default.
ALTER TABLE "public"."memberships" ALTER COLUMN "creditState" SET DEFAULT 'on_pool';
UPDATE "public"."memberships" SET "creditState" = 'on_pool' WHERE "creditState" = 'normal';