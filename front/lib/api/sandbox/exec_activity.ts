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
 * Both keys expire a few minutes after the last exec: a replica that dies mid-exec leaves the
 * pair unbalanced, and expiry is what un-wedges the sleep rather than a count that never
 * settles. The TTL comfortably exceeds the exec ceiling (2 minutes), so a live exec can never
 * have its start expire from under it.
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
 * Best-effort: an exec must never fail because the activity counter could not be written. A
 * missed increment weakens one reaper cycle's guard, which the pre-existing rarity of the race
 * already bounds.
 */
export async function recordSandboxExecStart(sandboxId: string): Promise<void> {
  try {
    await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
      await client.incr(startedKey(sandboxId));
      await client.expire(startedKey(sandboxId), EXEC_ACTIVITY_TTL_SECONDS);
    });
  } catch (err) {
    logger.warn(
      { sandboxId, err: normalizeError(err) },
      "Failed to record sandbox exec start"
    );
  }
}

export async function recordSandboxExecEnd(sandboxId: string): Promise<void> {
  try {
    await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
      await client.incr(finishedKey(sandboxId));
      await client.expire(finishedKey(sandboxId), EXEC_ACTIVITY_TTL_SECONDS);
    });
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
