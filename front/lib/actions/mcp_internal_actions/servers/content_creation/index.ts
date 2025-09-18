import type { MCPProgressNotificationType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
  EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
  RETRIEVE_CONTENT_CREATION_FILE_TOOL_NAME,
  REVERT_CONTENT_CREATION_FILE_LAST_EDIT_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/content_creation/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  createClientExecutableFile,
  editClientExecutableFile,
  getClientExecutableFileContent,
  revertClientExecutableFileToPreviousState,
} from "@app/lib/api/files/client_executable";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { ContentCreationFileContentType } from "@app/types";
import {
  clientExecutableContentType,
  CONTENT_CREATION_FILE_FORMATS,
  Err,
  Ok,
} from "@app/types";

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

/**
 * Builds a progress notification for content creation file operations
 */
function buildContentCreationFileNotification(
  progressToken: string | number,
  fileResource: FileResource,
  label: string
): MCPProgressNotificationType {
  return {
    method: "notifications/progress",
    params: {
      progress: 1,
      total: 1,
      progressToken,
      data: {
        label,
        output: {
          type: "content_creation_file",
          fileId: fileResource.sId,
          mimeType: fileResource.contentType,
          title: fileResource.fileName,
          updatedAt: fileResource.updatedAtMs.toString(),
        },
      },
    },
  };
}

/**
 * Content Creation Server - Allows the model to create and update content creation files.
 * Content Creation includes any file that users can execute, run, or interact with directly.
 * Currently supports client-executable files, with plans to expand to other interactive formats.
 * Files are rendered in a content creation viewer where users can execute and interact with them.
 * We return the file resource only on file creation, as edit updates the existing file.
 */
