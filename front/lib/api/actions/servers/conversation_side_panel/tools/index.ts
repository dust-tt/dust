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
import { DustFileSystem } from "@app/lib/api/file_system";
import { fetchLinkedFileResource } from "@app/lib/api/files/file_system_ops";
import { FileResource } from "@app/lib/resources/file_resource";
import { getFileDisplayName, isFrameContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

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
    { file_id, path },
    { auth, sendNotification, _meta, runContext }
  ) => {
    if (!isAgentLoopRunContext(runContext)) {
      return new Err(
        new MCPError(
          "No conversation context available. This tool can only be used within a conversation."
        )
      );
    }

    if ((file_id && path) || (!file_id && !path)) {
      return new Err(
        new MCPError("Provide exactly one of `file_id` or `path`.", {
          tracked: false,
        })
      );
    }

    let fileResource: FileResource | undefined;
    if (file_id) {
      fileResource = (await FileResource.fetchById(auth, file_id)) ?? undefined;
    } else if (path) {
      const pathWithoutMountPrefix = path.startsWith("/files/")
        ? path.slice("/files/".length)
        : path;
      const scopedPath = DustFileSystem.normalizeScopedPath(
        pathWithoutMountPrefix
      );
      if (!scopedPath) {
        return new Err(
          new MCPError(`Invalid Frame path: ${path}`, { tracked: false })
        );
      }

      const fsResult = await DustFileSystem.forAgentLoop(auth, {
        conversation: runContext.conversation,
        scopedPaths: [scopedPath],
      });
      if (fsResult.isErr()) {
        return new Err(
          new MCPError(fsResult.error.message, { tracked: false })
        );
      }

      const sandboxPathResult = fsResult.value.toSandboxPath(scopedPath);
      if (sandboxPathResult.isErr()) {
        return new Err(
          new MCPError(sandboxPathResult.error.message, { tracked: false })
        );
      }

      fileResource = await fetchLinkedFileResource(
        auth,
        fsResult.value,
        scopedPath
      );
    }

    const fileReference = file_id ?? path;
    if (!fileResource) {
      return new Err(
        new MCPError(`File not found: ${fileReference}`, { tracked: false })
      );
    }

    if (!isFrameContentType(fileResource.contentType)) {
      return new Err(
        new MCPError(
          `File '${fileReference}' is not a Frame (content type: ${fileResource.contentType}).`,
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

    const title = getFileDisplayName(fileResource);
    return new Ok([
      {
        type: "resource",
        resource: {
          contentType: fileResource.contentType,
          fileId: fileResource.sId,
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          snippet: fileResource.snippet,
          text: `Opened Frame '${fileResource.sId}' (${title}) in the side panel.`,
          title,
          uri: fileResource.getPublicUrl(auth),
        },
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
