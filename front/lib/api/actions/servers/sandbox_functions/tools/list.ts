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
    return "No sandbox functions published in this pod.";
  }

  const lines = sandboxFunctions.map((fn) =>
    [
      `- ${fn.file.fileName} (${fn.sId})`,
      `  input: ${JSON.stringify(fn.inputSchema)}`,
      `  output: ${JSON.stringify(fn.outputSchema)}`,
    ].join("\n")
  );

  return `Sandbox functions:\n${lines.join("\n")}`;
}

export async function listHandler(
  _params: Record<string, never>,
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, { agentLoopContext });
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
