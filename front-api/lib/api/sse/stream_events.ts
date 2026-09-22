import { MANAGED_SSE_HANDSHAKE_EVENT } from "@app/types/sse";
import { setSSEHeaders } from "@front-api/middlewares/streaming";
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";

const SSE_HANDSHAKE = `event: ${MANAGED_SSE_HANDSHAKE_EVENT}\ndata: {}\n\n`;

// Standard SSE resume parameter shared by every streaming route. An absent or
// empty `lastEventId` (clients reconnecting without a prior event send `?lastEventId=`)
// normalizes to null rather than failing validation.
export const SseQuerySchema = z.object({
  lastEventId: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
});

type StreamEventsParams<TIn> = {
  ctx: Context;
  iterator: (signal: AbortSignal) => AsyncIterable<TIn>;
  // Returning `null` skips the event without writing anything. May be
  // sync or async — the helper always awaits.
  transform?: (event: TIn) => unknown | null | Promise<unknown | null>;
  // When true, writes `data: done` after the iterator completes. Clients treat
  // this as an immediate reconnect signal (history pagination, idle timeout).
  // MCP requests also opt in; conversation/message routes use it for the same
  // pagination handoff after Redis history replay.
  writeDoneSentinel?: boolean;
};

/**
 * @cc [owner:id13,label:api;architecture] managed-sse-handshake
 * `streamEvents` MUST write the managed SSE handshake before it starts consuming the event
 * iterator so clients can verify that streaming response bytes reach the browser.
 */
export function streamEvents<TIn>(params: StreamEventsParams<TIn>) {
  setSSEHeaders(params.ctx);

  return stream(params.ctx, async (s) => {
    const controller = new AbortController();
    s.onAbort(() => controller.abort());

    await s.write(SSE_HANDSHAKE);

    for await (const event of params.iterator(controller.signal)) {
      const out: unknown = params.transform
        ? await params.transform(event)
        : event;
      if (out === null) {
        continue;
      }
      await s.write(`data: ${JSON.stringify(out)}\n\n`);
      if (s.aborted || controller.signal.aborted) {
        break;
      }
    }

    if (params.writeDoneSentinel) {
      await s.write("data: done\n\n");
    }
  });
}
