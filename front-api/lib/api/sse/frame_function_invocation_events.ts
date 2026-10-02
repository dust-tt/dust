import {
  getSandboxFunctionInvocationEvents,
  getSandboxFunctionInvocationEventsBatch,
} from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { pollEvents } from "@front-api/lib/api/sse/poll_events";
import { streamEvents } from "@front-api/lib/api/sse/stream_events";
import type { Context } from "hono";
import { z } from "zod";

export const FrameFunctionInvocationEventParamSchema = z.object({
  frameId: z.string().min(1),
  invocationId: z.string().min(1),
});

export async function streamFrameFunctionInvocationEventsForRoute(
  ctx: Context,
  auth: Authenticator,
  {
    frameId,
    invocationId,
    lastEventId,
  }: {
    frameId: string;
    invocationId: string;
    lastEventId: string | null;
  },
  transport: "sse" | "poll" = "sse"
) {
  const frame = await FileResource.fetchById(auth, frameId);
  if (!frame?.isFrameV2 || !(await frame.canCurrentUserUseFrame(auth))) {
    return ctx.notFound();
  }

  const invocation = await SandboxFunctionResource.fetchInvocationByFrameAndId(
    auth,
    { frame, invocationId }
  );
  if (!invocation) {
    return ctx.notFound();
  }

  if (transport === "poll") {
    return pollEvents(ctx, async (signal) => {
      const events = await getSandboxFunctionInvocationEventsBatch({
        invocationId: invocation.sId,
        lastEventId,
        signal,
      });
      return { events: events.map((event) => JSON.stringify(event)) };
    });
  }

  return streamEvents({
    ctx,
    iterator: (signal) =>
      getSandboxFunctionInvocationEvents({
        invocationId: invocation.sId,
        lastEventId,
        signal,
      }),
    writeDoneSentinel: true,
  });
}
