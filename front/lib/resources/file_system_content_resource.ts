import { Readable } from "node:stream";

import type { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import {
  FILE_SYSTEM_CONTENT_MAX_BYTES,
  FileSystemOperationError,
} from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";

/**
 * Reads and writes inode content for Front callers. Namespace and content
 * revisions remain owned by FileSystemNodeResource.
 */
export class FileSystemContentResource {
  private static objectPath(
    auth: Authenticator,
    nodeId: number,
    blobId: string
  ): string {
    return `w/${auth.getNonNullableWorkspace().sId}/filesystem/blobs/${nodeId}/${blobId}`;
  }

  private static async fetchFile(
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

  private static async readBytes(
    content: Buffer | string | Readable
  ): Promise<Result<Buffer, FileSystemOperationError>> {
    if (isString(content)) {
      return new Ok(Buffer.from(content));
    }
    if (Buffer.isBuffer(content)) {
      return new Ok(content);
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of content) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > FILE_SYSTEM_CONTENT_MAX_BYTES) {
        return new Err(
          new FileSystemOperationError(
            "invalid_operation",
            `Content cannot exceed ${FILE_SYSTEM_CONTENT_MAX_BYTES} bytes.`
          )
        );
      }
      chunks.push(bytes);
    }
    return new Ok(Buffer.concat(chunks, size));
  }

  /** Read an inode directly from its immutable GCS blob. */
  static async getReadStream(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number
  ): Promise<Result<Readable, FileSystemOperationError>> {
    const nodeRes = await this.fetchFile(auth, scope, nodeId);
    if (nodeRes.isErr()) {
      return nodeRes;
    }
    const node = nodeRes.value;
    if (node.blobId === null) {
      return new Ok(Readable.from([]));
    }
    return new Ok(
      getPrivateUploadBucket()
        .file(this.objectPath(auth, node.id, node.blobId))
        .createReadStream()
    );
  }

  /** Write application-owned bytes through the same content CAS as FUSE. */
  static async writeContent(
    auth: Authenticator,
    scope: FileSystemScope,
    request: {
      nodeId: number;
      expectedBlobId: string | null;
      content: Buffer | string | Readable;
      contentType: string;
    }
  ): Promise<Result<number, FileSystemOperationError>> {
    const nodeRes = await this.fetchFile(auth, scope, request.nodeId);
    if (nodeRes.isErr()) {
      return nodeRes;
    }
    const bytesRes = await this.readBytes(request.content);
    if (bytesRes.isErr()) {
      return bytesRes;
    }
    const bytes = bytesRes.value;
    const preparedRes = await nodeRes.value.prepareContentUpload(auth, scope, {
      expectedBlobId: request.expectedBlobId,
      expectedSizeBytes: bytes.length,
      contentType: request.contentType,
    });
    if (preparedRes.isErr()) {
      return preparedRes;
    }
    const upload = preparedRes.value;

    await getPrivateUploadBucket()
      .file(this.objectPath(auth, request.nodeId, upload.blobId))
      .save(bytes, {
        contentType: upload.contentType,
        metadata: { contentEncoding: "identity" },
        preconditionOpts: { ifGenerationMatch: 0 },
      });

    const committedRes = await nodeRes.value.commitContentUpload(auth, scope, {
      expectedBlobId: request.expectedBlobId,
      blobId: upload.blobId,
      expectedSizeBytes: bytes.length,
      contentType: upload.contentType,
    });
    return committedRes.isErr() ? committedRes : new Ok(committedRes.value.id);
  }

  static async getDownloadUrl(
    auth: Authenticator,
    scope: FileSystemScope,
    nodeId: number,
    expirationDelayMs: number
  ): Promise<Result<string, FileSystemOperationError>> {
    const nodeRes = await this.fetchFile(auth, scope, nodeId);
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
        this.objectPath(auth, node.id, node.blobId),
        { expirationDelayMs }
      )
    );
  }
}
