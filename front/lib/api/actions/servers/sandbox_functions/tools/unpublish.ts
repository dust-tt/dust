import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DustPodConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { unpublishSandboxFunction } from "@app/lib/api/sandbox_functions/unpublish_sandbox_function";
import { Err, Ok } from "@app/types/shared/result";

export async function unpublishHandler(
  { slug, dustPod }: { slug: string; dustPod?: DustPodConfigurationType },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext: { runContext },
    dustPod,
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await unpublishSandboxFunction(auth, {
    space: podResult.value.pod,
    slug,
  });
  if (result.isErr()) {
    return new Err(
      new MCPError(result.error.message, {
        tracked:
          result.error.code !== "not_found" &&
          result.error.code !== "publish_conflict",
      })
    );
  }

  return new Ok([
    {
      type: "text",
      text: `Unpublished pod function "${result.value.slug}" and deleted its invocation history.`,
    },
  ]);
}
