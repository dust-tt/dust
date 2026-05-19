import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { resolveMountPoint } from "@app/lib/api/actions/servers/files/tools/utils";
import {
  getGCSPathFromScopedPath,
  moveFile,
} from "@app/lib/api/files/gcs_mount/files";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  isAllSupportedFileContentType,
  stripMimeParameters,
} from "@app/types/files";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export async function moveHandler(
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
    access: "write",
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
  if (!sourceGcsPath) {
    return new Err(
      new MCPError(
        "Invalid path: `source` does not match the resolved mount point.",
        { tracked: false }
      )
    );
  }

  if (source === dest) {
    return new Err(
      new MCPError("`source` and `dest` resolve to the same path.", {
        tracked: false,
      })
    );
  }

  const bucket = getPrivateUploadBucket();
  let mimeType: string;
  try {
    const [metadata] = await bucket.file(sourceGcsPath).getMetadata();
    mimeType = stripMimeParameters(
      isString(metadata.contentType)
        ? metadata.contentType
        : "application/octet-stream"
    );
  } catch {
    return new Err(
      new MCPError(`Source file not found: \`${source}\`.`, { tracked: false })
    );
  }

  const [linkedFileResource] = await FileResource.fetchByMountFilePaths(auth, [
    sourceGcsPath,
  ]);

  const destFileName = dest.split("/").pop() ?? dest;
  const destScope = destMountRes.value.scope;
  let destUseCase: FileUseCase;
  let destUseCaseMetadata: FileUseCaseMetadata | undefined;
  switch (destScope.useCase) {
    case "project":
      destUseCase = "project_context";
      destUseCaseMetadata = { spaceId: destScope.projectId };
      break;
    case "conversation":
      destUseCase = "tool_output";
      destUseCaseMetadata = { conversationId: conversation.sId };
      break;
    default:
      assertNever(destScope);
  }

  const destRelativeFilePath = dest.slice(`${destScope.useCase}/`.length);
  const moveRes = await moveFile(auth, {
    file: linkedFileResource,
    sourceGcsPath,
    destScope,
    destRelativeFilePath,
    destFileName,
    destUseCase,
    destUseCaseMetadata,
  });
  if (moveRes.isErr()) {
    return new Err(
      new MCPError(
        `Failed to move \`${source}\` to \`${dest}\`: ${moveRes.error.message}`
      )
    );
  }

  const items: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: ToolGeneratedFilePathType }
  > = [
    {
      type: "text",
      text: `Moved \`${source}\` to \`${dest}\`.`,
    },
  ];

  if (isAllSupportedFileContentType(mimeType)) {
    items.push({
      type: "resource",
      resource: {
        text: `Moved \`${source}\` to \`${dest}\``,
        uri: dest,
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
        path: dest,
        title: destFileName,
        contentType: mimeType,
      },
    });
  }

  return new Ok(items);
}
