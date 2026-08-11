import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { listFramePathsReferencingSandboxFunction } from "@app/lib/api/sandbox_functions/frame_references";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { deriveSandboxFunctionSlug } from "@app/lib/api/sandbox_functions/slug";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { areSchemasEqual } from "@app/lib/utils/json_schemas";
import type { SandboxFunctionExecutionMode } from "@app/types/api/sandbox_functions";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function publishHandler(
  {
    description,
    executionMode,
    path,
    slug,
  }: {
    description: string;
    executionMode: SandboxFunctionExecutionMode;
    path: string;
    slug: string;
  },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext: { runContext },
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }
  const { pod } = podResult.value;

  // Snapshot the previous input schema before publishing: a republish overwrites it in place,
  // and a schema change can break frames that call this function. The published slug is derived
  // from `path` the same way publishSandboxFunction derives it; if the derivation fails, publish
  // reports the invalid path below.
  const slugResult = deriveSandboxFunctionSlug({
    sourcePath: path,
    podId: pod.sId,
    name: slug,
  });
  const previous = slugResult.isOk()
    ? await SandboxFunctionResource.fetchBySpaceAndSlug(
        auth,
        pod,
        slugResult.value
      )
    : null;

  const result = await publishSandboxFunction(auth, {
    space: pod,
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

  const lines = [
    `Published pod function "${publishedSlug}". Frames call it by reference "${pod.sId}/${publishedSlug}".`,
  ];

  // A republish that changed the input schema may have broken frames calling this function:
  // warn about the ones whose sources reference it, never block.
  if (
    previous &&
    !areSchemasEqual(previous.inputSchema, result.value.inputSchema)
  ) {
    const referencingFramePaths =
      await listFramePathsReferencingSandboxFunction(auth, {
        space: pod,
        sandboxFunction: result.value,
      });
    if (referencingFramePaths.length > 0) {
      lines.push(
        `Warning: the input schema changed and ${referencingFramePaths.length} frame(s) ` +
          `reference this function: ${referencingFramePaths.join(", ")}. Verify their calls ` +
          "still match the new schema and re-publish them if needed (this is a text scan of " +
          "frame sources, so dynamically-built references are not detected)."
      );
    }
  }

  return new Ok([
    {
      type: "text",
      text: lines.join("\n\n"),
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
