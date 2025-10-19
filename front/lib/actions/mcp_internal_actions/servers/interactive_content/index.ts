import type { MCPProgressNotificationType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  GET_INTERACTIVE_CONTENT_FILE_SHARE_URL_TOOL_NAME,
  RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/interactive_content/types";
import type { InternalMcpServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  createClientExecutableFile,
  editClientExecutableFile,
  getClientExecutableFileContent,
  getClientExecutableFileShareUrl,
  renameClientExecutableFile,
  revertClientExecutableFileChanges,
} from "@app/lib/api/files/client_executable";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { InteractiveContentFileContentType } from "@app/types";
import {
  Err,
  frameContentType,
  INTERACTIVE_CONTENT_FILE_FORMATS,
  Ok,
} from "@app/types";

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

/**
 * Builds a progress notification for interactive content file operations
 */
function buildInteractiveContentFileNotification(
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
          type: "interactive_content_file",
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
 * Interactive Content Server - Allows the model to create and update Interactive Content files.
 * Interactive Content includes any file that users can execute, run, or interact with directly.
 * Currently supports client-executable files, with plans to expand to other interactive formats.
 * Files are rendered in a viewer where users can execute and interact with them.
 * We return the file resource only on file creation, as edit updates the existing file.
 */

const serverName = "interactive_content";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): InternalMcpServer<typeof serverName> {
  const server = makeInternalMCPServer(serverName);

  server.tool(
    CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    "Create a new Interactive Content file that users can execute or interact with. Use this for " +
      "content that provides functionality beyond static viewing.",
    {
      file_name: z
        .string()
        .describe(
          "The name of the Interactive Content file to create, including extension (e.g. " +
            "DataVisualization.tsx)"
        ),
      mime_type: z
        .enum(
          Object.keys(INTERACTIVE_CONTENT_FILE_FORMATS) as [
            InteractiveContentFileContentType,
          ]
        )
        .describe(
          "The MIME type for the Interactive Content file. Use " +
            `'${frameContentType}' for Frame components (React/JSX).`
        ),
      content: z
        .string()
        .max(MAX_FILE_SIZE_BYTES)
        .describe(
          "The content for the Interactive Content file. Should be complete and ready for execution or " +
            "interaction."
        ),
      description: z
        .string()
        .optional()
        .describe(
          "Optional description of what this Interactive Content file does (e.g., " +
            "'Interactive data visualization', 'Executable analysis script', " +
            "'Dynamic dashboard')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
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
            buildInteractiveContentFileNotification(
              _meta.progressToken,
              fileResource,
              "Creating interactive file..."
            );

          // Send a notification to the MCP Client, to display the interactive file.
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
    EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    "Modifies content within an Interactive Content file by substituting specified text segments. " +
      "Performs single substitution by default, or multiple substitutions when " +
      "`expected_replacements` is defined. This function demands comprehensive contextual " +
      "information surrounding the target modification to ensure accurate targeting. " +
      `Use the ${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME} tool to review the file's ` +
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
          "The ID of the Interactive Content file to update (e.g., 'fil_abc123')"
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
        toolNameForMonitoring: EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
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
            buildInteractiveContentFileNotification(
              _meta.progressToken,
              fileResource,
              "Updating Interactive Content file..."
            );

          // Send a notification to the MCP Client, to refresh the Interactive Content file.
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
    REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    "Reverts a Interactive Content file by canceling the edits and file renames in the last agent message.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to revert (e.g., 'fil_abc123')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: REVERT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ file_id }, { sendNotification, _meta }) => {
        if (!agentLoopContext?.runContext) {
          throw new Error(
            "Could not access Agent Loop Context from revert Interactive Content file tool."
          );
        }

        const { conversation, agentConfiguration } =
          agentLoopContext.runContext;

        const result = await revertClientExecutableFileChanges(auth, {
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
          value: { fileResource },
        } = result;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType =
            buildInteractiveContentFileNotification(
              _meta.progressToken,
              fileResource,
              "Reverting Interactive Content file..."
            );

          // Send a notification to the MCP Client, to refresh the Interactive Content file.
          await sendNotification(notification);
        }

        return new Ok([
          {
            type: "text",
            text: `File '${fileResource.sId}' reverted successfully.`,
          },
        ]);
      }
    )
  );

  server.tool(
    RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    "Rename an Interactive Content file. Use this to change the file name while keeping the content unchanged.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to rename (e.g., 'fil_abc123')"
        ),
      new_file_name: z
        .string()
        .describe(
          "The new name for the file, including extension (e.g., 'UpdatedChart.tsx')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: RENAME_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
      },
      async ({ file_id, new_file_name }, { sendNotification, _meta }) => {
        const { agentConfiguration } = agentLoopContext?.runContext ?? {};

        const result = await renameClientExecutableFile(auth, {
          fileId: file_id,
          newFileName: new_file_name,
          renamedByAgentConfigurationId: agentConfiguration?.sId,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(result.error.message, {
              tracked: result.error.tracked,
            })
          );
        }

        const fileResource = result.value;

        const responseText = `File '${fileResource.sId}' renamed successfully to '${fileResource.fileName}'.`;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType =
            buildInteractiveContentFileNotification(
              _meta.progressToken,
              fileResource,
              "Renaming interactive file..."
            );

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
    RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    "Retrieve the current content of an existing Interactive Content file by its file ID. " +
      "Use this to read back the content of Interactive Content files you have previously created " +
      `or updated. Use this tool before calling ${EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME} to ` +
      "understand the current file state and identify the exact text to replace.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to retrieve (e.g., 'fil_abc123')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        agentLoopContext,
        enableAlerting: true,
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
              `File '${fileResource.sId}' (${fileResource.fileName}) retrieved ` +
              `successfully. Content:\n\n${content}`,
          },
        ]);
      }
    )
  );

  server.tool(
    GET_INTERACTIVE_CONTENT_FILE_SHARE_URL_TOOL_NAME,
    "Get the share URL for an Interactive Content file. Returns the share URL if the file is " +
      "currently shared.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the Interactive Content file to get share URL for (e.g., 'fil_abc123')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GET_INTERACTIVE_CONTENT_FILE_SHARE_URL_TOOL_NAME,
        agentLoopContext,
        enableAlerting: false,
      },
      async ({ file_id }) => {
        const shareUrlRes = await getClientExecutableFileShareUrl(
          auth,
          file_id
        );
        if (shareUrlRes.isErr()) {
          return new Err(new MCPError(shareUrlRes.error.message));
        }

        return new Ok([
          {
            type: "text",
            text: `URL: ${shareUrlRes.value}`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
