import { runOnRedis } from "@app/lib/api/redis";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { createCallbackReader } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type {
  SandboxFunctionPollerEvent,
  SandboxFunctionPollerJob,
} from "@app/types/api/sandbox_functions";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import crypto from "crypto";
import { z } from "zod";

const SANDBOX_FUNCTION_POLLER_ORIGIN = "sandbox_function_poller" as const;

// How long a connect keeps the pod marked as reachable. Comfortably longer than the heartbeat
// below, so an ordinary slow refresh does not read as a disconnect, and short enough that a pod
// that died without closing stops attracting jobs quickly.
export const POLLER_PRESENCE_TTL_SECONDS = 90;

// How often an open channel refreshes its presence key.
export const POLLER_PRESENCE_REFRESH_INTERVAL_MS = 20_000;

// How long a connect stays open before the poller reconnects. Reconnecting is what rotates the
// poller's token, and it bounds how long a job sits behind a half-open connection.
export const POLLER_CHANNEL_DURATION_MS = 60_000;

// The longest a published job may ask to run for. Enforced at publish so the claim below can
// outlive any job it guards: a claim that lapsed mid-run would let the exec fallback start a
// second copy of a function that is already running.
export const POLLER_MAX_JOB_TIMEOUT_MS = 30_000;

// How long a claimed invocation stays claimed. Sized off the job ceiling rather than guessed, so
// the claim is still held when the slowest legal job finishes.
const POLLER_CLAIM_TTL_MS = POLLER_MAX_JOB_TIMEOUT_MS * 2;

// How long a published job waits to be picked up. A job nobody claims is run by the exec fallback
// instead, so this only has to cover the handoff.
const POLLER_JOB_TTL_MS = POLLER_MAX_JOB_TIMEOUT_MS * 2;

// Who is running an invocation. Recorded rather than a bare flag so logs say which side won a
// race, and so a claim that is never released is attributable.
export type SandboxFunctionInvocationRunner = "poller" | "exec";

// The job as stored for pickup, alongside the pod it was dispatched to. The pod is what binds a
// claim to its addressee: invocation ids are derived from a public sqids alphabet and are
// therefore guessable, so without this a compromised pod could claim invocations belonging to
// other pods, and other workspaces, purely to stop them running.
const StoredPollerJobSchema = z.object({
  sandboxId: z.string(),
  job: z.object({
    invocationId: z.string(),
    functionId: z.string(),
    slug: z.string(),
    execToken: z.string(),
    inputEnvelope: z.string(),
    envVars: z.record(z.string()),
    timeoutMs: z.number().int().positive(),
  }),
});

function pollerChannelId({ sandboxId }: { sandboxId: string }): string {
  return `sandbox-function-poller-${sandboxId}`;
}

function pollerPresenceRedisKey({ sandboxId }: { sandboxId: string }): string {
  return `sandbox:${sandboxId}:poller:presence`;
}

function pollerJobRedisKey({ invocationId }: { invocationId: string }): string {
  return `sandbox-function-invocation:${invocationId}:poller-job`;
}

function invocationClaimRedisKey({
  invocationId,
}: {
  invocationId: string;
}): string {
  return `sandbox-function-invocation:${invocationId}:runner`;
}

/**
 * Mark a pod as reachable over its work channel, and keep it marked.
 *
 * Called on connect and again on every heartbeat. The key expiring is what makes a pod that
 * vanished without closing stop attracting jobs, so refreshing is not optional while a channel is
 * open.
 *
 * The value records which connect holds the pod, so a connect that is closing can tell its own
 * presence from that of the connect that replaced it.
 */
export async function refreshPollerChannelPresence({
  sandboxId,
  connectId,
}: {
  sandboxId: string;
  connectId: string;
}): Promise<void> {
  await runOnRedis({ origin: SANDBOX_FUNCTION_POLLER_ORIGIN }, (client) =>
    client.set(pollerPresenceRedisKey({ sandboxId }), connectId, {
      EX: POLLER_PRESENCE_TTL_SECONDS,
    })
  );
}

/**
 * Drop a pod's presence as soon as its channel closes, rather than waiting out the TTL.
 *
 * Only clears presence this connect still holds, and does it in one atomic step. A poller
 * reconnects every minute and nothing orders the old connect's cleanup against the new one's
 * opening, so a delete that did not compare, or compared in a separate round trip, would blank the
 * presence of a channel that is up and listening and send its pod's invocations down the slow path
 * until the next heartbeat.
 */
export async function clearPollerChannelPresence({
  sandboxId,
  connectId,
}: {
  sandboxId: string;
  connectId: string;
}): Promise<void> {
  // Same compare-and-delete as `distributedUnlock`, which exists for exactly this reason.
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  await runOnRedis({ origin: SANDBOX_FUNCTION_POLLER_ORIGIN }, (client) =>
    client.eval(luaScript, {
      keys: [pollerPresenceRedisKey({ sandboxId })],
      arguments: [connectId],
    })
  );
}

