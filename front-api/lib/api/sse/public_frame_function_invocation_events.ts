import {
  checkPublicInvocationResultToken,
  resolvePublicFrameShare,
  toPublicInvocationStreamEvent,
} from "@app/lib/api/frames/public_functions";
import {
  getSandboxFunctionInvocationEvents,
  getSandboxFunctionInvocationEventsBatch,
} from "@app/lib/api/sandbox_functions/events";
import { removeNulls } from "@app/types/shared/utils/general";
import { pollEvents } from "@front-api/lib/api/sse/poll_events";
import { streamEvents } from "@front-api/lib/api/sse/stream_events";
import type { Context } from "hono";
import { z } from "zod";

export const PublicFrameFunctionInvocationEventParamSchema = z.object({
  token: z.string().min(1),
  invocationId: z.string().min(1),
});

type StreamPublicFrameFunctionInvocationEventsInput = {
  token: string;
  invocationId: string;
  lastEventId: string | null;
  resultToken: string | undefined;
};

export async function streamPublicFrameFunctionInvocationEventsForRoute(
  ctx: Context,
  {
    token,
    invocationId,
    lastEventId,
    resultToken,
  }: StreamPublicFrameFunctionInvocationEventsInput,
  transport: "sse" | "poll" = "sse"
) {
  const share = await resolvePublicFrameShare(token);
  if (!share || !resultToken) {
    return ctx.notFound();
  }

  if (
    !(await checkPublicInvocationResultToken(share, {
      invocationId,
      resultToken,
    }))
  ) {
    return ctx.notFound();
  }

  if (transport === "poll") {
    return pollEvents(ctx, async (signal) => {
      const events = await getSandboxFunctionInvocationEventsBatch({
        invocationId,
        lastEventId,
        signal,
      });
      return {
        events: removeNulls(events.map(toPublicInvocationStreamEvent)).map(
          (event) => JSON.stringify(event)
        ),
      };
    });
  }

  return streamEvents({
    ctx,
    iterator: (signal) =>
      getSandboxFunctionInvocationEvents({
        invocationId,
        lastEventId,
        signal,
      }),
    transform: toPublicInvocationStreamEvent,
    writeDoneSentinel: true,
  });
}
