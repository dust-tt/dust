import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { buildInteractiveContentFileNotification } from "@app/lib/api/actions/servers/interactive_content/helpers";
import { PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import { INTERACTIVE_CONTENT_V2_PUBLISH_TOOL_METADATA } from "@app/lib/api/actions/servers/interactive_content_v2/metadata";
import { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import { publishFrameV2FromSource } from "@app/lib/api/frames/publish_from_source";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

function toMCPError(
  error: FramePublicationError | SandboxFunctionError
): MCPError {
  if (error instanceof FramePublicationError) {
    return new MCPError(error.message, { tracked: false });
  }

  return new MCPError(error.message, {
    tracked: ["sandbox_unavailable", "reconcile_failed", "internal"].includes(
      error.code
    ),
  });
}

export async function createInteractiveContentV2Tools(
  auth: Authenticator,
  toolContext?: ToolContext
) {
  const legacyTools = await createInteractiveContentTools(auth, toolContext);
  const legacyPublishTool = legacyTools.find(
    (tool) => tool.name === PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME
  );
  assert(legacyPublishTool, "Legacy Frame publish tool expected");

  const handlers: ToolHandlers<
    typeof INTERACTIVE_CONTENT_V2_PUBLISH_TOOL_METADATA
  > = {
    publish_interactive_content_file: async (
      { file_id, path },
      { sendNotification, _meta, ...extra }
    ) => {
      const file = await FileResource.fetchById(auth, file_id);
      if (!file?.isFrameV2) {
        return legacyPublishTool.handler(
          { file_id, path },
          { sendNotification, _meta, ...extra }
        );
      }

      if (!isAgentLoopRunContext(toolContext?.runContext)) {
        return new Err(
          new MCPError(
            "Frames v2 publishing requires a conversation context.",
            { tracked: false }
          )
        );
      }

      const result = await publishFrameV2FromSource(auth, {
        conversation: toolContext.runContext.conversation,
        frame: file,
        manifestPath: path,
      });
      if (result.isErr()) {
        return new Err(toMCPError(result.error));
      }

      if (_meta?.progressToken) {
        const notification: MCPProgressNotificationType =
          buildInteractiveContentFileNotification(
            _meta.progressToken,
            file,
            "Publishing Frame..."
          );
        await sendNotification(notification);
      }

      return new Ok([
        {
          type: "text",
          text: `Frame '${file.sId}' published successfully.`,
        },
      ]);
    },
  };

  const [publishTool] = buildTools(
    INTERACTIVE_CONTENT_V2_PUBLISH_TOOL_METADATA,
    handlers
  );
  assert(publishTool, "Frames v2 publish tool expected");

  return legacyTools.map((tool) =>
    tool.name === PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME
      ? publishTool
      : tool
  );
}
