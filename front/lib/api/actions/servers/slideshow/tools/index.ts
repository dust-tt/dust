// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { buildInteractiveContentFileNotification } from "@app/lib/api/actions/servers/interactive_content/helpers";
import { SLIDESHOW_TOOLS_METADATA } from "@app/lib/api/actions/servers/slideshow/metadata";
import {
  createClientExecutableFile,
  editClientExecutableFile,
  getClientExecutableFileContent,
} from "@app/lib/api/files/client_executable";
import { formatValidationWarningsForLLM } from "@app/lib/api/files/content_validation";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

export function createSlideshowTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof SLIDESHOW_TOOLS_METADATA> = {
    create_slideshow_file: async (
      { file_name, mime_type, content, description },
      { sendNotification, _meta }
    ) => {
      const { conversation, agentConfiguration } =
        agentLoopContext?.runContext ?? {};

      if (!conversation) {
        return new Err(
          new MCPError(
            "Conversation ID is required to create a slideshow file."
          )
        );
      }

      const result = await createClientExecutableFile(auth, {
        content,
        conversationId: conversation.sId,
        fileName: file_name,
        mimeType: mime_type,
        createdByAgentConfigurationId: agentConfiguration?.sId,
      });

      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message, {
            tracked: result.error.tracked,
          })
        );
      }

      const { fileResource, warnings } = result.value;

      let responseText = description
        ? `Slideshow '${fileResource.sId}' created successfully. ${description}`
        : `Slideshow '${fileResource.sId}' created successfully.`;

      responseText += formatValidationWarningsForLLM(warnings);

      if (_meta?.progressToken) {
        const notification: MCPProgressNotificationType =
          buildInteractiveContentFileNotification(
            _meta.progressToken,
            fileResource,
            "Creating slideshow..."
          );

        // Send a notification to the MCP Client, to display the slideshow.
        await sendNotification(notification);
      }

      return new Ok([
        {
          type: "resource",
          resource: {
            contentType: fileResource.contentType,
            fileId: fileResource.sId,
            mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
            snippet: fileResource.snippet,
            text: responseText,
            title: fileResource.fileName,
            uri: fileResource.getPublicUrl(auth),
          },
        },
      ]);
    },

    edit_slideshow_file: async (
      { file_id, old_string, new_string, expected_replacements },
      { sendNotification, _meta }
    ) => {
      const { agentConfiguration } = agentLoopContext?.runContext ?? {};

      const result = await editClientExecutableFile(auth, {
        fileId: file_id,
        oldString: old_string,
        newString: new_string,
        expectedReplacements: expected_replacements,
        editedByAgentConfigurationId: agentConfiguration?.sId,
      });

      if (result.isErr()) {
        return new Err(new MCPError(result.error.message, { tracked: false }));
      }

      const { fileResource, replacementCount, warnings } = result.value;

      const pluralS = replacementCount === 1 ? "" : "s";
      let responseText =
        `Slideshow '${fileResource.sId}' updated successfully. Made ` +
        `${replacementCount} replacement${pluralS}`;

      responseText += formatValidationWarningsForLLM(warnings);

      if (_meta?.progressToken) {
        const notification: MCPProgressNotificationType =
          buildInteractiveContentFileNotification(
            _meta.progressToken,
            fileResource,
            "Updating slideshow..."
          );

        // Send a notification to the MCP Client, to refresh the slideshow.
        await sendNotification(notification);
      }

      return new Ok([
        {
          type: "text",
          text: responseText,
        },
      ]);
    },

    retrieve_slideshow_file: async ({ file_id }) => {
      const result = await getClientExecutableFileContent(auth, file_id);
      if (result.isErr()) {
        return new Err(
          new MCPError(result.error.message, {
            tracked: result.error.tracked,
          })
        );
      }

      const { fileResource, content } = result.value;

      return new Ok([
        {
          type: "text",
          text:
            `Slideshow '${fileResource.sId}' (${fileResource.fileName}) retrieved ` +
            `successfully. Content:\n\n${content}`,
        },
      ]);
    },
  };

  return buildTools(SLIDESHOW_TOOLS_METADATA, handlers);
}
