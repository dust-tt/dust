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
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import {
  isInteractiveContentType,
  stripMimeParameters,
} from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";

export async function copyHandler(
  { source, dest }: { source: string; dest: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ agentLoopContext });
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

  if (statResult.value === null) {
    return new Err(
      new MCPError(`Source file not found: \`${source}\`.`, { tracked: false })
    );
  }

  const mimeType = stripMimeParameters(statResult.value.contentType);
  if (isInteractiveContentType(mimeType)) {
    return new Err(
      new MCPError(
        `Frame files cannot be copied. Use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_MOVE_ACTION_NAME)}\` to move \`${source}\` instead.`,
        { tracked: false }
      )
    );
  }

  const copyResult = await dustFs.copy({ src: source, dest });
  if (copyResult.isErr()) {
    const err = copyResult.error;
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
            `Failed to copy \`${source}\` to \`${dest}\`: ${err.message}`
          )
        );
    }
  }

  return new Ok([
    {
      type: "text",
      text: `Copied \`${source}\` to \`${dest}\`.`,
    },
  ]);
}
