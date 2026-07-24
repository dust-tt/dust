import type {
  AgentLoopRunContext,
  ToolRunContext,
} from "@app/lib/actions/types";
import { resolveFile } from "@app/lib/api/actions/servers/files/tools/utils";
import {
  conversationAttachmentId,
  getAttachmentFromContentFragment,
  isFileAttachmentType,
  makeFileAttachment,
} from "@app/lib/api/assistant/conversation/attachments";
import { DustFileSystem, SCOPED_PREFIX_POD } from "@app/lib/api/file_system";
import {
  isCanonicalScopedPath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { streamToBuffer } from "@app/lib/utils/streams";
import type { ConversationAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { isContentFragmentType } from "@app/types/content_fragment";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { PassThrough } from "stream";

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/\.\./g, "")
    .replace(/[/\\]/g, "_")
    .replace(/[\r\n]/g, "")
    .replace(/[^\w\-._]/g, "_")
    .substring(0, 255);
}

export type ToolFileRef = {
  contentType: string;
  sizeBytes: number;
  fileName: string;
  getSignedUrl: () => Promise<string>;
  createReadStream: () => NodeJS.ReadableStream;
};

type ToolFileResolution =
  | {
      kind: "dust_file_system";
      fileSystem: DustFileSystem;
      scopedPath: string;
    }
  | {
      kind: "agent_loop_legacy";
      runContext: AgentLoopRunContext;
    };

async function getDustFileSystemFileRef(
  auth: Authenticator,
  fileRef: string,
  runContext: ToolRunContext
): Promise<Result<ToolFileResolution, string>> {
  switch (runContext.contextType) {
    case "agent_loop": {
      if (!isCanonicalScopedPath(fileRef)) {
        return new Ok({ kind: "agent_loop_legacy", runContext });
      }

      const fsResult = await DustFileSystem.fromScopedPath(auth, fileRef);
      if (fsResult.isErr()) {
        return new Err(fsResult.error.message);
      }

      return new Ok({
        kind: "dust_file_system",
        fileSystem: fsResult.value,
        scopedPath: fileRef,
      });
    }

    case "sandbox_function": {
      const space = runContext.invocation.sandboxFunction.space;
      const scopedPrefix = `${SCOPED_PREFIX_POD}${space.sId}`;
      const sandboxMountPoint = `/files/${scopedPrefix}`;
      const scopedPath = fileRef.startsWith(`${sandboxMountPoint}/`)
        ? fileRef.slice("/files/".length)
        : fileRef;

      const fsResult = await DustFileSystem.forPod(auth, space);
      if (fsResult.isErr()) {
        return new Err(fsResult.error.message);
      }

      return new Ok({
        kind: "dust_file_system",
        fileSystem: fsResult.value,
        scopedPath,
      });
    }

    default:
      return assertNever(runContext);
  }
}

/**
 * Resolve a file from the current tool run to its metadata and lazy GCS
 * accessors, without reading its content.
 *
 * Agent-loop runs accept scoped paths and legacy conversation file IDs.
 * Sandbox-function runs accept paths in the invoking function's pod mount.
 */
