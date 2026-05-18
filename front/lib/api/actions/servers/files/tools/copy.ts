import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { resolveMountPoint } from "@app/lib/api/actions/servers/files/tools/utils";
import { getGCSPathFromScopedPath } from "@app/lib/api/files/gcs_mount/files";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function copyHandler(
  { source, dest }: { source: string; dest: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversation = agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
  }

  const sourceMountRes = await resolveMountPoint(auth, conversation, {
    access: "read",
    scopedPath: source,
  });
  if (sourceMountRes.isErr()) {
    return sourceMountRes;
  }

  const destMountRes = await resolveMountPoint(auth, conversation, {
    access: "write",
    scopedPath: dest,
  });
  if (destMountRes.isErr()) {
    return destMountRes;
  }

  const sourceGcsPath = getGCSPathFromScopedPath({
    prefix: sourceMountRes.value.prefix,
    scopedPath: source,
    useCase: sourceMountRes.value.scope.useCase,
  });
  const destGcsPath = getGCSPathFromScopedPath({
    prefix: destMountRes.value.prefix,
    scopedPath: dest,
    useCase: destMountRes.value.scope.useCase,
  });
  if (!sourceGcsPath || !destGcsPath) {
    return new Err(
      new MCPError(
        "Invalid path: `source` or `dest` does not match the resolved mount point.",
        { tracked: false }
      )
    );
  }

  if (sourceGcsPath === destGcsPath) {
    return new Err(
      new MCPError("`source` and `dest` resolve to the same path.", {
        tracked: false,
      })
    );
  }

  const bucket = getPrivateUploadBucket();
  const sourceFile = bucket.file(sourceGcsPath);

  const [exists] = await sourceFile.exists();
  if (!exists) {
    return new Err(
      new MCPError(`Source file not found: \`${source}\`.`, { tracked: false })
    );
  }

  try {
    await sourceFile.copy(bucket.file(destGcsPath));
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to copy \`${source}\` to \`${dest}\`: ${normalizeError(err).message}`
      )
    );
  }

  return new Ok([
    {
      type: "text",
      text: `Copied \`${source}\` to \`${dest}\`.`,
    },
  ]);
}
