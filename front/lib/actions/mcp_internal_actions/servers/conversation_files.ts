import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { computeTextByteSize } from "@app/lib/actions/action_output_limits";
import {
  DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME,
  DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
} from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  conversationAttachmentId,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import {
  CONTENT_OUTDATED_MSG,
  getContentFragmentFromAttachmentFile,
} from "@app/lib/resources/content_fragment_resource";
import type {
  ConversationType,
  ImageContent,
  ModelConfigurationType,
  Result,
  TextContent,
} from "@app/types";
import {
  Err,
  isImageContent,
  isTextContent,
  normalizeError,
  Ok,
} from "@app/types";

const MAX_FILE_SIZE_FOR_GREP = 20 * 1024 * 1024; // 20MB.
const MAX_FILE_SIZE_FOR_INCLUDE = 1024 * 1024; // 1MB.

/**
 * MCP server for handling conversation file operations.
 *
 * This server is designed to replace the legacy conversation_include_file action
 * when JIT actions are migrated to use MCP. Currently, JIT actions still use
 * the legacy action system, but this server provides the MCP implementation
 * for future migration.
 */

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("conversation_files");

  server.tool(
    DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME,
    "Include the content of a file from the conversation attachments. Use this to access the full content of files that have been attached to the conversation.",
    {
      fileId: z
        .string()
        .describe(
          "The fileId of the attachment to include, as returned by the conversation_list_files action"
        ),
    },
    withToolLogging(
      auth,
      { toolName: DEFAULT_CONVERSATION_INCLUDE_FILE_ACTION_NAME, agentLoopContext },
      async ({ fileId }) => {
      if (!agentLoopContext?.runContext) {
        return new Err(new MCPError("No conversation context available"));
      }

      const conversation = agentLoopContext.runContext.conversation;

      const model = getSupportedModelConfig(
        agentLoopContext.runContext.agentConfiguration.model
      );

      const fileRes = await getFileFromConversation(
        auth,
        fileId,
        conversation,
        model
      );

      if (fileRes.isErr()) {
        return new Err(new MCPError(fileRes.error));
      }

      const { content, title } = fileRes.value;

      // Get the file metadata to extract the actual content type
      const attachments = listAttachments(conversation);
      const attachment = attachments.find(
        (a) => conversationAttachmentId(a) === fileId
      );

      if (isTextContent(content)) {
        const textByteSize = computeTextByteSize(content.text);
        if (textByteSize > MAX_FILE_SIZE_FOR_INCLUDE) {
          return new Err(new MCPError(
            `File ${title} is too large (${(textByteSize / 1024 / 1024).toFixed(2)}MB) to include in the conversation. ` +
              `Maximum supported size is ${MAX_FILE_SIZE_FOR_INCLUDE / 1024 / 1024}MB. ` +
              `Consider using cat to read smaller portions of the file.`
          ));
        }

        return new Ok([
            {
              type: "text",
              text: content.text,
            },
          ]);
      } else if (isImageContent(content)) {
        // For images, we return the URL as a resource with the correct MIME type
        return new Ok([
            {
              type: "resource",
              resource: {
                uri: content.image_url.url,
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                mimeType: attachment?.contentType || "application/octet-stream",
                text: `Image: ${title}`,
              },
            },
          ]);
      }

      return new Err(new MCPError(
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        `File ${attachment?.title || fileId} of type ${attachment?.contentType || "unknown"} has no text or image content`
      ));
      }
    )
  );

  server.tool(
    DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME,
    "List all files attached to the conversation.",
    {},
    withToolLogging(
      auth,
      { toolName: DEFAULT_CONVERSATION_LIST_FILES_ACTION_NAME, agentLoopContext },
      async () => {
      if (!agentLoopContext?.runContext) {
        return new Err(new MCPError("No conversation context available"));
      }

      const conversation = agentLoopContext.runContext.conversation;
      const attachments = listAttachments(conversation);

      if (attachments.length === 0) {
        return new Ok([
            {
              type: "text",
              text: "No files are currently attached to the conversation.",
            },
          ]);
      }

      let content = `The following files are currently attached to the conversation:\n`;
      for (const [i, attachment] of attachments.entries()) {
        if (i > 0) {
          content += "\n";
        }
        content += renderAttachmentXml({ attachment });
      }

      return new Ok([
          {
            type: "text",
            text: content,
          },
        ]);
      }
    )
  );

  server.tool(
    "cat",
    "Read the contents of a large file from conversation attachments with offset/limit and optional grep filtering (named after the 'cat' unix tool). " +
      "Use this when files are too large to read in full, or when you need to search for specific patterns within a file.",
    {
      fileId: z
        .string()
        .describe(
          "The fileId of the attachment to read, as returned by the conversation_list_files action"
        ),
      offset: z
        .number()
        .optional()
        .describe(
          "The character position to start reading from (0-based). If not provided, starts from " +
            "the beginning."
        ),
      limit: z
        .number()
        .optional()
        .describe(
          "The maximum number of characters to read. If not provided, reads all characters."
        ),
      grep: z
        .string()
        .optional()
        .describe(
          "A regular expression to filter lines. Applied after offset/limit slicing. Only lines " +
            "matching this pattern will be returned."
        ),
    },
    withToolLogging(
      auth,
      { toolName: "cat", agentLoopContext },
      async ({ fileId, offset, limit, grep }) => {
      if (!agentLoopContext?.runContext) {
        return new Err(new MCPError("No conversation context available"));
      }

      const conversation = agentLoopContext.runContext.conversation;
      const model = getSupportedModelConfig(
        agentLoopContext.runContext.agentConfiguration.model
      );

      const fileRes = await getFileFromConversation(
        auth,
        fileId,
        conversation,
        model
      );

      if (fileRes.isErr()) {
        return new Err(new MCPError(fileRes.error));
      }

      const { content, title } = fileRes.value;

      // Only process text content.
      if (!isTextContent(content)) {
        return new Err(new MCPError(
          `File ${title} does not have text content that can be read with offset/limit`
        ));
      }

      let text = content.text;

      // Returning early with a custom message if the text is empty.
      if (text.length === 0) {
        return new Ok([
            {
              type: "text",
              text: `No content retrieved for file ${title}.`,
            },
          ]);
      }

      // Apply offset and limit.
      if (offset !== undefined || limit !== undefined) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const start = offset || 0;
        const end = limit !== undefined ? start + limit : undefined;

        if (start > text.length) {
          return new Err(new MCPError(
            `Offset ${start} is out of bounds for file ${title}.`
          ));
        }
        if (limit === 0) {
          return new Err(new MCPError(`Limit cannot be equal to 0.`));
        }
        text = text.slice(start, end);
      }

      // Apply grep filter if provided.
      if (grep) {
        // Check if the grep pattern is too large.
        const grepByteSize = computeTextByteSize(grep);
        if (grepByteSize > MAX_FILE_SIZE_FOR_GREP) {
          return new Err(new MCPError(
            `Grep pattern is too large (${(grepByteSize / 1024 / 1024).toFixed(2)}MB) to apply grep filtering. ` +
              `Maximum supported size is ${MAX_FILE_SIZE_FOR_GREP / 1024 / 1024}MB. ` +
              `Consider using offset/limit to read smaller portions of the file.`
          ));
        }

        try {
          const regex = new RegExp(grep, "gm");
          const lines = text.split("\n");
          const matchedLines = lines.filter((line) => regex.test(line));
          text = matchedLines.join("\n");
        } catch (e) {
          return new Err(new MCPError(
            `Invalid regular expression: ${grep}. Error: ${normalizeError(e)}`
          ));
        }
        if (text.length === 0) {
          return new Err(new MCPError(
            `No lines matched the grep pattern: ${grep}.`
          ));
        }
      }

      return new Ok([
          {
            type: "text",
            text,
          },
        ]);
      }
    )
  );

  return server;
}

