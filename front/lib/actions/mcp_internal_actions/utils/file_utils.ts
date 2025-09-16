import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  conversationAttachmentId,
  getAttachmentFromContentFragment,
  getAttachmentFromToolOutput,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  isAgentMessageType,
  isContentCreationFileContentType,
  isContentFragmentType,
  normalizeError,
} from "@app/types";

/**
 * Get file data from a conversation attachment, including images
 * This is a more comprehensive version than listAttachments() which excludes images
 */
export async function getFileFromConversationAttachment(
  auth: Authenticator,
  fileId: string,
  agentLoopContext: AgentLoopContextType
): Promise<
  Result<
    {
      buffer: Buffer;
      filename: string;
      contentType: string;
    },
    string
  >
> {
  try {
    if (!agentLoopContext?.runContext) {
      return new Err("No conversation context available");
    }

    const conversation = agentLoopContext.runContext.conversation;
    let attachment: ConversationAttachmentType | null = null;

    for (const versions of conversation.content) {
      const m = versions[versions.length - 1];

      if (isContentFragmentType(m)) {
        if (m.contentFragmentVersion === "latest") {
          const candidateAttachment = getAttachmentFromContentFragment(m);
          if (
            candidateAttachment &&
            conversationAttachmentId(candidateAttachment) === fileId
          ) {
            attachment = candidateAttachment;
            break;
          }
        }
      } else if (isAgentMessageType(m)) {
        const generatedFiles = m.actions.flatMap((a) => a.getGeneratedFiles());

        for (const f of generatedFiles) {
          if (isContentCreationFileContentType(f.contentType)) {
            continue;
          }

          if (f.fileId === fileId) {
            attachment = getAttachmentFromToolOutput({
              fileId: f.fileId,
              contentType: f.contentType,
              title: f.title,
              snippet: f.snippet,
            });
            break;
          }
        }
        if (attachment) {
          break;
        }
      }
    }

    if (!attachment) {
      return new Err(
        `Attachment with fileId ${fileId} not found in conversation`
      );
    }

    if (!isFileAttachmentType(attachment)) {
      return new Err(`Attachment ${fileId} is not a file attachment`);
    }

    const fileResource = await FileResource.fetchById(auth, attachment.fileId);
    if (!fileResource) {
      return new Err(`File resource not found for fileId ${fileId}`);
    }
    const readStream = fileResource.getReadStream({
      auth,
      version: "original",
    });
    const buffer = await streamToBuffer(readStream);

    return new Ok({
      buffer,
      filename: attachment.title || `attachment-${fileId}`,
      contentType: attachment.contentType || "application/octet-stream",
    });
  } catch (error) {
    return new Err(
      `Failed to get file from conversation: ${normalizeError(error).message}`
    );
  }
}

export async function streamToBuffer(
  readStream: NodeJS.ReadableStream
): Promise<Buffer> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of readStream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk as string));
      }
    }
    return Buffer.concat(chunks);
  } catch (error) {
    throw new Error(
      `Failed to read file stream: ${normalizeError(error).message}`
    );
  }
}
