import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import { Err, Ok } from "@app/types/shared/result";

export async function deleteHandler(
  { path }: { path: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ agentLoopContext });
  if (conversationRes.isErr()) {
    return conversationRes;
  }

  const fsResult = await getDustFileSystemForAgentLoop(
    auth,
    conversationRes.value,
    scopedPathsFromArgs(path)
  );
  if (fsResult.isErr()) {
    return fsResult;
  }

  const deleteResult = await fsResult.value.delete(path);
  if (deleteResult.isErr()) {
    const err = deleteResult.error;
    switch (err.code) {
      case "legacy_path":
      case "unauthorized":
        return new Err(new MCPError(err.message, { tracked: false }));

      case "invalid_path":
        return new Err(
          new MCPError(`Invalid path: \`${path}\`.`, { tracked: false })
        );

      case "not_found":
        return new Err(
          new MCPError(`File not found: \`${path}\`.`, { tracked: false })
        );

      default:
        return new Err(
          new MCPError(`Failed to delete file \`${path}\`: ${err.message}`)
        );
    }
  }

  return new Ok([{ type: "text", text: `Deleted \`${path}\`.` }]);
}
