import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getWritablePodContext } from "@app/lib/api/actions/servers/pod_manager/helpers";
import type { PodAppPublishError } from "@app/lib/api/projects/publish_app";
import { publishPodApp } from "@app/lib/api/projects/publish_app";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export async function publishAppHandler(
  { folder }: { folder: string },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const podResult = await getWritablePodContext(auth, {
    toolContext: { runContext },
  });
  if (podResult.isErr()) {
    return new Err(podResult.error);
  }

  const result = await publishPodApp(auth, podResult.value.pod, {
    folderName: folder,
  });
  if (result.isErr()) {
    return new Err(toMCPError(result.error));
  }

  const summary = result.value;
  const lines = [
    `Published app "${summary.name}" (prefix: ${summary.prefix}).`,
  ];
  if (summary.reconciledDatabaseNames.length > 0) {
    lines.push(
      `Databases reconciled: ${summary.reconciledDatabaseNames.join(", ")}.`
    );
  }
  if (summary.publishedFunctionSlugs.length > 0) {
    lines.push(
      `Functions published: ${summary.publishedFunctionSlugs.join(", ")}.`
    );
  }
  if (summary.publishedFrameNames.length > 0) {
    lines.push(`Frames published: ${summary.publishedFrameNames.join(", ")}.`);
  }
  if (summary.unpublishedFunctionSlugs.length > 0) {
    lines.push(
      "Functions unpublished (no longer in the manifest): " +
        `${summary.unpublishedFunctionSlugs.join(", ")}.`
    );
  }
  if (summary.warnings.length > 0) {
    lines.push(
      `Warnings:\n${summary.warnings.map((warning) => `- ${warning}`).join("\n")}`
    );
  }

  return new Ok([{ type: "text", text: lines.join("\n") }]);
}

function toMCPError(error: PodAppPublishError): MCPError {
  switch (error.code) {
    // The model controls the folder and the manifest, so surface the detail to let it fix.
    case "not_a_pod":
    case "invalid_name":
    case "folder_not_found":
    case "manifest_not_found":
    case "invalid_manifest":
    case "colliding_folders":
      return new MCPError(error.message, { tracked: false });
    case "sandbox_unavailable":
    case "internal":
      return new MCPError(error.message);
    default:
      return assertNever(error.code);
  }
}
