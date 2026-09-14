/*
Pre-deploy: normalize legacy `memberships.creditState` values onto the narrowed
`user_seat` / `on_pool` set.

The per-user spend-cap credit-state machine was removed (spend caps are enforced
from the Redis rate limiter); the column now only carries the seat↔pool
dimension. Read paths already normalize legacy values via
`normalizeUserCreditState`, so this backfill just cleans the stored rows.

  user_seat_low_balance                     -> user_seat
  normal / on_pool_low_balance / capped     -> on_pool
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 300000;
SET SESSION lock_timeout = 3000;
UPDATE "public"."memberships"
    SET "creditState" = 'user_seat'
    WHERE "creditState" = 'user_seat_low_balance';

/*
Statement 1
*/
SET SESSION statement_timeout = 300000;
SET SESSION lock_timeout = 3000;
UPDATE "public"."memberships"
    SET "creditState" = 'on_pool'
    WHERE "creditState" IN ('normal', 'on_pool_low_balance', 'capped');
