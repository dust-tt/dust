import { MCPError } from "@app/lib/actions/mcp_errors";
import type { DustPodConfigurationType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import type { SandboxFunctionExecutionMode } from "@app/types/api/sandbox_functions";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function publishHandler(
  {
    description,
    executionMode,
    path,
    slug,
    dustPod,
  }: {
    description: string;
    executionMode: SandboxFunctionExecutionMode;
    path: string;
    slug: string;
    dustPod?: DustPodConfigurationType;
  },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext: { runContext },
    dustPod,
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await publishSandboxFunction(auth, {
    space: podResult.value.pod,
    slug,
    description,
    path,
    executionMode,
  });
  if (result.isErr()) {
    return new Err(toMCPError(result.error));
  }

  // The slug carries the app prefix publish derived from `path`, so state it rather than letting the
  // model assume the name it passed. The other tools resolve the pod from the run context and take
  // the slug alone; only a Frame needs the qualified reference, so name that consumer.
  const { slug: publishedSlug } = result.value;

  return new Ok([
    {
      type: "text",
      text: `Published pod function "${publishedSlug}". Frames call it by reference "${podResult.value.pod.sId}/${publishedSlug}".`,
    },
  ]);
}

function toMCPError(error: SandboxFunctionError): MCPError {
  switch (error.code) {
    case "invalid_path":
    case "build_failed":
    case "schema_extraction_failed":
    case "invalid_contract":
    // Another publish holds the pod's lock; the model can simply retry.
    case "publish_conflict":
    // Publish never reconciles, but the shared error union carries the db-tool codes.
    case "reconcile_blocked":
      // The model controls the path and the function source, so surface the detail to let it fix.
      return new MCPError(error.message, { tracked: false });
    // Publish never returns not_found, but the shared sandbox-function error union also serves
    // unpublish.
    case "not_found":
      return new MCPError(error.message, { tracked: false });
    case "sandbox_unavailable":
    case "reconcile_failed":
    case "internal":
      return new MCPError(error.message);
    default:
      return assertNever(error.code);
  }
}