/**
 * Whether a pod currently holds an open work channel.
 *
 * A routing hint, never a guarantee: presence can be stale in both directions, and what keeps an
 * invocation from running twice is the claim below, not this.
 */
export async function isPollerChannelOpen({
  sandboxId,
}: {
  sandboxId: string;
}): Promise<boolean> {
  return runOnRedis(
    { origin: SANDBOX_FUNCTION_POLLER_ORIGIN },
    async (client) => {
      const exists = await client.exists(pollerPresenceRedisKey({ sandboxId }));
      return exists === 1;
    }
  );
}

/**
 * Claim an invocation for a pod's poller, and hand it the job if it won.
 *
 * The single arbiter between the poller and the exec fallback. Presence tells the caller where to
 * ring; this decides who actually runs the invocation, which is what makes a stale presence key or
 * a replayed doorbell safe. Returns null when the invocation was not dispatched to this pod, or
 * when someone else already holds the claim.
 */
export async function claimPollerJob({
  invocationId,
  sandboxId,
}: {
  invocationId: string;
  sandboxId: string;
}): Promise<SandboxFunctionPollerJob | null> {
  return runOnRedis(
    { origin: SANDBOX_FUNCTION_POLLER_ORIGIN },
    async (client) => {
      const stored = await client.get(pollerJobRedisKey({ invocationId }));
      if (!stored) {
        return null;
      }

      const parsed = safeParseJSON(stored);
      if (parsed.isErr()) {
        return null;
      }
      const validation = StoredPollerJobSchema.safeParse(parsed.value);
      if (!validation.success) {
        return null;
      }
      if (validation.data.sandboxId !== sandboxId) {
        logger.warn(
          { invocationId, sandboxId },
          "A Pod tried to claim a Pod function invocation dispatched elsewhere"
        );
        return null;
      }

      const claimed = await client.set(
        invocationClaimRedisKey({ invocationId }),
        "poller",
        { NX: true, PX: POLLER_CLAIM_TTL_MS }
      );
      if (claimed !== "OK") {
        return null;
      }

      // The job has been handed over, so it has no reason to stay: leaving it would keep the
      // invocation's credential and its caller's input in Redis for the rest of their window.
      await client.del(pollerJobRedisKey({ invocationId }));

      return validation.data.job;
    }
  );
}

/**
 * Drop a dispatched job that will not be picked up.
 *
 * Called once the exec fallback has the claim. The claim alone already stops a late poller from
 * running it, but a job left behind keeps the invocation's credential and its caller's input in
 * Redis for the rest of their window, and makes the safety of a late doorbell depend on the claim
 * outliving the job rather than on the job being gone.
 */
export async function discardPollerJob({
  invocationId,
}: {
  invocationId: string;
}): Promise<void> {
  await runOnRedis({ origin: SANDBOX_FUNCTION_POLLER_ORIGIN }, (client) =>
    client.del(pollerJobRedisKey({ invocationId }))
  );
}

/**
 * Claim an invocation for the exec fallback, so the poller cannot also run it.
 *
 * The other side of the same arbiter. Takes no job: the exec path already holds everything it
 * needs, it only needs to know the poller has not started.
 */
export async function claimInvocationForExec({
  invocationId,
}: {
  invocationId: string;
}): Promise<boolean> {
  return runOnRedis(
    { origin: SANDBOX_FUNCTION_POLLER_ORIGIN },
    async (client) => {
      const claimed = await client.set(
        invocationClaimRedisKey({ invocationId }),
        "exec",
        { NX: true, PX: POLLER_CLAIM_TTL_MS }
      );
      return claimed === "OK";
    }
  );
}

/**
 * Dispatch a job to a pod: store it for pickup, then ring the pod's channel.
 *
 * The job is stored first so it is always there by the time the doorbell arrives. The doorbell
 * goes through the hybrid manager, so it lands in the channel's stream as well as its pub/sub
 * channel: a poller reconnecting replays from its last event id, so a job rung into the gap
 * between two connects is still answered.
 */
export async function publishPollerJob(
  job: SandboxFunctionPollerJob,
  { sandboxId }: { sandboxId: string }
): Promise<void> {
  if (job.timeoutMs > POLLER_MAX_JOB_TIMEOUT_MS) {
    // A caller asking for longer than the claim can guard would let the exec fallback start a
    // second copy mid-run. Nothing legitimately publishes such a job, so this is a bug.
    throw new Error(
      `A Pod function poller job cannot run for longer than ${POLLER_MAX_JOB_TIMEOUT_MS}ms.`
    );
  }

  await runOnRedis({ origin: SANDBOX_FUNCTION_POLLER_ORIGIN }, (client) =>
    client.set(
      pollerJobRedisKey({ invocationId: job.invocationId }),
      JSON.stringify({ sandboxId, job }),
      { PX: POLLER_JOB_TTL_MS }
    )
  );

  const event: SandboxFunctionPollerEvent = {
    type: "sandbox_function_poller_job",
    created: Date.now(),
    invocationId: job.invocationId,
  };

  await getRedisHybridManager().publish(
    pollerChannelId({ sandboxId }),
    JSON.stringify(event),
    SANDBOX_FUNCTION_POLLER_ORIGIN
  );
}

