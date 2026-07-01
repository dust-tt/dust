import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { callSandboxFunction } from "@app/lib/api/sandbox_functions/call_sandbox_function";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { Err, Ok } from "@app/types/shared/result";

export async function callHandler(
  { slug, input }: { slug: string; input?: Record<string, unknown> },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, { agentLoopContext });
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
      new MCPError(`No sandbox function with slug "${slug}" in this pod.`, {
        tracked: false,
      })
    );
  }

  const result = await callSandboxFunction(auth, sandboxFunction, input);
  if (result.isErr()) {
    return new Err(new MCPError(result.error.message));
  }

  const outcome = result.value;
  if (!outcome.ok) {
    // The function ran but returned an error: model- or builder-correctable, not internal.
    return new Err(
      new MCPError(
        `Sandbox function "${slug}" returned an error (${outcome.errorKind}): ${outcome.message}`,
        { tracked: false }
      )
    );
  }

  return new Ok([
    {
      type: "text",
      text: [
        `HTTP ${outcome.status}`,
        "",
        "Response Body:",
        outcome.output,
      ].join("\n"),
    },
  ]);
}
