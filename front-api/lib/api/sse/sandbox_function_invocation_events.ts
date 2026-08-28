import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import { resolveSandboxFunctionWithCapability } from "@app/lib/api/sandbox_functions/frame_share_capability";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { FRAME_SHARE_TOKEN_HEADER } from "@app/types/api/sandbox_functions";
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
  // A frame host may present its frame's share token to reach the invocations of the frame's
  // app's functions (granted to members who may view the frame); the owner-scoped invocation
  // fetch below still applies.
  const sandboxFunction = await resolveSandboxFunctionWithCapability(
    auth,
    functionId,
    ctx.req.header(FRAME_SHARE_TOKEN_HEADER),
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
