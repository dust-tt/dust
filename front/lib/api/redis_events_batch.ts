import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";

const LIVE_EVENT_BATCH_DELAY_MS = 50;

/**
 * @cc [owner:id13,label:concurrency;performance] redis-event-batch-lifecycle
 * A batch MUST preserve history and live event order and unsubscribe on completion or cancellation,
 * including cancellation during subscription setup. A closed channel MUST release the wait.
 * Cancellation during batching MUST release its timer without waiting for the batch window.
 */
/**
 * @cc [owner:id13,label:concurrency;reliability] redis-poll-stream-order
 * Poll batches MUST contain a contiguous page of Redis stream events after the resume cursor.
 * Pub/sub notification order or delay MUST NOT reorder events or skip earlier persisted events.
 */
export async function getRedisEventsBatch({
  channel,
  origin,
  lastEventId,
  signal,
}: {
  channel: string;
  origin: string;
  lastEventId: string | null;
  signal: AbortSignal;
}): Promise<EventPayload[]> {
  const manager = getRedisHybridManager();
  const batchReady = Promise.withResolvers<void>();
  let closed = false;
  const { unsubscribe } = await manager.subscribe(
    channel,
    (event) => {
      closed ||= event === "close";
      batchReady.resolve();
    },
    origin,
    { skipHistory: true, signal }
  );
  const batchWindow = Promise.withResolvers<void>();
  let batchTimer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => {
    batchReady.resolve();
    batchWindow.resolve();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) {
      return [];
    }
    const history = await manager.readEventsAfter(channel, lastEventId);
    if (history.length > 0 || signal.aborted) {
      return history;
    }
    await batchReady.promise;
    if (!closed && !signal.aborted) {
      batchTimer = setTimeout(batchWindow.resolve, LIVE_EVENT_BATCH_DELAY_MS);
      await batchWindow.promise;
    }
    return signal.aborted
      ? []
      : await manager.readEventsAfter(channel, lastEventId);
  } finally {
    clearTimeout(batchTimer);
    signal.removeEventListener("abort", onAbort);
    unsubscribe();
  }
}
