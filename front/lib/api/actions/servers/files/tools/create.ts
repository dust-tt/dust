import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
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
import { isAllSupportedFileContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export async function createHandler(
  {
    path,
    content,
    content_type,
  }: { path: string; content: string; content_type: string },
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

  const entry = entryRes.value;
  const sizeKb = Math.ceil(entry.sizeBytes / 1024);
  const verb = exists ? "Updated" : "Created";

  const items: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: ToolGeneratedFilePathType }
  > = [
    {
      type: "text",
      text: `${verb} \`${entry.path}\` (${entry.contentType}, ${sizeKb} KB)`,
    },
  ];

  if (isAllSupportedFileContentType(entry.contentType)) {
    items.push({
      type: "resource",
      resource: {
        text: `${verb} \`${entry.path}\``,
        uri: entry.path,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
        path: entry.path,
        title: entry.fileName,
        contentType: entry.contentType,
      },
    });
  }

  return new Ok(items);
}
