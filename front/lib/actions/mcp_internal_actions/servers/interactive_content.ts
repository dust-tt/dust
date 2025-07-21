import type { MCPProgressNotificationType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  createClientExecutableFile,
  editClientExecutableFile,
  getClientExecutableFileContent,
} from "@app/lib/api/files/client_executable";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { InteractiveFileContentType } from "@app/types";
import { INTERACTIVE_FILE_FORMATS } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "interactive_content",
  version: "1.0.0",
  description:
    "Create and update interactive content files that users can execute and interact with. Currently supports client-executable code.",
  authorization: null,
  icon: "ActionDocumentTextIcon",
  documentationUrl: null,
};

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

export const CREATE_INTERACTIVE_FILE_TOOL_NAME = "create_interactive_file";
export const EDIT_INTERACTIVE_FILE_TOOL_NAME = "edit_interactive_file";
export const RETRIEVE_INTERACTIVE_FILE_TOOL_NAME = "retrieve_interactive_file";

/**
 * Interactive Content Server - Allows the model to create and update interactive content files.
 * Interactive content includes any file that users can execute, run, or interact with directly.
 * Currently supports client-executable files, with plans to expand to other interactive formats.
 * Files are rendered in an interactive content viewer where users can execute and interact with them.
 * We return the file resource only on file creation, as edit updates the existing file.
 */
const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    CREATE_INTERACTIVE_FILE_TOOL_NAME,
    "Create a new interactive content file that users can execute or interact with. Use this for " +
      "content that provides functionality beyond static viewing.",
    {
      file_name: z
        .string()
        .describe(
          "The name of the interactive content file to create, including extension (e.g. " +
            "DataVisualization.tsx)"
        ),
      mime_type: z
        .enum(
          Object.keys(INTERACTIVE_FILE_FORMATS) as [InteractiveFileContentType]
        )
        .describe(
          "The MIME type for the interactive content. Currently supports " +
            "'application/vnd.dust.client-executable' for client-side executable files."
        ),
      content: z
        .string()
        .max(MAX_FILE_SIZE_BYTES)
        .describe(
          "The content for the interactive file. Should be complete and ready for execution or " +
            "interaction."
        ),
      description: z
        .string()
        .optional()
        .describe(
          "Optional description of what this interactive content does (e.g., " +
            "'Interactive data visualization', 'Executable analysis script', " +
            "'Dynamic dashboard')"
        ),
    },
    withToolLogging(
      auth,
      CREATE_INTERACTIVE_FILE_TOOL_NAME,
      async (
        { file_name, mime_type, content, description },
        { sendNotification, _meta }
      ) => {
        const { conversation } = agentLoopContext?.runContext ?? {};
        if (!conversation) {
          return makeMCPToolTextError(
            "Conversation ID is required to create a client executable file."
          );
        }

        const result = await createClientExecutableFile(auth, {
          content,
          conversationId: conversation.sId,
          fileName: file_name,
          mimeType: mime_type,
        });

        if (result.isErr()) {
          return makeMCPToolTextError(result.error.message);
        }

        const { value: fileResource } = result;

        const responseText = description
          ? `File '${fileResource.sId}' created successfully. ${description}`
          : `File '${fileResource.sId}' created successfully.`;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType = {
            method: "notifications/progress",
            params: {
              progress: 1,
              total: 1,
              progressToken: _meta?.progressToken,
              data: {
                label: "Creating interactive content...",
                output: {
                  type: "interactive_file",
                  fileId: fileResource.sId,
                  mimeType: fileResource.contentType,
                  title: fileResource.fileName,
                  updatedAt: fileResource.updatedAtMs.toString(),
                },
              },
            },
          };

          // Send a notification to the MCP Client, to display the interactive file.
          await sendNotification(notification);
        }

        return {
          isError: false,
          content: [
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
          ],
        };
      }
    )
  );

  server.tool(
    EDIT_INTERACTIVE_FILE_TOOL_NAME,
    "Modifies content within an interactive file by substituting specified text segments. " +
      "Performs single substitution by default, or multiple substitutions when " +
      "`expected_replacements` is defined. This function demands comprehensive contextual " +
      "information surrounding the target modification to ensure accurate targeting. " +
      `Always utilize the ${RETRIEVE_INTERACTIVE_FILE_TOOL_NAME} tool to review the file's ` +
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
          "The ID of the interactive content file to update (e.g., 'fil_abc123')"
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
      EDIT_INTERACTIVE_FILE_TOOL_NAME,
      async (
        { file_id, old_string, new_string, expected_replacements },
        { sendNotification, _meta }
      ) => {
        const result = await editClientExecutableFile(auth, {
          fileId: file_id,
          oldString: old_string,
          newString: new_string,
          expectedReplacements: expected_replacements,
        });

        if (result.isErr()) {
          return makeMCPToolTextError(result.error.message);
        }

        const { fileResource, replacementCount } = result.value;

        const pluralS = replacementCount === 1 ? "" : "s";
        const responseText =
          `File '${fileResource.sId}' updated successfully. Made ` +
          `${replacementCount} replacement${pluralS}`;

        console.log(">>> _meta", _meta);

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType = {
            method: "notifications/progress",
            params: {
              progress: 1,
              total: 1,
              progressToken: _meta?.progressToken,
              data: {
                label: "Updating interactive content...",
                output: {
                  type: "interactive_file",
                  fileId: fileResource.sId,
                  mimeType: fileResource.contentType,
                  title: fileResource.fileName,
                  updatedAt: fileResource.updatedAtMs.toString(),
                },
              },
            },
          };

          // Send a notification to the MCP Client, to refresh the interactive file.
          await sendNotification(notification);
        }

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      }
    )
  );

  server.tool(
    RETRIEVE_INTERACTIVE_FILE_TOOL_NAME,
    "Retrieve the current content of an existing interactive file by its file ID. " +
      "Use this to read back the content of interactive files you have previously created or " +
      `updated. Always use this tool before calling interactive_content${EDIT_INTERACTIVE_FILE_TOOL_NAME} to ` +
      "understand the current file state and identify the exact text to replace.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the interactive content file to retrieve (e.g., 'fil_abc123')"
        ),
    },
    withToolLogging(
      auth,
      RETRIEVE_INTERACTIVE_FILE_TOOL_NAME,
      async ({ file_id }) => {
        const result = await getClientExecutableFileContent(auth, file_id);

        if (result.isErr()) {
          return makeMCPToolTextError(result.error.message);
        }

        const { fileResource, content } = result.value;

        return {
          isError: false,
          content: [
            {
              type: "text",
              text:
                `File '${fileResource.sId}' (${fileResource.fileName}) retrieved ` +
                `successfully. Content:\n\n${content}`,
            },
          ],
        };
      }
    )
  );

  return server;
};

export default createServer;
