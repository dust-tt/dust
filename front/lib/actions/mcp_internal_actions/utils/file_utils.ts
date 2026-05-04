import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { ConversationAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import {
  conversationAttachmentId,
  getAttachmentFromContentFragment,
  isFileAttachmentType,
  makeFileAttachment,
} from "@app/lib/api/assistant/conversation/attachments";
import { resolveConversationFile } from "@app/lib/api/actions/servers/files/tools/utils";
import { parseScopedFilePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { streamToBuffer } from "@app/lib/utils/streams";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "_")
    .replace(/[\r\n]/g, "")
    .replace(/[^\w\-._]/g, "_")
    .substring(0, 255);
}


export type ConversationFileRef = {
  contentType: string;
  sizeBytes: number;
  fileName: string;
  getSignedUrl: () => Promise<string>;
  createReadStream: () => NodeJS.ReadableStream;
};

/**
 * Resolve a conversation file (scoped path or legacy fileId) to its metadata
 * and lazy GCS accessors, without reading its content.
 *
 * Scoped paths are resolved via GCS mount path.
 * Legacy fileIds are resolved via FileResource with a conversation ownership check.
 */
export async function resolveConversationFileRef(
  auth: Authenticator,
  fileId: string,
  agentLoopContext: AgentLoopContextType | undefined
): Promise<Result<ConversationFileRef, string>> {
  if (!agentLoopContext?.runContext) {
    return new Err("No conversation context available");
  }

  const parsed = parseScopedFilePath(fileId);
  if (parsed) {
    const conversation = agentLoopContext.runContext.conversation;
    const resolvedRes = await resolveConversationFile(auth, conversation, fileId);
    if (resolvedRes.isErr()) {
      return new Err(resolvedRes.error.message);
    }
    const { file: gcsFile, mimeType, sizeBytes } = resolvedRes.value;
    return new Ok({
      contentType: mimeType,
      sizeBytes,
      fileName: sanitizeFilename(parsed.rel.split("/").pop() ?? parsed.rel),
      getSignedUrl: () => getPrivateUploadBucket().getSignedUrl(gcsFile.name),
      createReadStream: () => gcsFile.createReadStream(),
    });
  }

  const conversation = agentLoopContext.runContext.conversation;
  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    return new Err(`File resource not found for fileId ${fileId}`);
  }

  const belongsResult = fileResource.belongsToConversation(conversation.sId);
  if (belongsResult.isErr() || !belongsResult.value) {
    return new Err(`File ${fileId} does not belong to this conversation`);
  }

  return new Ok({
    contentType: fileResource.contentType,
    sizeBytes: fileResource.fileSize,
    fileName: sanitizeFilename(fileResource.fileName),
    getSignedUrl: () => fileResource.getSignedUrlForDownload(auth, "original"),
    createReadStream: () => fileResource.getReadStream({ auth, version: "original" }),
  });
}

/**
 * Get file data from a conversation attachment, including images.
 * Accepts either a scoped file path (e.g. "conversation/report.pdf") or a
 * legacy fileId (e.g. "fil_xxx").
 *
 * Scoped paths are resolved via GCS mount path (workspace + conversation scoped).
 * When no FileResource record exists for the GCS path (e.g. tool-written outputs),
 * content is read directly from GCS.
 *
 * Legacy fileIds are resolved by scanning conversation content.
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

  // Scoped paths resolve through mount path.
  const parsed = parseScopedFilePath(fileId);
  if (parsed) {
    const conversation = agentLoopContext.runContext.conversation;
    const resolvedRes = await resolveConversationFile(
      auth,
      conversation,
      fileId
    );
    if (resolvedRes.isErr()) {
      return new Err(resolvedRes.error.message);
    }
    const { file: gcsFile, mimeType } = resolvedRes.value;

    const bufferResult = await streamToBuffer(gcsFile.createReadStream());
    if (bufferResult.isErr()) {
      return new Err(bufferResult.error);
    }

    return new Ok({
      buffer: bufferResult.value,
      filename: sanitizeFilename(parsed.rel.split("/").pop() ?? parsed.rel),
      contentType: mimeType,
    });
  }

  // Legacy fileId path: scan the conversation to find the attachment.
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
        if (f.fileId === fileId) {
          attachment = makeFileAttachment({
            fileId: f.fileId,
            source: "agent",
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
            contentType: f.contentType,
            title: f.title,
            snippet: f.snippet,
            isInProjectContext: f.isInProjectContext ?? false,
            hideFromUser: f.hidden ?? false,
            skipDataSourceIndexing: f.skipDataSourceIndexing ?? false,
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
