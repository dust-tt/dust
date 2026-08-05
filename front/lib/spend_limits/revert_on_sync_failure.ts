import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";

/**
 * Every spend-limit setter persists the caller's intent to Postgres first
 * and only then derives the Metronome alerts from it. When
 * that derived sync fails, the DB write must be rolled back
 */
export async function revertOnSyncFailure<T, E>(
  result: Result<T, E>,
  {
    revert,
    logContext,
  }: {
    revert: () => Promise<void>;
    logContext: Record<string, unknown>;
  }
): Promise<Result<T, E>> {
  if (result.isErr()) {
    await revert();
    logger.error(
      { ...logContext, err: result.error },
      "[SpendLimit] Metronome sync failed; reverted DB value"
    );
  }
  return result;
}