const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("content_creation");

  server.tool(
    CREATE_CONTENT_CREATION_FILE_TOOL_NAME,
    "Create a new Content Creation file that users can execute or interact with. Use this for " +
      "content that provides functionality beyond static viewing.",
    {
      file_name: z
        .string()
        .describe(
          "The name of the Content Creation file to create, including extension (e.g. " +
            "DataVisualization.tsx)"
        ),
      mime_type: z
        .enum(
          Object.keys(CONTENT_CREATION_FILE_FORMATS) as [
            ContentCreationFileContentType,
          ]
        )
        .describe(
          "The MIME type for the Content Creation file. Currently supports " +
            `'${clientExecutableContentType}' for client-side executable files.`
        ),
      content: z
        .string()
        .max(MAX_FILE_SIZE_BYTES)
        .describe(
          "The content for the Content Creation file. Should be complete and ready for execution or " +
            "interaction."
        ),
      description: z
        .string()
        .optional()
        .describe(
          "Optional description of what this Content Creation file does (e.g., " +
            "'Interactive data visualization', 'Executable analysis script', " +
            "'Dynamic dashboard')"
        ),
    },
    withToolLogging(
      auth,
      { toolName: CREATE_CONTENT_CREATION_FILE_TOOL_NAME, agentLoopContext },
      async (
        { file_name, mime_type, content, description },
        { sendNotification, _meta }
      ) => {
        const { conversation, agentConfiguration } =
          agentLoopContext?.runContext ?? {};

        if (!conversation) {
          return new Err(
            new MCPError(
              "Conversation ID is required to create a client executable file."
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
          ? `File '${fileResource.sId}' created successfully. ${description}`
          : `File '${fileResource.sId}' created successfully.`;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType =
            buildContentCreationFileNotification(
              _meta.progressToken,
              fileResource,
              "Creating Content Creation file..."
            );

          // Send a notification to the MCP Client, to display the Content Creation file.
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
    EDIT_CONTENT_CREATION_FILE_TOOL_NAME,
    "Modifies content within a Content Creation file by substituting specified text segments. " +
      "Performs single substitution by default, or multiple substitutions when " +
      "`expected_replacements` is defined. This function demands comprehensive contextual " +
      "information surrounding the target modification to ensure accurate targeting. " +
      `Use the ${RETRIEVE_CONTENT_CREATION_FILE_TOOL_NAME} tool to review the file's ` +
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
          "The ID of the Content Creation file to update (e.g., 'fil_abc123')"
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
      { toolName: EDIT_CONTENT_CREATION_FILE_TOOL_NAME, agentLoopContext },
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
            new MCPError(result.error.message, {
              tracked: result.error.tracked,
            })
          );
        }

        const { fileResource, replacementCount } = result.value;

        const pluralS = replacementCount === 1 ? "" : "s";
        const responseText =
          `File '${fileResource.sId}' updated successfully. Made ` +
          `${replacementCount} replacement${pluralS}`;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType =
            buildContentCreationFileNotification(
              _meta.progressToken,
              fileResource,
              "Updating Content Creation file..."
            );

          // Send a notification to the MCP Client, to refresh the Content Creation file.
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
    REVERT_CONTENT_CREATION_FILE_LAST_EDIT_TOOL_NAME,
    "Reverts the content creation to the state it was at the last agent message. " +
      "This tool can be used to restore the content creation file to its state before the last agent message. " +
      "Use this when you need to undo changes made in the last agent message and return to the previous state.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the Content Creation file to revert (e.g., 'fil_abc123')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolName: REVERT_CONTENT_CREATION_FILE_LAST_EDIT_TOOL_NAME,
        agentLoopContext,
      },
      async ({ file_id }, { sendNotification, _meta }) => {
        if (!agentLoopContext?.runContext) {
          return new Err(
            new MCPError(
              "Could not access Agent Loop Context from revert last edit tool."
            )
          );
        }

        const { conversation, agentConfiguration } =
          agentLoopContext.runContext;

        const result = await revertClientExecutableFileToPreviousState(auth, {
          fileId: file_id,
          conversationId: conversation.id,
          revertedByAgentConfigurationId: agentConfiguration.sId,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(result.error.message, {
              tracked: result.error.tracked,
            })
          );
        }

        const {
          value: { fileResource, revertedContent },
        } = result;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType =
            buildContentCreationFileNotification(
              _meta.progressToken,
              fileResource,
              "Reverting Content Creation file..."
            );

          // Send a notification to the MCP Client, to refresh the Content Creation file.
          await sendNotification(notification);
        }

        return new Ok([
          {
            type: "resource",
            resource: {
              mimeType:
                INTERNAL_MIME_TYPES.TOOL_OUTPUT.CONTENT_CREATION_REVERT_RESULT,
              uri: fileResource.getPublicUrl(auth),
              text: revertedContent,
            },
          },
        ]);
      }
    )
  );

  server.tool(
    RETRIEVE_CONTENT_CREATION_FILE_TOOL_NAME,
    "Retrieve the current content of an existing Content Creation file by its file ID. " +
      "Use this to read back the content of Content Creation files you have previously created or " +
      `updated. Use this tool before calling ${EDIT_CONTENT_CREATION_FILE_TOOL_NAME} to ` +
      "understand the current file state and identify the exact text to replace.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the Content Creation file to retrieve (e.g., 'fil_abc123')"
        ),
    },
    withToolLogging(
      auth,
      { toolName: RETRIEVE_CONTENT_CREATION_FILE_TOOL_NAME, agentLoopContext },
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
              `File '${fileResource.sId}' (${fileResource.fileName}) retrieved ` +
              `successfully. Content:\n\n${content}`,
          },
        ]);
      }
    )
  );

  // TODO(CONTENT_CREATION 2025-09-01): Register data source file system tools for the Content
  // Creation server once supported in the agent builder.
  // // Register data source file system tools for the Content Creation server with custom
  // // descriptions tailored for Content Creation use cases (visual assets and templates).
  // registerListTool(auth, server, agentLoopContext, {
  //   name: "list_assets",
  //   extraDescription:
  //     "Browse available visual assets and templates in the connected data sources. " +
  //     "Use this to explore folders containing images, icons, slideshow templates, " +
  //     "or other resources that can be incorporated into Content Creation files.",
  // });

  // registerCatTool(auth, server, agentLoopContext, {
  //   name: "cat_assets",
  //   extraDescription:
  //     "Read template files or asset configurations from the connected data sources. " +
  //     "Use this to retrieve slideshow templates, HTML/CSS snippets, React component examples, " +
  //     "or configuration files that can serve as a starting point or be incorporated into Content Creation files.",
  // });

  return server;
};

export default createServer;
