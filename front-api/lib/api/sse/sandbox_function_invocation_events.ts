import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
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
    access = "viewer",
  }: {
    functionId: string;
    invocationId: string;
    lastEventId: string | null;
    access?: "viewer" | "email_viewer";
  }
) {
  const sandboxFunction = await SandboxFunctionResource.fetchById(
    auth,
    functionId
  );
  if (!sandboxFunction) {
    return ctx.notFound();
  }

  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
    access,
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
