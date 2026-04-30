import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { CREATE_CONTENT_MAX_BYTES } from "@app/lib/api/actions/servers/files/metadata";
import { resolveMountPoint } from "@app/lib/api/actions/servers/files/tools/utils";
import {
  createGCSMountFile,
  getGCSPathFromScopedPath,
} from "@app/lib/api/files/gcs_mount/files";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function createHandler(
  {
    path,
    content,
    content_type,
  }: { path: string; content: string; content_type: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const mountRes = resolveMountPoint(
    auth,
    agentLoopContext?.runContext?.conversation
  );
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
        `Invalid path: \`${path}\` does not belong to the conversation file system.`,
        { tracked: false }
      )
    );
  }

  const contentBuffer = Buffer.from(content, "utf8");
  if (contentBuffer.byteLength > CREATE_CONTENT_MAX_BYTES) {
    return new Err(
      new MCPError(
        `Content exceeds the ${CREATE_CONTENT_MAX_BYTES / 1024} KB limit.`,
        { tracked: false }
      )
    );
  }

  const bucket = getPrivateUploadBucket();
  const [exists] = await bucket.file(gcsPath).exists();
  const relativeFilePath = gcsPath.slice(prefix.length);

  const entryRes = await createGCSMountFile(auth, scope, {
    relativeFilePath,
    content: contentBuffer,
    contentType: content_type,
  });
  if (entryRes.isErr()) {
    return new Err(
      new MCPError(
        `Failed to write file \`${path}\`: ${entryRes.error.message}`
      )
    );
  }

  const sizeKb = Math.ceil(entryRes.value.sizeBytes / 1024);
  const verb = exists ? "Updated" : "Created";
  return new Ok([
    {
      type: "text",
      text: `${verb} \`${entryRes.value.path}\` (${entryRes.value.contentType}, ${sizeKb} KB)`,
    },
  ]);
}
