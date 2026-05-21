// Idempotency helpers for the Metronome webhook handler.
//
// Metronome may redeliver the same event (network timeouts, our own 5xx
// responses, at-least-once delivery semantics). We dedupe on `event.id` via
// Redis: SET NX EX atomically claims the id for the window during which a
// redelivery is plausible. A duplicate finds the key already present and is
// short-circuited at the handler. If processing fails (we return 5xx or
// throw), the claim is released so the next retry can reprocess.

import { getRedisCacheClient } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// 7 days — well above Metronome's redelivery window, low enough that Redis
// memory stays bounded.
const METRONOME_WEBHOOK_DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60;

function dedupKey(eventId: string): string {
  return `metronome:webhook:event:${eventId}`;
}

/**
 * Atomically claim `eventId` for processing. Returns true if the caller now
 * owns the claim (proceed), false if another delivery already claimed it
 * (skip, ack 200).
 *
 * On Redis errors we fail open (return true) so that a transient cache
 * outage does not silently drop billing events.
 */
export async function tryClaimMetronomeWebhookEvent(
  eventId: string
): Promise<boolean> {
  try {
    const client = await getRedisCacheClient({
      origin: "metronome_webhook_dedup",
    });
    const result = await client.set(dedupKey(eventId), "1", {
      NX: true,
      EX: METRONOME_WEBHOOK_DEDUP_TTL_SECONDS,
    });
    return result === "OK";
  } catch (err) {
    logger.error(
      { eventId, error: normalizeError(err) },
      "[Metronome Webhook] Failed to claim event for dedup, proceeding without dedup"
    );
    return true;
  }
}

/**
 * Release the claim previously taken by `tryClaimMetronomeWebhookEvent`.
 * Called on the failure path so Metronome's retry can reprocess.
 */
export async function releaseMetronomeWebhookEvent(
  eventId: string
): Promise<void> {
  try {
    const client = await getRedisCacheClient({
      origin: "metronome_webhook_dedup",
    });
    await client.del(dedupKey(eventId));
  } catch (err) {
    logger.error(
      { eventId, error: normalizeError(err) },
      "[Metronome Webhook] Failed to release event dedup claim"
    );
  }
}
