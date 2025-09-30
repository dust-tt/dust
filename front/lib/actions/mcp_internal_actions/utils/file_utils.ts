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

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "_")
    .replace(/[\r\n]/g, "")
    .replace(/[^\w\-._]/g, "_")
    .substring(0, 255);
}

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
      const generatedFiles = m.actions.flatMap((a) => a.generatedFiles);

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

  const bufferResult = await streamToBuffer(readStream);
  if (bufferResult.isErr()) {
    return new Err(bufferResult.error);
  }

  return new Ok({
    buffer: bufferResult.value,
    filename: sanitizeFilename(attachment.title || `attachment-${fileId}`),
    contentType: attachment.contentType || "application/octet-stream",
  });
}

export async function streamToBuffer(
  readStream: NodeJS.ReadableStream
): Promise<Result<Buffer, string>> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of readStream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk));
      }
    }
    return new Ok(Buffer.concat(chunks));
  } catch (error) {
    return new Err(
      `Failed to read file stream: ${normalizeError(error).message}`
    );
  }
}
