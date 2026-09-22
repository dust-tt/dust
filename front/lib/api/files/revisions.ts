import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  isGCSNotFoundError,
  isGCSPreconditionFailedError,
} from "@app/lib/file_storage/types";
import { DustFileSystemError } from "@app/types/file_system";
import { stripMimeParameters } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { FileMetadata } from "@google-cloud/storage";
import type { Readable } from "stream";

const parseRevision = (
  generation: string | number | undefined
): Result<string, DustFileSystemError> => {
  const revision = String(generation);
  if (!/^[1-9][0-9]*$/.test(revision)) {
    return new Err(
      new DustFileSystemError(
        "internal",
        "File storage did not return a revision."
      )
    );
  }
  return new Ok(revision);
};

/**
 * @cc [owner:flvndvd,label:security;concurrency] file-revision-read
 * Callers MUST check read access and supply the normalized storage path.
 * Returned bytes MUST belong to the returned revision, even if another writer saves.
 */
export const readFileWithRevision = async (
  mountFilePath: string
): Promise<
  Result<
    { stream: Readable; contentType: string; revision: string } | null,
    DustFileSystemError
  >
> => {
  const file = getPrivateUploadBucket().file(mountFilePath);
  let metadata: FileMetadata;
  try {
    [metadata] = await file.getMetadata();
  } catch (error) {
    return isGCSNotFoundError(error)
      ? new Ok(null)
      : new Err(
          new DustFileSystemError("internal", normalizeError(error).message)
        );
  }

  const revision = parseRevision(metadata.generation);
  if (revision.isErr()) {
    return revision;
  }
  const stream = file.bucket
    .file(file.name, { generation: revision.value })
    .createReadStream();

  return new Ok({
    stream,
    revision: revision.value,
    contentType: stripMimeParameters(
      metadata.contentType ?? "application/octet-stream"
    ),
  });
};

/**
 * @cc [owner:flvndvd,label:security;concurrency] file-revision-write
 * Callers MUST check write access and supply the normalized storage path.
 * Saves with a revision MUST atomically match it or leave the file unchanged.
 * Success MUST return this write's revision, never a later writer's revision.
 */
export const writeFileWithRevision = async (
  mountFilePath: string,
  {
    content,
    contentType,
    revision,
  }: { content: Buffer; contentType: string; revision?: string }
): Promise<Result<string, DustFileSystemError | "conflict">> => {
  const file = getPrivateUploadBucket().file(mountFilePath);
  try {
    await file.save(content, {
      contentType,
      resumable: false,
      ...(revision !== undefined && {
        preconditionOpts: { ifGenerationMatch: revision },
      }),
    });
  } catch (error) {
    return isGCSPreconditionFailedError(error)
      ? new Err("conflict")
      : new Err(
          new DustFileSystemError("internal", normalizeError(error).message)
        );
  }

  // The upload response identifies our write even if another writer has already saved.
  return parseRevision(file.metadata.generation);
};
