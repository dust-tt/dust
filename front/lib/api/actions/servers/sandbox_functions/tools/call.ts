import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { callSandboxFunction } from "@app/lib/api/sandbox_functions/call_sandbox_function";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { Err, Ok } from "@app/types/shared/result";

export async function callHandler(
  { slug, input }: { slug: string; input?: Record<string, unknown> },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(
    auth,
    { toolContext: { runContext } },
    {
      hiddenPodFallback: true,
    }
  );
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const sandboxFunction = await SandboxFunctionResource.fetchBySpaceAndSlug(
    auth,
    podResult.value.pod,
    slug
  );
  if (!sandboxFunction) {
    return new Err(
      new MCPError(`No pod function with slug "${slug}" in this pod.`, {
        tracked: false,
      })
    );
  }

  const timezone = isAgentLoopRunContext(runContext)
    ? runContext.userMessage.context.timezone
    : runContext.invocation.context?.timezone;
  const result = await callSandboxFunction(
    auth,
    sandboxFunction,
    input,
    timezone === undefined ? undefined : { timezone }
  );
  if (result.isErr()) {
    const { code, message } = result.error;
    return new Err(
      new MCPError(
        `Pod function "${slug}" returned an error (${code}): ${message}`,
        {
          tracked: code === "invocation_failed" || code === "transport_error",
        }
      )
    );
  }

  return new Ok([
    {
      type: "text",
      text: JSON.stringify(result.value, null, 2) ?? "null",
    },
  ]);
}
