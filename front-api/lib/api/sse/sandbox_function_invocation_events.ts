import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import { resolveSandboxFunctionWithCapability } from "@app/lib/api/sandbox_functions/frame_share_capability";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { streamEvents } from "@front-api/lib/api/sse/stream_events";
import type { Context } from "hono";
import { z } from "zod";

export const SandboxFunctionInvocationEventParamSchema = z.object({
  functionId: z.string().min(1),
  invocationId: z.string().min(1),
});

export async function streamSandboxFunctionInvocationEventsForRoute(
  ctx: Context,
  auth: Authenticator,
  {
    functionId,
    invocationId,
    lastEventId,
  }: {
    functionId: string;
    invocationId: string;
    lastEventId: string | null;
  }
) {
  const sandboxFunction = await resolveSandboxFunctionWithCapability(
    auth,
    functionId,
    { allowInactiveFramePublication: true }
  );
  if (!sandboxFunction) {
    return ctx.notFound();
  }

  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
  });
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
