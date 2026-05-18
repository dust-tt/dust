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

export async function deleteHandler(
  { path }: { path: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversation = agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
  }

  const mountRes = await resolveMountPoint(auth, conversation, {
    access: "write",
    scopedPath: path,
  });
  if (mountRes.isErr()) {
    return mountRes;
  }

  const { scope, prefix } = mountRes.value;

  const gcsPath = getGCSPathFromScopedPath({
    prefix,
    scopedPath: path,
    useCase: scope.useCase,
  });
  if (!gcsPath) {
    return new Err(
      new MCPError(
        `Invalid path: \`${path}\` does not match the resolved mount point.`,
        { tracked: false }
      )
    );
  }

  const bucket = getPrivateUploadBucket();
  const file = bucket.file(gcsPath);

  const [exists] = await file.exists();
  if (!exists) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  try {
    await file.delete();
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to delete file \`${path}\`: ${normalizeError(err).message}`
      )
    );
  }

  return new Ok([{ type: "text", text: `Deleted \`${path}\`.` }]);
}
