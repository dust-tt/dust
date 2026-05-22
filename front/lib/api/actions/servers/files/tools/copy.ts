import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_MOVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { resolveMountPoint } from "@app/lib/api/actions/servers/files/tools/utils";
import {
  copyMountFile,
  getGCSPathFromScopedPath,
} from "@app/lib/api/files/gcs_mount/files";
import { parseScopedFilePath } from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";

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

  let mimeType: string;
  try {
    const [metadata] = await sourceFile.getMetadata();
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

  if (isInteractiveContentType(mimeType)) {
    return new Err(
      new MCPError(
        `Frame files cannot be copied. Use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_MOVE_ACTION_NAME)}\` to move \`${source}\` instead.`,
        { tracked: false }
      )
    );
  }

  const sourceParsed = parseScopedFilePath(source);
  const destParsed = parseScopedFilePath(dest);
  if (!sourceParsed || !destParsed) {
    return new Err(
      new MCPError(
        "Invalid path: `source` or `dest` does not match the resolved mount point.",
        { tracked: false }
      )
    );
  }

  const copyRes = await copyMountFile(auth, {
    source: {
      scope: sourceMountRes.value.scope,
      relativeFilePath: sourceParsed.rel,
    },
    dest: {
      scope: destMountRes.value.scope,
      relativeFilePath: destParsed.rel,
    },
  });
  if (copyRes.isErr()) {
    return new Err(
      new MCPError(
        `Failed to copy \`${source}\` to \`${dest}\`: ${copyRes.error.message}`
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