export async function resolveToolFileRef(
  auth: Authenticator,
  fileRef: string,
  runContext: ToolRunContext
): Promise<Result<ToolFileRef, string>> {
  const dustFileSystemRefResult = await getDustFileSystemFileRef(
    auth,
    fileRef,
    runContext
  );
  if (dustFileSystemRefResult.isErr()) {
    return dustFileSystemRefResult;
  }

  if (dustFileSystemRefResult.value.kind === "dust_file_system") {
    const { fileSystem, scopedPath } = dustFileSystemRefResult.value;

    const statResult = await fileSystem.stat(scopedPath);
    if (statResult.isErr()) {
      return new Err(statResult.error.message);
    }
    if (!statResult.value) {
      return new Err(`File not found: \`${fileRef}\`.`);
    }

    const { contentType, sizeBytes } = statResult.value;
    const filename = scopedPath.split("/").pop() ?? scopedPath;

    return new Ok({
      contentType,
      sizeBytes,
      fileName: sanitizeFilename(filename),
      getSignedUrl: async () => {
        const urlResult = await fileSystem.getDownloadUrl(scopedPath);
        if (urlResult.isErr()) {
          throw new Error(urlResult.error.message);
        }
        return urlResult.value;
      },
      createReadStream: () => {
        const pass = new PassThrough();
        void fileSystem.read(scopedPath).then((result) => {
          if (result.isErr() || !result.value) {
            pass.destroy(
              result.isErr()
                ? new Error(result.error.message)
                : new Error(`File not found: \`${fileRef}\``)
            );
          } else {
            result.value.pipe(pass);
          }
        });
        return pass;
      },
    });
  }

  const { runContext: agentLoopRunContext } = dustFileSystemRefResult.value;
  const parsed = parseScopedFilePath(fileRef);
  if (parsed) {
    const conversation = agentLoopRunContext.conversation;
    const resolvedRes = await resolveFile(auth, conversation, fileRef);
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

  const conversation = agentLoopRunContext.conversation;
  const fileResource = await FileResource.fetchById(auth, fileRef);
  if (!fileResource) {
    return new Err(`File resource not found for fileId ${fileRef}`);
  }

  const belongsResult = fileResource.belongsToConversation(conversation.sId);
  if (belongsResult.isErr() || !belongsResult.value) {
    return new Err(`File ${fileRef} does not belong to this conversation`);
  }

  return new Ok({
    contentType: fileResource.contentType,
    sizeBytes: fileResource.fileSize,
    fileName: sanitizeFilename(fileResource.fileName),
    getSignedUrl: () => fileResource.getSignedUrlForDownload(auth, "original"),
    createReadStream: () =>
      fileResource.getReadStream({ auth, version: "original" }),
  });
}

/**
 * Read a file from the current tool run, including images.
 *
 * Agent-loop runs accept scoped paths and legacy conversation file IDs.
 * Sandbox-function runs accept paths in the invoking function's pod mount.
 */
export async function getFileFromToolFileRef(
  auth: Authenticator,
  fileRef: string,
  runContext: ToolRunContext
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
  const dustFileSystemRefResult = await getDustFileSystemFileRef(
    auth,
    fileRef,
    runContext
  );
  if (dustFileSystemRefResult.isErr()) {
    return dustFileSystemRefResult;
  }

  if (dustFileSystemRefResult.value.kind === "dust_file_system") {
    const { fileSystem, scopedPath } = dustFileSystemRefResult.value;

    const statResult = await fileSystem.stat(scopedPath);
    if (statResult.isErr()) {
      return new Err(statResult.error.message);
    }
    if (!statResult.value) {
      return new Err(`File not found: \`${fileRef}\`.`);
    }

    const readResult = await fileSystem.read(scopedPath);
    if (readResult.isErr()) {
      return new Err(readResult.error.message);
    }
    if (!readResult.value) {
      return new Err(`File not found: \`${fileRef}\`.`);
    }

    const bufferResult = await streamToBuffer(readResult.value);
    if (bufferResult.isErr()) {
      return new Err(bufferResult.error);
    }

    const filename = scopedPath.split("/").pop() ?? scopedPath;
    return new Ok({
      buffer: bufferResult.value,
      filename: sanitizeFilename(filename),
      contentType: statResult.value.contentType,
    });
  }

  const { runContext: agentLoopRunContext } = dustFileSystemRefResult.value;

  // Scoped paths resolve through mount path.
  const parsed = parseScopedFilePath(fileRef);
  if (parsed) {
    const conversation = agentLoopRunContext.conversation;
    const resolvedRes = await resolveFile(auth, conversation, fileRef);
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
  const conversation = agentLoopRunContext.conversation;
  let attachment: ConversationAttachmentType | null = null;

  for (const versions of conversation.content) {
    const m = versions[versions.length - 1];

    if (isContentFragmentType(m)) {
      if (m.contentFragmentVersion === "latest") {
        const candidateAttachment = getAttachmentFromContentFragment(m);
        if (
          candidateAttachment &&
          conversationAttachmentId(candidateAttachment) === fileRef
        ) {
          attachment = candidateAttachment;
          break;
        }
      }
    } else if (isAgentMessageType(m)) {
      const generatedFiles = m.actions.flatMap((a) => a.generatedFiles);

      for (const f of generatedFiles) {
        if (f.fileId === fileRef) {
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
      `Attachment with fileId ${fileRef} not found in conversation`
    );
  }

  if (!isFileAttachmentType(attachment)) {
    return new Err(`Attachment ${fileRef} is not a file attachment`);
  }

  const fileResource = await FileResource.fetchById(auth, attachment.fileId);
  if (!fileResource) {
    return new Err(`File resource not found for fileId ${fileRef}`);
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
    filename: sanitizeFilename(attachment.title || `attachment-${fileRef}`),
    contentType: attachment.contentType || "application/octet-stream",
  });
}
