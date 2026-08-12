import { runOnRedis } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Exec-activity counters for the reaper's sleep flow.
 *
 * The lifecycle lock serializes transitions but has never covered a running exec, so the reaper
 * could pause a sandbox while an exec was still committing pod-state writes after the pre-sleep
 * flush — writes a later destroy would drop, since sleepers are not re-flushed. These counters
 * give the sleep flow a precise signal where `lastActivityAt` cannot (its writes are throttled
 * to one per 30s):
 *
 * - `started` is monotonic, so an exec that both started and finished during the flush still
 *   moves it;
 * - `started - finished` is the in-flight count.
 *
 * Both keys expire together a few minutes after the last record on either: every record
 * refreshes both TTLs in one MULTI, so the pair cannot drift apart and a replica that dies
 * mid-exec leaves an imbalance that expiry clears rather than a count that never settles. The
 * TTL comfortably exceeds every exec ceiling (SANDBOX_MAX_COMMAND_TIMEOUT_MS,
 * SANDBOX_FUNCTION_EXEC_TIMEOUT_MS and BUILD_EXEC_TIMEOUT_MS are all <= 2 minutes), so a live
 * exec can never have its start expire from under it; a caller introducing a longer timeout
 * must bump this in step.
 */

const EXEC_ACTIVITY_TTL_SECONDS = 10 * 60;

const REDIS_ORIGIN = "sandbox_exec_activity" as const;

function startedKey(sandboxId: string): string {
  return `sandbox:exec-activity:started:${sandboxId}`;
}

function finishedKey(sandboxId: string): string {
  return `sandbox:exec-activity:finished:${sandboxId}`;
}

export interface SandboxExecActivity {
  started: number;
  inFlight: number;
}

/**
 * Best-effort: an exec must never fail because the activity counter could not be written. The
 * MULTI keeps each record atomic (no increment can land without its TTL refresh), but a lost
 * start with a surviving end still leaves a deficit the read-side clamp absorbs — the guard
 * then under-reports until a quiet TTL window expires both keys together. The pre-existing
 * rarity of the race this module closes bounds that exposure.
 */
export async function recordSandboxExecStart(sandboxId: string): Promise<void> {
  try {
    await runOnRedis({ origin: REDIS_ORIGIN }, (client) =>
      client
        .multi()
        .incr(startedKey(sandboxId))
        .expire(startedKey(sandboxId), EXEC_ACTIVITY_TTL_SECONDS)
        .expire(finishedKey(sandboxId), EXEC_ACTIVITY_TTL_SECONDS)
        .exec()
    );
  } catch (err) {
    logger.warn(
      { sandboxId, err: normalizeError(err) },
      "Failed to record sandbox exec start"
    );
  }
}

/**
 * Same best-effort contract as the start, and callers need not await it: this only ever lowers
 * the in-flight count, so arriving late (or not at all) can only make the guard conservative.
 * Records commute, so an end landing after an unrelated exec's start is harmless.
 */
export async function recordSandboxExecEnd(sandboxId: string): Promise<void> {
  try {
    await runOnRedis({ origin: REDIS_ORIGIN }, (client) =>
      client
        .multi()
        .incr(finishedKey(sandboxId))
        .expire(finishedKey(sandboxId), EXEC_ACTIVITY_TTL_SECONDS)
        .expire(startedKey(sandboxId), EXEC_ACTIVITY_TTL_SECONDS)
        .exec()
    );
  } catch (err) {
    logger.warn(
      { sandboxId, err: normalizeError(err) },
      "Failed to record sandbox exec end"
    );
  }
}

/**
 * Errors propagate: the sleep flow must fail closed (skip the sleep and retry next cycle) when
 * the signal is unreadable, not pause a sandbox it cannot clear.
 */
export async function readSandboxExecActivity(
  sandboxId: string
): Promise<Result<SandboxExecActivity, Error>> {
  try {
    const [startedRaw, finishedRaw] = await runOnRedis(
      { origin: REDIS_ORIGIN },
      (client) => client.mGet([startedKey(sandboxId), finishedKey(sandboxId)])
    );
    const started = startedRaw === null ? 0 : parseInt(startedRaw, 10);
    const finished = finishedRaw === null ? 0 : parseInt(finishedRaw, 10);
    return new Ok({
      started,
      // Expiry (or a crashed replica) can leave the pair unbalanced in either direction; a
      // negative in-flight count means "finished outlived started" and carries no signal.
      inFlight: Math.max(0, started - finished),
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
