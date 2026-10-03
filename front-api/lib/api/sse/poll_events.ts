import type { LongPollBatch } from "@app/types/event_source";
import type { Context, TypedResponse } from "hono";

const LONG_POLL_TIMEOUT_MS = 25_000;

/**
 * @cc [owner:id13,label:api;concurrency] event-poll-cancellation
 * Polling MUST abort its reader after 25 seconds or when the request aborts, including requests
 * aborted before polling starts. Request listeners and deadline timers MUST be released.
 */
export async function pollEvents(
  ctx: Context,
  read: (signal: AbortSignal) => Promise<LongPollBatch>
): Promise<Response & TypedResponse<LongPollBatch, 200, "json">> {
  ctx.header("Cache-Control", "no-store");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LONG_POLL_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  ctx.req.raw.signal.addEventListener("abort", onAbort, { once: true });
  if (ctx.req.raw.signal.aborted) {
    controller.abort();
  }
  try {
    return ctx.json(await read(controller.signal));
  } finally {
    clearTimeout(timeout);
    ctx.req.raw.signal.removeEventListener("abort", onAbort);
  }
}
