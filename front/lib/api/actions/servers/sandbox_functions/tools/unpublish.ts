import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import { listFramePathsReferencingSandboxFunction } from "@app/lib/api/sandbox_functions/frame_references";
import { unpublishSandboxFunction } from "@app/lib/api/sandbox_functions/unpublish_sandbox_function";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { Err, Ok } from "@app/types/shared/result";

export async function unpublishHandler(
  { slug }: { slug: string },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext: { runContext },
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }
  const { pod } = podResult.value;

  // Scan for referencing frames before the delete: the scan needles include the function's sId,
  // which is gone once the unpublish succeeds. Warning-only, so a missing function simply skips
  // the scan and lets unpublishSandboxFunction report not_found.
  const sandboxFunction = await SandboxFunctionResource.fetchBySpaceAndSlug(
    auth,
    pod,
    slug
  );
  const referencingFramePaths = sandboxFunction
    ? await listFramePathsReferencingSandboxFunction(auth, {
        space: pod,
        sandboxFunction,
      })
    : [];

  const result = await unpublishSandboxFunction(auth, {
    space: pod,
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

  const lines = [
    `Unpublished pod function "${result.value.slug}" and deleted its invocation history.`,
  ];
  if (referencingFramePaths.length > 0) {
    lines.push(
      `Warning: ${referencingFramePaths.length} frame(s) reference this function: ` +
        `${referencingFramePaths.join(", ")}. Their calls to it will now fail; edit and ` +
        "re-publish them (this is a text scan of frame sources, so dynamically-built " +
        "references are not detected)."
    );
  }

  return new Ok([
    {
      type: "text",
      text: lines.join("\n\n"),
    },
  ]);
}
