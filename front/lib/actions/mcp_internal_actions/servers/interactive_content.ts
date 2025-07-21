import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  createClientExecutableFile,
  updateClientExecutableFile,
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
const UPDATE_INTERACTIVE_FILE_TOOL_NAME = "update_interactive_file";

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
      async ({ file_name, mime_type, content, description }) => {
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
    UPDATE_INTERACTIVE_FILE_TOOL_NAME,
    "Update the content of an existing interactive content file by its file ID. Use this to " +
      "modify or improve existing interactive content.",
    {
      file_id: z
        .string()
        .describe(
          "The ID of the interactive content file to update (e.g., 'fil_abc123')"
        ),
      content: z
        .string()
        .max(MAX_FILE_SIZE_BYTES)
        .describe(
          "The updated content for the interactive file. Should be complete and ready for " +
            "execution or interaction."
        ),
      description: z
        .string()
        .optional()
        .describe(
          "Optional description of what changes were made to the interactive content (e.g., " +
            "'Enhanced user interaction', 'Fixed functionality', 'Added new features')"
        ),
    },
    withToolLogging(
      auth,
      UPDATE_INTERACTIVE_FILE_TOOL_NAME,
      async ({ file_id, content, description }) => {
        const result = await updateClientExecutableFile(auth, {
          fileId: file_id,
          content,
        });

        if (result.isErr()) {
          return makeMCPToolTextError(result.error.message);
        }

        const { value: fileResource } = result;

        const responseText = description
          ? `File '${fileResource.sId}' updated successfully. ${description}`
          : `File '${fileResource.sId}' updated successfully.`;

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

  return server;
};

export default createServer;
