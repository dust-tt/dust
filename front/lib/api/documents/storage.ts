import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  isGCSNotFoundError,
  isGCSPreconditionFailedError,
} from "@app/lib/file_storage/types";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { NativeDocument } from "@app/types/documents";
import { DOCUMENT_MAX_BYTES, documentContentType } from "@app/types/documents";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  decodeNativeDocumentSource,
  parseNativeDocument,
  validateNativeDocument,
} from "./content";

export class DocumentError extends Error {
  constructor(
    readonly code: "not_found" | "forbidden" | "conflict" | "invalid_document",
    message: string
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

/**
 * @cc [owner:flvndvd,label:concurrency;product] native-document-revisions
 * A loaded revision MUST identify exactly the returned bytes.
 * Callers MUST check filesystem read access before invoking this operation.
 */
export const readDocumentFile = async (
  file: Pick<FileResource, "mountFilePath">
): Promise<
  Result<{ document: NativeDocument; revision: string }, DocumentError>
> => {
  if (!file.mountFilePath) {
    return new Err(new DocumentError("not_found", "Document file not found."));
  }

  const result = await readRevisionedFile(file.mountFilePath);
  if (result.isErr()) {
    return result;
  }
  const { source, revision } = result.value;

  const validated = validateNativeDocument(source);
  return validated.isOk()
    ? new Ok({ document: validated.value, revision })
    : new Err(new DocumentError("invalid_document", validated.error.message));
};

/**
 * @cc [owner:flvndvd,label:concurrency;product] native-document-conditional-saves
 * Saves MUST atomically match the supplied revision at the live file path.
 * A stale save MUST leave the current file unchanged. Success MUST return this write's revision.
 * Callers MUST check filesystem write access before invoking this operation.
 */
export const writeDocumentContent = async (
  mountFilePath: string,
  { document, revision }: { document: NativeDocument; revision: string }
): Promise<Result<{ revision: string }, DocumentError>> => {
  const source = JSON.stringify(document);
  if (
    Buffer.byteLength(source) > DOCUMENT_MAX_BYTES ||
    !parseNativeDocument(source)
  ) {
    return new Err(
      new DocumentError(
        "invalid_document",
        "The document is too large or contains unsupported content."
      )
    );
  }
  return writeRevisionedFile(mountFilePath, {
    source,
    revision,
    contentType: documentContentType,
  });
};

/**
 * @cc [owner:flvndvd,label:security;concurrency] revisioned-file-read
 * Callers MUST check filesystem read access. Reads MUST return bounded UTF-8 bytes
 * from exactly the returned storage revision, including when another writer saves.
 */
const readRevisionedFile = async (
  mountFilePath: string
): Promise<Result<{ source: string; revision: string }, DocumentError>> => {
  const object = getPrivateUploadBucket().file(mountFilePath);
  let source: Buffer;
  let revision: string;
  try {
    const [metadata] = await object.getMetadata();
    revision = String(metadata.generation);
    if (!/^\d+$/.test(revision) || Number(metadata.size) > DOCUMENT_MAX_BYTES) {
      return new Err(
        new DocumentError("invalid_document", "This document cannot be opened.")
      );
    }
    const stream = object.bucket
      .file(object.name, { generation: revision })
      .createReadStream();
    const chunks: Buffer[] = [];
    let sizeBytes = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += bytes.byteLength;
      if (sizeBytes > DOCUMENT_MAX_BYTES) {
        stream.destroy();
        return new Err(
          new DocumentError(
            "invalid_document",
            "The document exceeds the 512 KiB size limit."
          )
        );
      }
      chunks.push(bytes);
    }
    source = Buffer.concat(chunks);
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Err(
        new DocumentError(
          "not_found",
          "Document file not found. Try reopening it."
        )
      );
    }
    throw error;
  }

  const decoded = decodeNativeDocumentSource(source);
  return decoded.isErr()
    ? new Err(new DocumentError("invalid_document", decoded.error.message))
    : new Ok({ source: decoded.value, revision });
};

/**
 * @cc [owner:flvndvd,label:security;concurrency] revisioned-file-write
 * Callers MUST check write access and validate the complete source. Saves MUST match
 * the supplied revision atomically and return this write's revision, never a later one.
 */
const writeRevisionedFile = async (
  mountFilePath: string,
  {
    source,
    revision,
    contentType,
  }: { source: string; revision: string; contentType: string }
): Promise<Result<{ revision: string }, DocumentError>> => {
  const object = getPrivateUploadBucket().file(mountFilePath);
  try {
    await object.save(source, {
      contentType,
      resumable: false,
      preconditionOpts: { ifGenerationMatch: revision },
    });
  } catch (error) {
    if (isGCSPreconditionFailedError(error)) {
      return new Err(
        new DocumentError(
          "conflict",
          "This document changed elsewhere. Your draft is still here. Copy your changes before reopening the latest version."
        )
      );
    }
    throw error;
  }

  // The upload response carries our generation, even if another writer has already saved.
  const savedRevision = String(object.metadata.generation);
  if (!/^\d+$/.test(savedRevision)) {
    throw new Error("Document upload did not return a revision.");
  }
  return new Ok({ revision: savedRevision });
};
