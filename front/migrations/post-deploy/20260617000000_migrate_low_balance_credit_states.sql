-- Migrate legacy low-balance credit states to their canonical equivalents.
--
-- `on_pool_low_balance` and `user_seat_low_balance` were sub-states that encoded
-- the near-limit warning signal inside the credit state. The warning is now held
-- in a separate `nearLimit` Redis flag (see user_block.ts), so these states carry
-- no additional meaning beyond their canonical equivalents.
--
-- After this migration runs, the alias mappings and the states themselves can be
-- removed from USER_CREDIT_STATES and transitionUserCreditState.

UPDATE "memberships"
SET "creditState" = 'on_pool'
WHERE "creditState" = 'on_pool_low_balance';

UPDATE "memberships"
SET "creditState" = 'user_seat'
WHERE "creditState" = 'user_seat_low_balance';
