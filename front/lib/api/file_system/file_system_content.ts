import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import {
  FILE_SYSTEM_CONTENT_MAX_BYTES,
  FileSystemOperationError,
} from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { fileSystemBlobPath } from "@app/lib/file_storage/file_system_blobs";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import { fileSync } from "tmp";

async function fetchFile(
  auth: Authenticator,
  scope: FileSystemScope,
  nodeId: number
): Promise<Result<FileSystemNodeResource, FileSystemOperationError>> {
  const node = await FileSystemNodeResource.fetchById(auth, scope, nodeId);
  if (!node) {
    return new Err(
      new FileSystemOperationError("not_found", "The file was not found.")
    );
  }
  if (node.kind !== "file") {
    return new Err(
      new FileSystemOperationError(
        "invalid_operation",
        "A directory has no file content."
      )
    );
  }
  return new Ok(node);
}

type StagedContent =
  | { kind: "buffer"; bytes: Buffer; size: number; cleanup: () => void }
  | { kind: "file"; path: string; size: number; cleanup: () => void };

async function stageContent(
  content: Buffer | string | Readable
): Promise<Result<StagedContent, FileSystemOperationError>> {
  if (isString(content)) {
    const bytes = Buffer.from(content);
    return new Ok({ kind: "buffer", bytes, size: bytes.length, cleanup() {} });
  }
  if (Buffer.isBuffer(content)) {
    return new Ok({
      kind: "buffer",
      bytes: content,
      size: content.length,
      cleanup() {},
    });
  }

  // Front needs the size before it signs the immutable upload. Streams first
  // go to a local file so large writes do not stay in the Node.js heap.
  const temporaryFile = fileSync({ discardDescriptor: true });
  let size = 0;
  try {
    await pipeline(
      content,
      async function* enforceSize(source) {
        for await (const chunk of source) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          if (size > FILE_SYSTEM_CONTENT_MAX_BYTES) {
            throw new FileSystemOperationError(
              "invalid_operation",
              `Content cannot exceed ${FILE_SYSTEM_CONTENT_MAX_BYTES} bytes.`
            );
          }
          yield bytes;
        }
      },
      createWriteStream(temporaryFile.name, { flags: "w" })
    );
  } catch (error) {
    temporaryFile.removeCallback();
    if (error instanceof FileSystemOperationError) {
      return new Err(error);
    }
    throw error;
  }
  return new Ok({
    kind: "file",
    path: temporaryFile.name,
    size,
    cleanup: temporaryFile.removeCallback,
  });
}

/** Reads one node directly from its immutable GCS blob. */
export async function getFileSystemReadStream(
  auth: Authenticator,
  scope: FileSystemScope,
  nodeId: number
): Promise<Result<Readable, FileSystemOperationError>> {
  const nodeRes = await fetchFile(auth, scope, nodeId);
  if (nodeRes.isErr()) {
    return nodeRes;
  }
  const node = nodeRes.value;
  if (node.blobId === null) {
    return new Ok(Readable.from([]));
  }
  return new Ok(
    getPrivateUploadBucket()
      .file(fileSystemBlobPath(auth, node.id, node.blobId))
      .createReadStream()
  );
}

/** Writes application bytes through the same content checks used by FUSE. */
export async function writeFileSystemContent(
  auth: Authenticator,
  scope: FileSystemScope,
  request: {
    nodeId: number;
    expectedBlobId: string | null;
    content: Buffer | string | Readable;
    contentType: string;
  }
): Promise<Result<number, FileSystemOperationError>> {
  const nodeRes = await fetchFile(auth, scope, request.nodeId);
  if (nodeRes.isErr()) {
    return nodeRes;
  }
  const stagedRes = await stageContent(request.content);
  if (stagedRes.isErr()) {
    return stagedRes;
  }
  const staged = stagedRes.value;
  try {
    const preparedRes = await nodeRes.value.prepareContentUpload(auth, scope, {
      expectedBlobId: request.expectedBlobId,
      expectedSizeBytes: staged.size,
      contentType: request.contentType,
    });
    if (preparedRes.isErr()) {
      return preparedRes;
    }
    const upload = preparedRes.value;
    const file = getPrivateUploadBucket().file(
      fileSystemBlobPath(auth, request.nodeId, upload.blobId)
    );

    if (staged.kind === "buffer") {
      await file.save(staged.bytes, {
        contentType: upload.contentType,
        metadata: { contentEncoding: "identity" },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } else {
      await pipeline(
        createReadStream(staged.path),
        file.createWriteStream({
          resumable: true,
          metadata: {
            contentType: upload.contentType,
            contentEncoding: "identity",
          },
          preconditionOpts: { ifGenerationMatch: 0 },
        })
      );
    }

    const committedRes = await nodeRes.value.commitContentUpload(auth, scope, {
      expectedBlobId: request.expectedBlobId,
      blobId: upload.blobId,
      expectedSizeBytes: staged.size,
      contentType: upload.contentType,
    });
    return committedRes.isErr() ? committedRes : new Ok(committedRes.value.id);
  } finally {
    staged.cleanup();
  }
}

export async function getFileSystemDownloadUrl(
  auth: Authenticator,
  scope: FileSystemScope,
  nodeId: number,
  expirationDelayMs: number,
  fileName?: string
): Promise<Result<string, FileSystemOperationError>> {
  const nodeRes = await fetchFile(auth, scope, nodeId);
  if (nodeRes.isErr()) {
    return nodeRes;
  }
  const node = nodeRes.value;
  if (node.blobId === null) {
    return new Err(
      new FileSystemOperationError(
        "not_found",
        "The file does not have content yet."
      )
    );
  }
  return new Ok(
    await getPrivateUploadBucket().getSignedUrl(
      fileSystemBlobPath(auth, node.id, node.blobId),
      { expirationDelayMs, promptSaveAs: fileName }
    )
  );
}
