import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function publishHandler(
  {
    description,
    path,
    slug,
  }: {
    description: string;
    path: string;
    slug: string;
  },
  { auth, toolContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext,
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await publishSandboxFunction(auth, {
    space: podResult.value.pod,
    slug,
    description,
    path,
  });
  if (result.isErr()) {
    return new Err(toMCPError(result.error));
  }

  return new Ok([
    {
      type: "text",
      text: `Published sandbox function "${result.value.slug}".`,
    },
  ]);
}

function toMCPError(error: SandboxFunctionError): MCPError {
  switch (error.code) {
    case "invalid_path":
    case "build_failed":
    case "schema_extraction_failed":
    case "invalid_contract":
    // Reconcile refusals are model-correctable: the message carries what was refused and the
    // additive migrate path.
    case "reconcile_blocked":
    // Another publish holds the pod's lock; the model can simply retry.
    case "publish_conflict":
      // The model controls the path and the function source, so surface the detail to let it fix.
      return new MCPError(error.message, { tracked: false });
    case "sandbox_unavailable":
    case "reconcile_failed":
    case "internal":
      return new MCPError(error.message);
    default:
      return assertNever(error.code);
  }
}
