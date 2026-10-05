import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { DOCUMENTS_TOOLS_METADATA } from "@app/lib/api/actions/servers/documents/metadata";
import { getDustFileSystemForAgentLoop } from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import { addAgentComment } from "@app/lib/api/files/dfm_agent_comments";
import { Err, Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof DOCUMENTS_TOOLS_METADATA> = {
  add_comment: async (
    { path, quote, occurrence, comment },
    { auth, runContext }
  ) => {
    if (!isAgentLoopRunContext(runContext)) {
      return new Err(
        new MCPError("No conversation context available.", { tracked: false })
      );
    }

    const dustFs = await getDustFileSystemForAgentLoop(
      auth,
      runContext.conversation,
      [path]
    );
    if (dustFs.isErr()) {
      return dustFs;
    }

    const added = await addAgentComment(auth, dustFs.value, {
      agent: runContext.agentConfiguration,
      scopedPath: path,
      quote,
      occurrence: occurrence ?? 1,
      comment,
    });
    if (added.isErr()) {
      return new Err(
        new MCPError(added.error.message, {
          tracked: added.error.code === "storage_failed",
        })
      );
    }

    return new Ok([
      {
        type: "text",
        text: `Added comment \`${added.value.commentId}\` on "${quote}" in \`${path}\`.`,
      },
    ]);
  },
};

export const TOOLS = buildTools(DOCUMENTS_TOOLS_METADATA, handlers);
