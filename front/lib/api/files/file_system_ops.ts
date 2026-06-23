/**
 * High-level file system operations that combine DustFileSystem (GCS) with
 * FileResource (DB) sync. Used by the unified `/files/path/` endpoint and the
 * files MCP tools.
 */

import type { DustFileSystem } from "@app/lib/api/file_system";
import {
  DustFileSystemError,
  type FileSystemEntry,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system/types";
import { decodeBuffer } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import {
  contentTypeFromFileName,
  isSupportedFileContentType,
  isSupportedImageContentType,
  resolveFileContentType,
  stripMimeParameters,
} from "@app/types/files";
import { DocumentRenderer } from "@app/types/shared/document_renderer";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import path from "path";
import type { Readable } from "stream";

// ---------------------------------------------------------------------------
// Thumbnail streaming
// ---------------------------------------------------------------------------

export type ThumbnailStreamResult = {
  stream: Readable;
  contentType: string;
};

export type ThumbnailErrorCode = "not_found" | "not_image" | "internal";

export class ThumbnailError extends Error {
  constructor(
    readonly code: ThumbnailErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ThumbnailError";
  }
}

/**
 * Return a read stream for the thumbnail of an image at `canonicalPath`.
 *
 * If a FileResource record is linked to the path, its best available version
 * (processed/resized at upload time) is streamed. Otherwise falls back to the
 * raw GCS object.
 *
 * Returns `Err("not_image")` for non-image files, `Err("not_found")` when the
 * file does not exist, `Err("internal")` on unexpected errors.
 */
export async function streamThumbnail(
  auth: Authenticator,
  dustFs: DustFileSystem,
  canonicalPath: string
): Promise<Result<ThumbnailStreamResult, ThumbnailError>> {
  const statResult = await dustFs.stat(canonicalPath);
  if (statResult.isErr()) {
    return new Err(new ThumbnailError("internal", statResult.error.message));
  }

  if (!statResult.value) {
    return new Err(
      new ThumbnailError("not_found", `File not found: \`${canonicalPath}\`.`)
    );
  }

  const { contentType } = statResult.value;
  if (!isSupportedImageContentType(contentType)) {
    return new Err(
      new ThumbnailError(
        "not_image",
        "Thumbnail is only supported for image files."
      )
    );
  }

  // Attempt to find a FileResource so we can serve its processed (resized) version.
  const gcsPath = dustFs.toMountFilePath(canonicalPath);
  if (gcsPath) {
    const candidates = [gcsPath];
    // Also probe the legacy projects/ mirror path for pod files written before
    // the pods/ migration.
    const legacyPath = gcsPath.replace(/\/pods\//, "/projects/");
    if (legacyPath !== gcsPath) {
      candidates.push(legacyPath);
    }

    const [fileResource] = await FileResource.fetchByMountFilePaths(
      auth,
      candidates
    );

    if (fileResource) {
      if (!isSupportedImageContentType(fileResource.contentType)) {
        return new Err(
          new ThumbnailError(
            "not_image",
            "Thumbnail is only supported for image files."
          )
        );
      }

      return new Ok({
        stream: fileResource.getContentReadStream(auth),
        contentType: fileResource.contentType,
      });
    }
  }

  // No FileResource found, stream raw GCS object (sandbox-generated image).
  const readResult = await dustFs.read(canonicalPath);
  if (readResult.isErr()) {
    return new Err(new ThumbnailError("internal", readResult.error.message));
  }
  if (!readResult.value) {
    return new Err(
      new ThumbnailError("not_found", `File not found: \`${canonicalPath}\`.`)
    );
  }

  return new Ok({ stream: readResult.value, contentType });
}

// ---------------------------------------------------------------------------
// List with FileResource enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a list of file entries with their linked FileResource sId (fileId).
 * A single batch DB query covers all entries; pod files probe the legacy projects/ path too.
 *
 * Intended for endpoints that expose file listings to the client (conversation files,
 * pod files) where the fileId is needed to open frames.
 */
export async function enrichListWithFileResourceIds(
  auth: Authenticator,
  dustFs: DustFileSystem,
  entries: FileSystemEntry[]
): Promise<FileSystemEntry[]> {
  const fileEntries = entries.filter((e) => !e.isDirectory);
  if (fileEntries.length === 0) {
    return entries;
  }

  // Collect all GCS paths to probe, including legacy projects/ variants for pod files.
  const mountPaths: string[] = [];
  for (const entry of fileEntries) {
    const gcsPath = dustFs.toMountFilePath(entry.path);
    if (gcsPath) {
      mountPaths.push(gcsPath);
      const legacyPath = gcsPath.replace(/\/pods\//, "/projects/");
      if (legacyPath !== gcsPath) {
        mountPaths.push(legacyPath);
      }
    }
  }

  if (mountPaths.length === 0) {
    return entries;
  }

  const fileResources = await FileResource.fetchByMountFilePaths(
    auth,
    mountPaths
  );

  // Map every known mountFilePath to its FileResource sId.
  const byMountPath = new Map<string, string>();
  for (const fr of fileResources) {
    if (fr.mountFilePath) {
      byMountPath.set(fr.mountFilePath, fr.sId);
    }
  }

  return entries.map((entry) => {
    if (entry.isDirectory) {
      return entry;
    }
    const gcsPath = dustFs.toMountFilePath(entry.path);
    if (!gcsPath) {
      return entry;
    }
    const legacyPath = gcsPath.replace(/\/pods\//, "/projects/");
    const fileId =
      byMountPath.get(gcsPath) ?? byMountPath.get(legacyPath) ?? null;
    return { ...entry, fileId };
  });
}

// ---------------------------------------------------------------------------
// FileResource lookup helpers
// ---------------------------------------------------------------------------

async function fetchLinkedFileResource(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<FileResource | undefined> {
  const gcsPath = dustFs.toMountFilePath(scopedPath);
  if (!gcsPath) {
    return undefined;
  }

  const [linkedFile] = await FileResource.fetchByMountFilePaths(auth, [
    gcsPath,
  ]);

  return linkedFile;
}

// ---------------------------------------------------------------------------
// Move with FileResource sync
// ---------------------------------------------------------------------------

/**
 * Infer the FileUseCase and metadata that should apply to a file at
 * `canonicalPath` after a move/rename.
 *
 * conversation-{cId}/... → "tool_output"  + { conversationId }
 * pod-{pId}/...          → "project_context" + { spaceId }
 */
function inferDestMountInfo(
  canonicalPath: string
): { useCase: FileUseCase; useCaseMetadata: FileUseCaseMetadata } | null {
  if (canonicalPath.startsWith(SCOPED_PREFIX_CONVERSATION)) {
    const rest = canonicalPath.slice(SCOPED_PREFIX_CONVERSATION.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      return null;
    }

    return {
      useCase: "tool_output",
      useCaseMetadata: { conversationId: rest.slice(0, slash) },
    };
  }

  if (canonicalPath.startsWith(SCOPED_PREFIX_POD)) {
    const rest = canonicalPath.slice(SCOPED_PREFIX_POD.length);
    const slash = rest.indexOf("/");
    if (slash < 0) {
      return null;
    }

    return {
      useCase: "project_context",
      useCaseMetadata: { spaceId: rest.slice(0, slash) },
    };
  }

  return null;
}

/**
 * Rename a file at `scopedPath` to `newFileName` (same directory) and sync the
 * linked FileResource record if one exists.
 *
 * Returns the same result shape as `DustFileSystem.rename()`.
 */
export async function renameCanonicalFile(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  newFileName: string
): Promise<
  Result<{ dest: string; sourceDeletionFailed: boolean }, DustFileSystemError>
> {
  const linkedFileResource = await fetchLinkedFileResource(
    auth,
    dustFs,
    scopedPath
  );

  const renameResult = await dustFs.rename(scopedPath, newFileName);
  if (renameResult.isErr()) {
    return renameResult;
  }

  if (linkedFileResource) {
    const { dest } = renameResult.value;
    const destGcsPath = dustFs.toMountFilePath(dest);
    const destInfo = inferDestMountInfo(dest);

    if (destGcsPath && destInfo) {
      await linkedFileResource.updateMount({
        destFileName: newFileName,
        destMountFilePath: destGcsPath,
        destUseCase: destInfo.useCase,
        destUseCaseMetadata: destInfo.useCaseMetadata,
      });
    }
  }

  return renameResult;
}

/**
 * Move a file from `src` to `dest` and sync the linked FileResource record
 * (if any) to reflect the new path, filename, use-case, and use-case metadata.
 *
 * Returns the same result shape as `DustFileSystem.move()`.
 */
export async function moveCanonicalFile(
  auth: Authenticator,
  dustFs: DustFileSystem,
  src: string,
  dest: string
): Promise<Result<{ sourceDeletionFailed: boolean }, DustFileSystemError>> {
  // Look up the linked FileResource before the bytes move.
  const linkedFileResource = await fetchLinkedFileResource(auth, dustFs, src);

  const moveResult = await dustFs.move({ src, dest });
  if (moveResult.isErr()) {
    return moveResult;
  }

  // Update the FileResource to point to the new location.
  if (linkedFileResource) {
    const destGcsPath = dustFs.toMountFilePath(dest);
    const destInfo = inferDestMountInfo(dest);

    if (destGcsPath && destInfo) {
      const destFileName = dest.split("/").pop() ?? dest;
      await linkedFileResource.updateMount({
        destFileName,
        destMountFilePath: destGcsPath,
        destUseCase: destInfo.useCase,
        destUseCaseMetadata: destInfo.useCaseMetadata,
      });
    }
  }

  return moveResult;
}

// ---------------------------------------------------------------------------
// Content write
// ---------------------------------------------------------------------------

export const WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES = 512 * 1024;

export type WriteCanonicalFileContentErrorCode =
  | "too_large"
  | "unsupported_content_type";

export class WriteCanonicalFileContentError extends Error {
  constructor(
    readonly code: WriteCanonicalFileContentErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WriteCanonicalFileContentError";
  }
}

function resolvePathWriteContentType(
  scopedPath: string,
  contentTypeFromRequest?: string
): string {
  const fileName = path.posix.basename(scopedPath);
  const requested = contentTypeFromRequest
    ? stripMimeParameters(contentTypeFromRequest)
    : "text/plain";
  const resolved = resolveFileContentType(requested, fileName);
  if (isSupportedFileContentType(resolved)) {
    return resolved;
  }

  return contentTypeFromFileName(fileName) ?? "text/plain";
}

function validatePathWritableContentType(
  contentType: string
): Result<void, WriteCanonicalFileContentError> {
  if (!contentType.startsWith("text/")) {
    return new Err(
      new WriteCanonicalFileContentError(
        "unsupported_content_type",
        "Only text files can be updated through this endpoint."
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Create or replace the text content of a file at `scopedPath`.
 * Only `text/*` content types are supported.
 */
export async function writeCanonicalFileContent(
  _auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string,
  content: Uint8Array,
  contentTypeFromRequest?: string
): Promise<
  Result<
    { created: boolean },
    DustFileSystemError | WriteCanonicalFileContentError
  >
> {
  if (content.byteLength > WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES) {
    return new Err(
      new WriteCanonicalFileContentError(
        "too_large",
        `Content exceeds the ${WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES / 1024} KB limit.`
      )
    );
  }

  const contentBuffer = Buffer.from(decodeBuffer(content), "utf8");

  const statResult = await dustFs.stat(scopedPath);
  if (statResult.isErr()) {
    return statResult;
  }

  const existingStat = statResult.value;
  const exists = existingStat !== null;
  const contentType = exists
    ? stripMimeParameters(existingStat.contentType)
    : resolvePathWriteContentType(scopedPath, contentTypeFromRequest);

  const validationResult = validatePathWritableContentType(contentType);
  if (validationResult.isErr()) {
    return validationResult;
  }

  const writeResult = await dustFs.write(
    scopedPath,
    contentBuffer,
    contentType
  );
  if (writeResult.isErr()) {
    return writeResult;
  }

  return new Ok({ created: !exists });
}

// ---------------------------------------------------------------------------
// Office → PDF conversion
// ---------------------------------------------------------------------------

const OFFICE_PREVIEW_CONTENT_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

async function readableToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

const OFFICE_PDF_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const OFFICE_PDF_CONVERSION_TIMEOUT_MS = 60_000;

export type OfficePdfErrorCode =
  | "not_found"
  | "too_large"
  | "unsupported_type"
  | "conversion_failed"
  | "internal";

export class OfficePdfError extends Error {
  constructor(
    readonly code: OfficePdfErrorCode,
    message: string
  ) {
    super(message);
    this.name = "OfficePdfError";
  }
}

export type OfficePdfResult = {
  pdfBuffer: Buffer;
  pdfFileName: string;
};

/**
 * Read an Office file at `canonicalPath` from GCS and convert it to PDF using
 * Gotenberg's LibreOffice route. `rendererUrl` is the Gotenberg base URL; the
 * caller is responsible for checking it is configured before calling this.
 */
export async function convertCanonicalFileToPdf(
  dustFs: DustFileSystem,
  canonicalPath: string,
  rendererUrl: string
): Promise<Result<OfficePdfResult, OfficePdfError>> {
  const statResult = await dustFs.stat(canonicalPath);
  if (statResult.isErr()) {
    return new Err(new OfficePdfError("internal", statResult.error.message));
  }

  if (!statResult.value) {
    return new Err(
      new OfficePdfError("not_found", `File not found: \`${canonicalPath}\`.`)
    );
  }

  const { contentType, sizeBytes } = statResult.value;

  if (sizeBytes > OFFICE_PDF_MAX_SIZE_BYTES) {
    return new Err(
      new OfficePdfError(
        "too_large",
        `File exceeds the ${OFFICE_PDF_MAX_SIZE_BYTES / 1024 / 1024} MB limit for PDF preview.`
      )
    );
  }

  if (!OFFICE_PREVIEW_CONTENT_TYPES.has(contentType)) {
    return new Err(
      new OfficePdfError(
        "unsupported_type",
        "PDF preview is only supported for Office file types."
      )
    );
  }

  // TODO: Consider streaming the GCS read directly into Gotenberg's multipart body and piping its
  // response back to the client to avoid buffering the full file in memory.
  const readResult = await dustFs.read(canonicalPath);
  if (readResult.isErr()) {
    return new Err(new OfficePdfError("internal", readResult.error.message));
  }

  if (!readResult.value) {
    return new Err(
      new OfficePdfError("not_found", `File not found: \`${canonicalPath}\`.`)
    );
  }

  const fileBuffer = await readableToBuffer(readResult.value);
  const fileName = path.posix.basename(canonicalPath);

  const renderer = new DocumentRenderer(rendererUrl, logger, {
    timeoutMs: OFFICE_PDF_CONVERSION_TIMEOUT_MS,
  });

  const conversionResult = await renderer.convertOfficeToPdf(
    fileBuffer,
    fileName
  );
  if (conversionResult.isErr()) {
    return new Err(
      new OfficePdfError("conversion_failed", conversionResult.error.message)
    );
  }

  return new Ok({
    pdfBuffer: conversionResult.value,
    pdfFileName: fileName.replace(/\.[^.]+$/, ".pdf"),
  });
}

/**
 * Delete a file at `scopedPath` and delete the linked FileResource record when
 * the path corresponds to one. If no FileResource exists (for example a file
 * created directly in the sandbox), falls back to deleting the raw GCS object.
 */
// TODO(FILE_SYSTEM): Remove once no more dependencies on FileResource.
export async function deleteCanonicalFile(
  auth: Authenticator,
  dustFs: DustFileSystem,
  scopedPath: string
): Promise<Result<void, DustFileSystemError>> {
  const linkedFileResource = await fetchLinkedFileResource(
    auth,
    dustFs,
    scopedPath
  );
  if (!linkedFileResource) {
    return dustFs.delete(scopedPath);
  }

  const deleteResult = await linkedFileResource.delete(auth);
  if (deleteResult.isErr()) {
    return new Err(
      new DustFileSystemError("internal", deleteResult.error.message)
    );
  }

  return new Ok(undefined);
}
