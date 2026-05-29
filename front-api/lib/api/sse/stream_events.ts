import { setSSEHeaders } from "@front-api/middlewares/streaming";
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";

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
  // Only MCP requests opts in. Conversation/message events rely on EOF
  // alone — the SDK already filters "done" before JSON-parsing, so no
  // consumer treats it as a terminator.
  writeDoneSentinel?: boolean;
};

export function streamEvents<TIn>(params: StreamEventsParams<TIn>) {
  setSSEHeaders(params.ctx);

  return stream(params.ctx, async (s) => {
    const controller = new AbortController();
    s.onAbort(() => controller.abort());

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