export async function getFileFromConversation(
  auth: Authenticator,
  fileId: string,
  conversation: ConversationType,
  model: ModelConfigurationType
): Promise<
  Result<
    { fileId: string; title: string; content: ImageContent | TextContent },
    string
  >
> {
  // Note on `contentFragmentVersion`: two content fragment versions are created with different
  // fileIds. So we accept here rendering content fragments that are superseded. This will mean
  // that past actions on a previous version of a content fragment will correctly render the
  // content as being superseded, showing the model that a new version is available. The fileId of
  // this new version will be different, but the title will likely be the same and the model should
  // be able to understand the state of affairs. We use content.flat() to consider all versions of
  // messages here (to support rendering a file that was part of an old version of a previous
  // message).
  const attachments = listAttachments(conversation);
  const attachment = attachments.find(
    (a) => conversationAttachmentId(a) === fileId
  );
  if (!attachment || !attachment.isIncludable) {
    return new Err(`File \`${fileId}\` not found in conversation`);
  }
  if (attachment.contentFragmentVersion === "superseded") {
    return new Ok({
      fileId,
      title: attachment.title,
      content: {
        type: "text",
        text: CONTENT_OUTDATED_MSG,
      },
    });
  }
  const r = await getContentFragmentFromAttachmentFile(auth, {
    attachment,
    excludeImages: false,
    model,
  });

  if (r.isErr()) {
    return new Err(`Error including conversation file: ${r.error}`);
  }

  if (
    !isTextContent(r.value.content[0]) &&
    !isImageContent(r.value.content[0])
  ) {
    return new Err(`File \`${fileId}\` has no text or image content`);
  }

  return new Ok({
    fileId,
    title: attachment.title,
    content: r.value.content[0],
  });
}

export default createServer;
