import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
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
  }
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
