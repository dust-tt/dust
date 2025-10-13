import type { MCPProgressNotificationType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  CREATE_SLIDESHOW_FILE_TOOL_NAME,
  EDIT_SLIDESHOW_FILE_TOOL_NAME,
  RETRIEVE_SLIDESHOW_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/slideshow/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  createClientExecutableFile,
  editClientExecutableFile,
  getClientExecutableFileContent,
} from "@app/lib/api/files/client_executable";
import type { Authenticator } from "@app/lib/auth";
import type { InteractiveContentFileContentType } from "@app/types";
import {
  Err,
  frameContentType,
  INTERACTIVE_CONTENT_FILE_FORMATS,
  Ok,
} from "@app/types";

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

/**
 * Slideshow Server - Allows the model to create and update slideshow files.
 * Slideshow files are interactive presentations that users can view and navigate.
 * Files are rendered in a interactive content viewer where users can interact with them.
 * We return the file resource only on file creation, as edit updates the existing file.
 */
const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("slideshow");

  server.tool(
    CREATE_SLIDESHOW_FILE_TOOL_NAME,
    "Create a new slideshow file that users can view and navigate. Use this for " +
      "interactive presentations, tutorials, step-by-step analysis, comparisons, and reports.",
    {
      file_name: z
        .string()
        .describe(
          "The name of the slideshow file to create, including extension (e.g. " +
            "Presentation.tsx)"
        ),
      mime_type: z
        .enum(
          Object.keys(INTERACTIVE_CONTENT_FILE_FORMATS) as [
            InteractiveContentFileContentType,
          ]
        )
        .describe(
          "The MIME type for the slideshow file. Currently supports " +
            `'${frameContentType}' for client-side executable files.`
        ),
      content: z
        .string()
        .max(MAX_FILE_SIZE_BYTES)
        .describe(
          "The content for the slideshow file. Should be complete and ready for viewing. " +
            "Must use the Slideshow component from @dust/slideshow/v1."
        ),
      description: z
        .string()
        .optional()
        .describe(
          "Optional description of what this slideshow does (e.g., " +
            "'Q4 Revenue Analysis', 'Product Tutorial', " +
            "'Team Onboarding Presentation')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CREATE_SLIDESHOW_FILE_TOOL_NAME,
        agentLoopContext,
      },
      async (
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

        const { value: fileResource } = result;

        const responseText = description
          ? `Slideshow '${fileResource.sId}' created successfully. ${description}`
          : `Slideshow '${fileResource.sId}' created successfully.`;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType = {
            method: "notifications/progress",
            params: {
              progress: 1,
              total: 1,
              progressToken: _meta?.progressToken,
              data: {
                label: "Creating slideshow...",
                output: {
                  type: "interactive_content_file",
                  fileId: fileResource.sId,
                  mimeType: fileResource.contentType,
                  title: fileResource.fileName,
                  updatedAt: fileResource.updatedAtMs.toString(),
                },
              },
            },
          };

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
      }
    )
  );

  server.tool(
    EDIT_SLIDESHOW_FILE_TOOL_NAME,
    "Modifies content within a slideshow file by substituting specified text segments. " +
      "Performs single substitution by default, or multiple substitutions when " +
      "`expected_replacements` is defined. This function demands comprehensive contextual " +
      "information surrounding the target modification to ensure accurate targeting. " +
      `Use the ${RETRIEVE_SLIDESHOW_FILE_TOOL_NAME} tool to review the file's ` +
      "existing content prior to executing any text substitution. Requirements: " +
      "1. `old_string` MUST contain the precise literal content for substitution " +
      "(preserving all spacing, formatting, line breaks). " +
      "2. `new_string` MUST contain the exact replacement content maintaining proper syntax. " +
      "3. Include minimum 3 lines of surrounding context BEFORE and AFTER the target " +
      "content for unique identification. " +
      "**Critical:** Multiple matches or inexact matches will cause failure.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the slideshow file to update (e.g., 'fil_abc123')"
        ),
      old_string: z
        .string()
        .describe(
          "The exact text to find and replace. Must match the file content exactly, " +
            "including all spacing, formatting, and line breaks. Include surrounding context " +
            "to ensure unique identification of the target text."
        ),
      new_string: z
        .string()
        .describe(
          "The exact text to replace old_string with. Should maintain proper syntax " +
            "and follow best practices for the file type."
        ),
      expected_replacements: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Optional number of expected replacements. Defaults to 1. Use when you want " +
            "to replace multiple identical instances of the same text."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: EDIT_SLIDESHOW_FILE_TOOL_NAME,
        agentLoopContext,
      },
      async (
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
          return new Err(
            new MCPError(result.error.message, { tracked: false })
          );
        }

        const { fileResource, replacementCount } = result.value;

        const pluralS = replacementCount === 1 ? "" : "s";
        const responseText =
          `Slideshow '${fileResource.sId}' updated successfully. Made ` +
          `${replacementCount} replacement${pluralS}`;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType = {
            method: "notifications/progress",
            params: {
              progress: 1,
              total: 1,
              progressToken: _meta?.progressToken,
              data: {
                label: "Updating slideshow...",
                output: {
                  type: "interactive_content_file",
                  fileId: fileResource.sId,
                  mimeType: fileResource.contentType,
                  title: fileResource.fileName,
                  updatedAt: fileResource.updatedAtMs.toString(),
                },
              },
            },
          };

          // Send a notification to the MCP Client, to refresh the slideshow.
          await sendNotification(notification);
        }

        return new Ok([
          {
            type: "text",
            text: responseText,
          },
        ]);
      }
    )
  );

  server.tool(
    RETRIEVE_SLIDESHOW_FILE_TOOL_NAME,
    "Retrieve the current content of an existing slideshow file by its file ID. " +
      "Use this to read back the content of slideshow files you have previously created or " +
      `updated. Use this tool before calling ${EDIT_SLIDESHOW_FILE_TOOL_NAME} to ` +
      "understand the current file state and identify the exact text to replace.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the slideshow file to retrieve (e.g., 'fil_abc123')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: RETRIEVE_SLIDESHOW_FILE_TOOL_NAME,
        agentLoopContext,
      },
      async ({ file_id }) => {
        const result = await getClientExecutableFileContent(auth, file_id);

        if (result.isErr()) {
          return new Err(new MCPError(result.error.message));
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
      }
    )
  );

  return server;
};

export default createServer;
