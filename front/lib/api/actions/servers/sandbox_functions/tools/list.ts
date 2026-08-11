import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPod } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { Err, Ok } from "@app/types/shared/result";

export function formatSandboxFunctionsList(
  sandboxFunctions: SandboxFunctionResource[]
): string {
  if (sandboxFunctions.length === 0) {
    return "No pod functions published in this pod.";
  }

  // Mode and timestamp let a caller confirm a publish landed (they mirror the publish tool's
  // echo) without fetching each function.
  const lines = sandboxFunctions.map(
    (fn) =>
      `- ${fn.slug} [${fn.executionMode}, updated ${fn.updatedAt.toISOString()}]: ${fn.description}`
  );

  return (
    `Pod functions:\n${lines.join("\n")}\n\n` +
    "Use the get tool with a function's slug to see its input and output schemas."
  );
}

export async function listHandler(
  _params: Record<string, never>,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, { toolContext: { runContext } });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const sandboxFunctions = await SandboxFunctionResource.listBySpace(
    auth,
    podResult.value.pod
  );

  return new Ok([
    { type: "text", text: formatSandboxFunctionsList(sandboxFunctions) },
  ]);
}
