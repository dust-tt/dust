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
import { deleteCanonicalFile } from "@app/lib/api/files/file_system_ops";
import { Err, Ok } from "@app/types/shared/result";

export async function deleteHandler(
  { path }: { path: string },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ runContext });
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

  // Goes through deleteCanonicalFile, not the raw filesystem delete: a file backed by a
  // FileResource (any published Frame, among others) must lose its row and its share token
  // together with its bytes, or the share URL keeps serving content the user deleted.
  const deleteResult = await deleteCanonicalFile(auth, fsResult.value, path);
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
