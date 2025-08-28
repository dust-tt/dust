import type { MCPProgressNotificationType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  CREATE_CANVAS_FILE_TOOL_NAME,
  EDIT_CANVAS_FILE_TOOL_NAME,
  RETRIEVE_CANVAS_FILE_TOOL_NAME,
} from "@app/lib/actions/mcp_internal_actions/servers/canvas/types";
import { validateTailwindCode } from "@app/lib/actions/mcp_internal_actions/servers/canvas/validation";
import { registerCatTool } from "@app/lib/actions/mcp_internal_actions/servers/data_sources_file_system/cat_tool";
import { registerListTool } from "@app/lib/actions/mcp_internal_actions/servers/data_sources_file_system/list_tool";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  createClientExecutableFile,
  editClientExecutableFile,
  getClientExecutableFileContent,
} from "@app/lib/api/files/client_executable";
import type { Authenticator } from "@app/lib/auth";
import type { CanvasFileContentType } from "@app/types";
import {
  clientExecutableContentType,
  Err,
  Ok,
  slideshowContentType,
} from "@app/types";
import { CANVAS_FILE_FORMATS } from "@app/types";

const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

/**
 * Canvas Server - Allows the model to create and update canvas files.
 * Canvas includes any file that users can execute, run, or interact with directly.
 * Currently supports client-executable files, with plans to expand to other interactive formats.
 * Files are rendered in a canvas viewer where users can execute and interact with them.
 * We return the file resource only on file creation, as edit updates the existing file.
 */
const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("canvas");

  server.tool(
    CREATE_CANVAS_FILE_TOOL_NAME,
    "Create a new canvas file that users can execute or interact with. Use this for " +
      "content that provides functionality beyond static viewing.",
    {
      file_name: z
        .string()
        .describe(
          "The name of the canvas file to create, including extension (e.g. " +
            "DataVisualization.tsx)"
        ),
      mime_type: z
        .enum(Object.keys(CANVAS_FILE_FORMATS) as [CanvasFileContentType])
        .describe(
          "The MIME type for the canvas. Currently supports " +
            `'${clientExecutableContentType}' for client-side executable files and ` +
            `'${slideshowContentType}' for slideshows.`
        ),
      content: z
        .string()
        .max(MAX_FILE_SIZE_BYTES)
        .describe(
          "The content for the canvas file. Should be complete and ready for execution or " +
            "interaction."
        ),
      description: z
        .string()
        .optional()
        .describe(
          "Optional description of what this canvas does (e.g., " +
            "'Interactive data visualization', 'Executable analysis script', " +
            "'Dynamic dashboard')"
        ),
    },
    withToolLogging(
      auth,
      { toolName: CREATE_CANVAS_FILE_TOOL_NAME, agentLoopContext },
      async (
        { file_name, mime_type, content, description },
        { sendNotification, _meta }
      ) => {
        const validationResult = validateTailwindCode(content);
        if (validationResult.isErr()) {
          return new Err(new MCPError(validationResult.error.message));
        }

        const { conversation } = agentLoopContext?.runContext ?? {};
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
        });

        if (result.isErr()) {
          return new Err(new MCPError(result.error.message));
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
                label: "Creating canvas...",
                output: {
                  type: "canvas_file",
                  fileId: fileResource.sId,
                  mimeType: fileResource.contentType,
                  title: fileResource.fileName,
                  updatedAt: fileResource.updatedAtMs.toString(),
                },
              },
            },
          };

          // Send a notification to the MCP Client, to display the canvas file.
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
    EDIT_CANVAS_FILE_TOOL_NAME,
    "Modifies content within an canvas file by substituting specified text segments. " +
      "Performs single substitution by default, or multiple substitutions when " +
      "`expected_replacements` is defined. This function demands comprehensive contextual " +
      "information surrounding the target modification to ensure accurate targeting. " +
      `Use the ${RETRIEVE_CANVAS_FILE_TOOL_NAME} tool to review the file's ` +
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
        .describe("The ID of the canvas file to update (e.g., 'fil_abc123')"),
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
      { toolName: EDIT_CANVAS_FILE_TOOL_NAME, agentLoopContext },
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
          return new Err(
            new MCPError(result.error.message, { tracked: false })
          );
        }

        const { fileResource, replacementCount } = result.value;

        const pluralS = replacementCount === 1 ? "" : "s";
        const responseText =
          `File '${fileResource.sId}' updated successfully. Made ` +
          `${replacementCount} replacement${pluralS}`;

        if (_meta?.progressToken) {
          const notification: MCPProgressNotificationType = {
            method: "notifications/progress",
            params: {
              progress: 1,
              total: 1,
              progressToken: _meta?.progressToken,
              data: {
                label: "Updating canvas...",
                output: {
                  type: "canvas_file",
                  fileId: fileResource.sId,
                  mimeType: fileResource.contentType,
                  title: fileResource.fileName,
                  updatedAt: fileResource.updatedAtMs.toString(),
                },
              },
            },
          };

          // Send a notification to the MCP Client, to refresh the canvas file.
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
    RETRIEVE_CANVAS_FILE_TOOL_NAME,
    "Retrieve the current content of an existing canvas file by its file ID. " +
      "Use this to read back the content of canvas files you have previously created or " +
      `updated. Use this tool before calling ${EDIT_CANVAS_FILE_TOOL_NAME} to ` +
      "understand the current file state and identify the exact text to replace.",
    {
      file_id: z
        .string()
        .describe("The ID of the canvas file to retrieve (e.g., 'fil_abc123')"),
    },
    withToolLogging(
      auth,
      { toolName: RETRIEVE_CANVAS_FILE_TOOL_NAME, agentLoopContext },
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

  // Register data source file system tools for canvas server with custom descriptions
  // tailored for canvas use cases (visual assets and templates).
  registerListTool(auth, server, agentLoopContext, {
    toolName: "list_assets",
    toolDescription:
      "Browse available visual assets and templates in the connected data sources. " +
      "Use this to explore folders containing images, icons, slideshow templates, " +
      "or other resources that can be incorporated into canvas files.\n\n" +
      "List the direct contents of a node. Can be used to see what is inside a specific folder from " +
      "the filesystem, like 'ls' in Unix. A good fit is to explore the filesystem structure step " +
      "by step. This tool can be called repeatedly by passing the 'nodeId' output from a step to " +
      "the next step's nodeId. If a node output by this tool has children " +
      "(hasChildren: true), it means that this tool can be used again on it.",
  });

  registerCatTool(auth, server, agentLoopContext, {
    toolName: "cat_assets",
    toolDescription:
      "Read template files or asset configurations from the connected data sources. " +
      "Use this to retrieve slideshow templates, HTML/CSS snippets, React component examples, " +
      "or configuration files that can serve as a starting point or be incorporated into canvas files.\n\n" +
      "Read the contents of a document, referred to by its nodeId (named after the 'cat' unix tool). " +
      "The nodeId can be obtained using the 'list_assets' tool.",
  });

  return server;
};

export default createServer;
