import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  CONVERSATION_SIDE_PANEL_TOOLS_METADATA,
  OPEN_FRAME_TOOL_NAME,
  SET_FILES_SIDE_PANEL_TOOL_NAME,
} from "@app/lib/api/actions/servers/conversation_side_panel/metadata";
import { buildInteractiveContentFileNotification } from "@app/lib/api/actions/servers/interactive_content/helpers";
import { FileResource } from "@app/lib/resources/file_resource";
import { isInteractiveContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";

function buildFilesSidePanelControlNotification(
  progressToken: string | number,
  action: "open" | "close",
  label: string
): MCPProgressNotificationType {
  return {
    method: "notifications/progress",
    params: {
      progress: 1,
      total: 1,
      progressToken,
      _meta: {
        data: {
          label,
          output: {
            type: "side_panel_control",
            panel: "files",
            action,
          },
        },
      },
    },
  };
}

const handlers: ToolHandlers<typeof CONVERSATION_SIDE_PANEL_TOOLS_METADATA> = {
  [OPEN_FRAME_TOOL_NAME]: async (
    { file_id },
    { auth, sendNotification, _meta, runContext }
  ) => {
    if (!isAgentLoopRunContext(runContext)) {
      return new Err(
        new MCPError(
          "No conversation context available. This tool can only be used within a conversation."
        )
      );
    }

    const fileResource = await FileResource.fetchById(auth, file_id);
    if (!fileResource) {
      return new Err(
        new MCPError(`File not found: ${file_id}`, { tracked: false })
      );
    }

    if (!isInteractiveContentType(fileResource.contentType)) {
      return new Err(
        new MCPError(
          `File '${file_id}' is not a Frame (content type: ${fileResource.contentType}).`,
          { tracked: false }
        )
      );
    }

    if (_meta?.progressToken) {
      await sendNotification(
        buildInteractiveContentFileNotification(
          _meta.progressToken,
          fileResource,
          "Opening Frame..."
        )
      );
    }

    return new Ok([
      {
        type: "text",
        text:
          `Opened Frame '${fileResource.sId}' (${fileResource.fileName}) ` +
          "in the side panel.",
      },
    ]);
  },

  [SET_FILES_SIDE_PANEL_TOOL_NAME]: async (
    { visible },
    { sendNotification, _meta, runContext }
  ) => {
    if (!isAgentLoopRunContext(runContext)) {
      return new Err(
        new MCPError(
          "No conversation context available. This tool can only be used within a conversation."
        )
      );
    }

    const action = visible ? "open" : "close";

    if (_meta?.progressToken) {
      await sendNotification(
        buildFilesSidePanelControlNotification(
          _meta.progressToken,
          action,
          visible ? "Opening files panel..." : "Closing files panel..."
        )
      );
    }

    return new Ok([
      {
        type: "text",
        text: visible
          ? "Opened the files side panel."
          : "Closed the files side panel.",
      },
    ]);
  },
};

export const TOOLS = buildTools(
  CONVERSATION_SIDE_PANEL_TOOLS_METADATA,
  handlers
);
