import type { DustPodConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
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

  const lines = sandboxFunctions.map((fn) => `- ${fn.slug}: ${fn.description}`);

  return (
    `Pod functions:\n${lines.join("\n")}\n\n` +
    "Use the get tool with a function's slug to see its input and output schemas."
  );
}

export async function listHandler(
  { dustPod }: { dustPod?: DustPodConfigurationType },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getPod(auth, {
    toolContext: { runContext },
    dustPod,
  });
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