export type SandboxFunctionPollerStreamEvent = {
  eventId: string;
  data: SandboxFunctionPollerEvent;
};

const PollerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sandbox_function_poller_job"),
    created: z.number(),
    invocationId: z.string(),
  }),
  z.object({
    type: z.literal("sandbox_function_poller_token"),
    created: z.number(),
    token: z.string(),
  }),
]);

/**
 * Hold a pod's work channel open, yielding what the poller should act on.
 *
 * Owns the whole life of one connect: it marks the pod reachable, hands the poller the token for
 * its next connect, keeps presence fresh while it streams doorbells, and drops presence when it
 * ends. Presence upkeep lives here rather than beside it because a channel that is open but no
 * longer refreshing would keep attracting jobs nothing is listening for.
 *
 * Ends on its own after `POLLER_CHANNEL_DURATION_MS` so the poller reconnects on a known cadence,
 * which is also what rotates its token.
 */
export async function* openPollerChannel({
  sandboxId,
  rotatedToken,
  lastEventId,
  signal,
}: {
  sandboxId: string;
  rotatedToken: string;
  lastEventId: string | null;
  signal: AbortSignal;
}): AsyncGenerator<SandboxFunctionPollerStreamEvent, void> {
  const connectId = crypto.randomUUID();
  const callbackReader = createCallbackReader<EventPayload | "close">();
  const { history, unsubscribe } = await getRedisHybridManager().subscribe(
    pollerChannelId({ sandboxId }),
    callbackReader.callback,
    SANDBOX_FUNCTION_POLLER_ORIGIN,
    // A poller with no resume point is starting fresh, not catching up: replaying from the start
    // of a stream that is retained for minutes would re-ring every invocation the exec fallback
    // has long since run.
    lastEventId === null ? { skipHistory: true } : { lastEventId }
  );

  let unsubscribed = false;
  const unsubscribeOnce = () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;
    unsubscribe();
  };

  signal.addEventListener("abort", unsubscribeOnce, { once: true });

  try {
    await refreshPollerChannelPresence({ sandboxId, connectId });

    // Sent before any doorbell so a poller that drops mid-connect still has a usable credential to
    // reconnect with. Carries the resume point it arrived with, so a poller that stores every
    // event id it sees does not rewind itself by treating this one as progress.
    yield {
      eventId: lastEventId ?? "",
      data: {
        type: "sandbox_function_poller_token",
        created: Date.now(),
        token: rotatedToken,
      },
    };

    for (const rawEvent of history) {
      const event = parsePollerEvent(rawEvent);
      if (event) {
        yield event;
      }
    }

    const deadlineMs = Date.now() + POLLER_CHANNEL_DURATION_MS;
    // Held across iterations on purpose. `createCallbackReader` only buffers when no waiter is
    // registered, so abandoning this promise on every heartbeat would drop any doorbell that
    // arrived while the heartbeat was in flight.
    let pendingEvent = callbackReader.next();
    while (!signal.aborted) {
      const remainingMs = deadlineMs - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const waitMs = Math.min(remainingMs, POLLER_PRESENCE_REFRESH_INTERVAL_MS);
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        timeoutId = setTimeout(() => resolve("timeout"), waitMs);
      });
      const rawEvent = await Promise.race([pendingEvent, timeoutPromise]);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      if (rawEvent === "close") {
        break;
      }
      // A quiet channel is the common case: the wait elapsing means it is time to refresh
      // presence, not that the channel is done.
      if (rawEvent === "timeout") {
        await refreshPollerChannelPresence({ sandboxId, connectId });
        continue;
      }

      pendingEvent = callbackReader.next();
      const event = parsePollerEvent(rawEvent);
      if (event) {
        yield event;
      }
    }
  } catch (error) {
    logger.error(
      { error: normalizeError(error).message, sandboxId },
      "Error streaming Pod function poller doorbells"
    );
  } finally {
    signal.removeEventListener("abort", unsubscribeOnce);
    unsubscribeOnce();
    await clearPollerChannelPresence({ sandboxId, connectId }).catch((error) =>
      logger.error(
        { error: normalizeError(error).message, sandboxId },
        "Failed to clear Pod function poller presence"
      )
    );
  }
}

function parsePollerEvent(
  rawEvent: EventPayload
): SandboxFunctionPollerStreamEvent | null {
  const parsed = safeParseJSON(rawEvent.message.payload);
  if (parsed.isErr()) {
    logger.error(
      { eventId: rawEvent.id },
      "Skipping an unparseable Pod function poller event"
    );
    return null;
  }

  const validation = PollerEventSchema.safeParse(parsed.value);
  if (!validation.success) {
    logger.error(
      { eventId: rawEvent.id },
      "Skipping a Pod function poller event that does not match the contract"
    );
    return null;
  }

  return { eventId: rawEvent.id, data: validation.data };
}
