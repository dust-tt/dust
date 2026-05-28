import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { DustFileSystem } from "@app/lib/api/file_system";
import { moveCanonicalFile } from "@app/lib/api/files/file_system_ops";
import {
  isAllSupportedFileContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
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

  if (statResult.value === null) {
    return new Err(
      new MCPError(`Source file not found: \`${source}\`.`, { tracked: false })
    );
  }

  const mimeType = stripMimeParameters(statResult.value.contentType);

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
