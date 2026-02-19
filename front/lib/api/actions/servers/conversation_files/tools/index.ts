import { computeTextByteSize } from "@app/lib/actions/action_output_limits";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CONVERSATION_CAT_FILE_ACTION_NAME,
  CONVERSATION_FILES_TOOLS_METADATA,
  CONVERSATION_LIST_FILES_ACTION_NAME,
} from "@app/lib/api/actions/servers/conversation_files/metadata";
import {
  conversationAttachmentId,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import {
  CONTENT_OUTDATED_MSG,
  getContentFragmentFromAttachmentFile,
} from "@app/lib/resources/content_fragment_resource";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  ImageContent,
  TextContent,
} from "@app/types/assistant/generation";
import { isImageContent, isTextContent } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const MAX_FILE_SIZE_FOR_GREP = 20 * 1024 * 1024; // 20MB.

const handlers: ToolHandlers<typeof CONVERSATION_FILES_TOOLS_METADATA> = {
  [CONVERSATION_LIST_FILES_ACTION_NAME]: async (
    _,
    { auth, agentLoopContext }
  ) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("No conversation context available"));
    }

    const conversation = agentLoopContext.runContext.conversation;
    const attachments = await listAttachments(auth, { conversation });

    if (attachments.length === 0) {
      return new Ok([
        {
          type: "text",
          text: "No files are currently attached to the conversation.",
        },
      ]);
    }

    let content = "";

    // Directly attached files.
    attachments
      .filter((a) => !a.isInProjectContext)
      .forEach((attachment, i) => {
        if (i === 0) {
          content +=
            "The following files are currently attached to the conversation directly:\n";
        } else {
          content += "\n";
        }
        content += renderAttachmentXml({ attachment });
      });

    // Project context attached files.
    attachments
      .filter((a) => a.isInProjectContext)
      .forEach((attachment, i) => {
        if (i === 0) {
          content +=
            "The following files are currently attached to the conversation via the project context:\n";
        } else {
          content += "\n";
        }
        content += renderAttachmentXml({ attachment });
      });

    return new Ok([
      {
        type: "text",
        text: content,
      },
    ]);
  },

  [CONVERSATION_CAT_FILE_ACTION_NAME]: async (
    { fileId, offset, limit, grep },
    { auth, agentLoopContext }
  ) => {
    if (!agentLoopContext?.runContext) {
      return new Err(new MCPError("No conversation context available"));
    }

    const conversation = agentLoopContext.runContext.conversation;
    const model = getSupportedModelConfig(
      agentLoopContext.runContext.agentConfiguration.model
    );
    if (!model) {
      return new Err(new MCPError("Model configuration not found"));
    }

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
      return new Err(
        new MCPError(
          `File ${title} does not have text content that can be read with offset/limit`,
          {
            tracked: false,
          }
        )
      );
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
        return new Err(
          new MCPError(`Offset ${start} is out of bounds for file ${title}.`, {
            tracked: false,
          })
        );
      }
      if (limit === 0) {
        return new Err(
          new MCPError(`Limit cannot be equal to 0.`, {
            tracked: false,
          })
        );
      }
      text = text.slice(start, end);
    }

    // Apply grep filter if provided.
    if (grep) {
      // Check if the grep pattern is too large.
      const grepByteSize = computeTextByteSize(grep);
      if (grepByteSize > MAX_FILE_SIZE_FOR_GREP) {
        return new Err(
          new MCPError(
            `Grep pattern is too large (${(grepByteSize / 1024 / 1024).toFixed(2)}MB) to apply grep filtering. ` +
              `Maximum supported size is ${MAX_FILE_SIZE_FOR_GREP / 1024 / 1024}MB. ` +
              `Consider using offset/limit to read smaller portions of the file.`,
            {
              tracked: false,
            }
          )
        );
      }

      try {
        const regex = new RegExp(grep, "gm");
        const lines = text.split("\n");
        const matchedLines = lines.filter((line) => regex.test(line));
        text = matchedLines.join("\n");
      } catch (e) {
        return new Err(
          new MCPError(
            `Invalid regular expression: ${grep}. Error: ${normalizeError(e)}`,
            { tracked: false }
          )
        );
      }
      if (text.length === 0) {
        return new Err(
          new MCPError(`No lines matched the grep pattern: ${grep}.`, {
            tracked: false,
          })
        );
      }
    }

    return new Ok([
      {
        type: "text",
        text,
      },
    ]);
  },
};

async function getFileFromConversation(
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
  const attachments = await listAttachments(auth, { conversation });
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

export const TOOLS = buildTools(CONVERSATION_FILES_TOOLS_METADATA, handlers);
