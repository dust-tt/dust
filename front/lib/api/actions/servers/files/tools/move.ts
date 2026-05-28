import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DustFileSystem,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
import { FileResource } from "@app/lib/resources/file_resource";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import {
  isAllSupportedFileContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

/**
 * Translate a canonical scoped path to the raw GCS path that FileResource.mountFilePath stores.
 *
 * conversation-{cId}/{rel} -> w/{wId}/conversations/{cId}/files/{rel}
 * pod-{pId}/{rel}          -> w/{wId}/pods/{pId}/files/{rel}
 *
 * Returns null for unrecognised prefixes or root-only paths with no rel component.
 */
// TEMPORARY: To remove once FileResource is not structurally used in the move.
function canonicalToGCSPath(
  workspace: LightWorkspaceType,
  scopedPath: string
): string | null {
  if (scopedPath.startsWith(SCOPED_PREFIX_CONVERSATION)) {
    const rest = scopedPath.slice(SCOPED_PREFIX_CONVERSATION.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      return null;
    }

    return `w/${workspace.sId}/conversations/${rest.slice(0, slash)}/files/${rest.slice(slash + 1)}`;
  }

  if (scopedPath.startsWith(SCOPED_PREFIX_POD)) {
    const rest = scopedPath.slice(SCOPED_PREFIX_POD.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      return null;
    }

    return `w/${workspace.sId}/pods/${rest.slice(0, slash)}/files/${rest.slice(slash + 1)}`;
  }

  return null;
}

/**
 * Derive the FileUseCase and FileUseCaseMetadata from the canonical dest path.
 */
function destMountInfo(
  scopedPath: string,
  conversationId: string
): { useCase: FileUseCase; useCaseMetadata: FileUseCaseMetadata } | null {
  if (scopedPath.startsWith(SCOPED_PREFIX_CONVERSATION)) {
    return {
      useCase: "tool_output",
      useCaseMetadata: { conversationId },
    };
  }

  if (scopedPath.startsWith(SCOPED_PREFIX_POD)) {
    const rest = scopedPath.slice(SCOPED_PREFIX_POD.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      return null;
    }
    const spaceId = rest.slice(0, slash);
    return {
      useCase: "project_context",
      useCaseMetadata: { spaceId },
    };
  }

  return null;
}

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

  if (source === dest) {
    return new Err(
      new MCPError("`source` and `dest` resolve to the same path.", {
        tracked: false,
      })
    );
  }

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(new MCPError(fsResult.error.message, { tracked: false }));
  }
  const fs = fsResult.value;

  const statResult = await fs.stat(source);
  if (statResult.isErr()) {
    const err = statResult.error;
    switch (err.code) {
      case "legacy_path":
        return new Err(new MCPError(err.message, { tracked: false }));

      case "invalid_path":
        return new Err(
          new MCPError(`Invalid path: \`${source}\`.`, { tracked: false })
        );

      default:
        return new Err(
          new MCPError(`Failed to read source \`${source}\`: ${err.message}`, {
            tracked: false,
          })
        );
    }
  }

  if (statResult.value === null) {
    return new Err(
      new MCPError(`Source file not found: \`${source}\`.`, { tracked: false })
    );
  }

  const mimeType = stripMimeParameters(statResult.value.contentType);
  const workspace = auth.getNonNullableWorkspace();

  // Look up any linked FileResource before moving the bytes (best-effort: no error if none found).
  // mountFilePath stores raw GCS paths; try both pods/ and projects/ variants for pod mounts.
  const sourceGcsPath = canonicalToGCSPath(workspace, source);
  const linkedFileResources = sourceGcsPath
    ? await FileResource.fetchByMountFilePaths(auth, [
        sourceGcsPath,
        // Also try the legacy projects/ mirror path so we find records written before the pods/ switch.
        sourceGcsPath.replace(/^(w\/[^/]+\/)pods\//, "$1projects/"),
      ])
    : [];
  const linkedFileResource = linkedFileResources[0];

  const moveResult = await fs.move({ src: source, dest });
  if (moveResult.isErr()) {
    const err = moveResult.error;
    switch (err.code) {
      case "legacy_path":
      case "unauthorized":
        return new Err(new MCPError(err.message, { tracked: false }));

      case "invalid_path":
        return new Err(
          new MCPError(`Invalid path: \`${dest}\`.`, { tracked: false })
        );

      default:
        return new Err(
          new MCPError(
            `Failed to move \`${source}\` to \`${dest}\`: ${err.message}`
          )
        );
    }
  }

  // Update the linked FileResource's mount metadata to reflect the new location.
  if (linkedFileResource) {
    const destFileName = dest.split("/").pop() ?? dest;
    const destGcsPath = canonicalToGCSPath(workspace, dest);
    const destInfo = destMountInfo(dest, conversation.sId);

    if (destGcsPath && destInfo) {
      await linkedFileResource.updateMount({
        destFileName,
        destMountFilePath: destGcsPath,
        destUseCase: destInfo.useCase,
        destUseCaseMetadata: destInfo.useCaseMetadata,
      });
    }
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
    const destFileName = dest.split("/").pop() ?? dest;
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
