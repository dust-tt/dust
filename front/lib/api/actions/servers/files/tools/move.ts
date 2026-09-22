import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import { moveCanonicalFile } from "@app/lib/api/files/file_system_ops";
import { getFilePreviewDirectiveInstruction } from "@app/lib/markdown/file_preview";
import {
  isAllSupportedFileContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export async function moveHandler(
  { source, dest }: { source: string; dest: string },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ runContext });
  if (conversationRes.isErr()) {
    return conversationRes;
  }

  if (source === dest) {
    return new Err(
      new MCPError("`source` and `dest` resolve to the same path.", {
        tracked: false,
      })
    );
  }

  const fsResult = await getDustFileSystemForAgentLoop(
    auth,
    conversationRes.value,
    scopedPathsFromArgs(source, dest)
  );
  if (fsResult.isErr()) {
    return fsResult;
  }
  const dustFs = fsResult.value;

  const statResult = await dustFs.stat(source);
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

  // GCS holds no directory objects, so a folder always stats as null. Fall back to a listing to
  // tell a missing path from a directory: a Frames v2 package is a directory, and moving one is
  // how it gets renamed.
  let mimeType: string | null = null;
  if (statResult.value) {
    mimeType = stripMimeParameters(statResult.value.contentType);
  } else {
    const listResult = await dustFs.list(source, { maxFiles: 1 });
    if (listResult.isErr() || listResult.value.length === 0) {
      return new Err(
        new MCPError(`Source not found: \`${source}\`.`, { tracked: false })
      );
    }
  }

  const moveResult = await moveCanonicalFile(auth, dustFs, source, dest);
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

  const items: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: ToolGeneratedFilePathType }
  > = [
    {
      type: "text",
      text: mimeType
        ? `Moved \`${source}\` to \`${dest}\`. ` +
          getFilePreviewDirectiveInstruction({
            contentType: mimeType,
            path: dest,
            title: dest.split("/").pop() ?? dest,
          })
        : `Moved \`${source}\` to \`${dest}\`.`,
    },
  ];

  if (mimeType && isAllSupportedFileContentType(mimeType)) {
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
