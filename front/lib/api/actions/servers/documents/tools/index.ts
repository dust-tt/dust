import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  DOCUMENTS_TOOLS_METADATA,
  READ_DOCUMENT_MAX_BYTES,
} from "@app/lib/api/actions/servers/documents/metadata";
import { getDustFileSystemForAgentLoop } from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import {
  addAgentComment,
  replyToAgentComment,
} from "@app/lib/api/files/dfm_agent_comments";
import {
  editAgentDocument,
  readAgentDocument,
} from "@app/lib/api/files/dfm_agent_documents";
import type { LiveAgent } from "@app/types/collab";
import { Err, Ok } from "@app/types/shared/result";
import { pluralize } from "@app/types/shared/utils/string_utils";

/** The agent as the editors of a live document show it reading or editing. */
const liveAgentOf = ({
  agentConfiguration,
}: AgentLoopRunContext): LiveAgent => ({
  agentId: agentConfiguration.sId,
  name: agentConfiguration.name,
});

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
  reply_to_comment: async (
    { path, comment_id, reply },
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

    const replied = await replyToAgentComment(auth, dustFs.value, {
      agent: runContext.agentConfiguration,
      scopedPath: path,
      commentId: comment_id,
      reply,
    });
    if (replied.isErr()) {
      return new Err(
        new MCPError(replied.error.message, {
          tracked: replied.error.code === "storage_failed",
        })
      );
    }

    return new Ok([
      {
        type: "text",
        text: `Replied in comment \`${comment_id}\` in \`${path}\`.`,
      },
    ]);
  },
  read_document: async ({ path }, { auth, runContext }) => {
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

    const read = await readAgentDocument(
      auth,
      dustFs.value,
      path,
      liveAgentOf(runContext)
    );
    if (read.isErr()) {
      return new Err(
        new MCPError(read.error.message, {
          tracked: read.error.code === "storage_failed",
        })
      );
    }
    if (
      Buffer.byteLength(read.value.source, "utf8") > READ_DOCUMENT_MAX_BYTES
    ) {
      return new Err(
        new MCPError(
          `\`${path}\` exceeds the ${READ_DOCUMENT_MAX_BYTES / 1024} KB limit of this tool.`,
          { tracked: false }
        )
      );
    }

    return new Ok([{ type: "text", text: read.value.source }]);
  },
  edit_document: async (
    { path, old_string, new_string, expected_replacements },
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

    const edited = await editAgentDocument(auth, dustFs.value, {
      scopedPath: path,
      oldString: old_string,
      newString: new_string,
      expectedReplacements: expected_replacements ?? 1,
      agent: liveAgentOf(runContext),
    });
    if (edited.isErr()) {
      return new Err(
        new MCPError(edited.error.message, {
          tracked: edited.error.code === "storage_failed",
        })
      );
    }

    const { replacements } = edited.value;
    return new Ok([
      {
        type: "text",
        text: `Updated \`${path}\`: made ${replacements} replacement${pluralize(replacements)}.`,
      },
    ]);
  },
};

export const TOOLS = buildTools(DOCUMENTS_TOOLS_METADATA, handlers);
