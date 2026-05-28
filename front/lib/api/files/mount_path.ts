// Pure path helpers for sandbox mount paths (gcsfuse mounting).
//
// Two scoped mounts are supported:
//   - "conversation": files scoped to a single conversation, mounted at /files/conversation
//   - "pod":          files scoped to a Pod (project space), mounted at /files/pod when the
//                     conversation belongs to a Pod. Persistent across conversations within
//                     the same Pod.

import type { FileResource } from "@app/lib/resources/file_resource";
import type { AllSupportedFileContentType } from "@app/types/files";
import { extensionsForContentType } from "@app/types/files";
import { Err, Ok, type Result } from "@app/types/shared/result";
import path from "path";
import { z } from "zod";

export function getBaseMountPathForWorkspace({
  workspaceId,
}: {
  workspaceId: string;
}): string {
  return `w/${workspaceId}/`;
}

export function getConversationFilesBasePath({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `${getBaseMountPathForWorkspace({ workspaceId })}conversations/${conversationId}/files/`;
}

export const TOOL_OUTPUTS_FOLDER_NAME = ".tool_outputs";

export function getConversationToolOutputsBasePath({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `${getConversationFilesBasePath({ workspaceId, conversationId })}${TOOL_OUTPUTS_FOLDER_NAME}/`;
}

export function getConversationFilePath({
  workspaceId,
  conversationId,
  fileName,
}: {
  workspaceId: string;
  conversationId: string;
  fileName: string;
}): string {
  return `${getConversationFilesBasePath({ workspaceId, conversationId })}${fileName}`;
}

export function getProjectFilesBasePath({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}): string {
  return `${getBaseMountPathForWorkspace({ workspaceId })}projects/${projectId}/files/`;
}

export function getPodFilesBasePath({
  workspaceId,
  podId,
}: {
  workspaceId: string;
  podId: string;
}): string {
  return `${getBaseMountPathForWorkspace({ workspaceId })}pods/${podId}/files/`;
}

/**
 * Convert a project mount file path (`w/{wId}/projects/{pId}/files/...`) to its pods/ counterpart
 * (`w/{wId}/pods/{pId}/files/...`). Returns `null` if the input is not a project mount path.
 */
export function toPodMountFilePath(
  projectMountFilePath: string
): string | null {
  const match = projectMountFilePath.match(/^(w\/[^/]+\/)projects\/(.+)$/);
  if (!match) {
    return null;
  }
  return `${match[1]}pods/${match[2]}`;
}

/**
 * Convert a pod mount file path (`w/{wId}/pods/{pId}/files/...`) to its projects/ counterpart
 * (`w/{wId}/projects/{pId}/files/...`). Returns `null` if the input is not a pod mount path.
 */
export function toProjectMountFilePath(
  podMountFilePath: string
): string | null {
  const match = podMountFilePath.match(/^(w\/[^/]+\/)pods\/(.+)$/);
  if (!match) {
    return null;
  }
  return `${match[1]}projects/${match[2]}`;
}

/**
 * Given a mount file path like "w/.../files/report.pdf",
 * returns "w/.../files/report.processed.pdf".
 * For files without extension: "w/.../files/Makefile" -> "w/.../files/Makefile.processed".
 *
 * When processedContentType is provided and differs from the original extension, the extension is
 * swapped to match the processed content type:
 *   "report.pdf" + "text/plain" -> "report.processed.txt"
 */
export function makeProcessedMountFileName({
  mountFilePath,
  processedContentType,
}: {
  mountFilePath: string;
  processedContentType?: AllSupportedFileContentType;
}): string {
  const lastSlash = mountFilePath.lastIndexOf("/");
  const dirPart = mountFilePath.substring(0, lastSlash + 1);
  const fileName = mountFilePath.substring(lastSlash + 1);

  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${dirPart}${fileName}.processed`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = processedContentType
    ? (extensionsForContentType(processedContentType)[0] ??
      fileName.substring(lastDot))
    : fileName.substring(lastDot);

  return `${dirPart}${basename}.processed${ext}`;
}

/**
 * Inverse of `makeProcessedMountFileName`: given a file name (no directory prefix), returns the
 * original source's base name when the input is a processed sibling, or `{ isProcessed: false }`
 * otherwise.
 *
 * Recognized shapes:
 *   "report.processed.txt"    -> { isProcessed: true, sourceBaseName: "report" }
 *   "photo.processed.jpg"     -> { isProcessed: true, sourceBaseName: "photo" }
 *   "Makefile.processed"      -> { isProcessed: true, sourceBaseName: "Makefile" }
 *
 * Anything else (including user-named files that merely contain ".processed." somewhere) returns
 * `{ isProcessed: false }`. The original extension is not recoverable from the processed name alone
 * (the processed content type may differ). Callers that need the full source path should match by
 * `sourceBaseName` against the listing.
 */
export function parseProcessedFilename(
  fileName: string
): { isProcessed: true; sourceBaseName: string } | { isProcessed: false } {
  const PROCESSED = ".processed";

  // Extension-less original: "<name>.processed".
  if (fileName.endsWith(PROCESSED)) {
    const sourceBaseName = fileName.slice(0, -PROCESSED.length);
    if (sourceBaseName.length === 0) {
      return { isProcessed: false };
    }

    return { isProcessed: true, sourceBaseName };
  }

  // Regular case: "<name>.processed.<ext>".
  const marker = `${PROCESSED}.`;
  const idx = fileName.lastIndexOf(marker);
  if (idx <= 0) {
    return { isProcessed: false };
  }

  const after = fileName.slice(idx + marker.length);
  // The processed extension is always a single segment (no nested dots).
  if (after.length === 0 || after.includes(".")) {
    return { isProcessed: false };
  }

  return { isProcessed: true, sourceBaseName: fileName.slice(0, idx) };
}

export const scopedFilePathPrefixSchema = z.enum(["conversation", "pod"]);
export type ScopedFilePathPrefix = z.infer<typeof scopedFilePathPrefixSchema>;

export type ScopedFilePath = {
  prefix: ScopedFilePathPrefix;
  rel: string;
};

/**
 * Parse a scoped file path like "conversation/chart.png" or "pod/report.pdf".
 * Returns null if the path is missing a valid scope prefix.
 */
export function parseScopedFilePath(filePath: string): ScopedFilePath | null {
  const slashIdx = filePath.indexOf("/");
  if (slashIdx <= 0) {
    return null;
  }
  const prefixResult = scopedFilePathPrefixSchema.safeParse(
    filePath.slice(0, slashIdx)
  );
  if (!prefixResult.success) {
    return null;
  }
  return { prefix: prefixResult.data, rel: filePath.slice(slashIdx + 1) };
}

export class ResolveScopedMountFilePathError extends Error {
  constructor(
    readonly code: "invalid_prefix" | "outside_scope",
    message: string
  ) {
    super(message);
    this.name = "ResolveScopedMountFilePathError";
  }

  static isResolveScopedMountFilePathError(
    error: unknown
  ): error is ResolveScopedMountFilePathError {
    return error instanceof ResolveScopedMountFilePathError;
  }
}

/**
 * Parse a scoped rel path, normalize it under `mountBasePath`, and reject traversal.
 */
export function resolveScopedMountFilePath({
  relPath,
  expectedPrefix,
  mountBasePath,
  outsideScopeMessage = "Access denied: path is outside mount scope.",
}: {
  relPath: string;
  expectedPrefix: ScopedFilePathPrefix;
  mountBasePath: string;
  outsideScopeMessage?: string;
}): Result<
  { normalizedRelative: string; normalizedGcsPath: string },
  ResolveScopedMountFilePathError
> {
  const scopedPath = parseScopedFilePath(relPath);
  if (!scopedPath || scopedPath.prefix !== expectedPrefix) {
    return new Err(
      new ResolveScopedMountFilePathError(
        "invalid_prefix",
        "Path must start with the correct scope prefix."
      )
    );
  }

  const normalizedGcsPath = path.posix.normalize(
    `${mountBasePath}${scopedPath.rel}`
  );
  if (!normalizedGcsPath.startsWith(mountBasePath)) {
    return new Err(
      new ResolveScopedMountFilePathError("outside_scope", outsideScopeMessage)
    );
  }

  return new Ok({
    normalizedRelative: normalizedGcsPath.slice(mountBasePath.length),
    normalizedGcsPath,
  });
}

export type ResolveMountFilePathError = {
  code: "invalid_path" | "outside_scope";
  message: string;
};

export function isResolveMountFilePathError(
  error: unknown
): error is ResolveMountFilePathError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "invalid_path" || error.code === "outside_scope")
  );
}

/**
 * Validate a full GCS mount file path (as stored on `FileResource.mountFilePath`)
 * and ensure it lies under `mountBasePath`.
 */
export function resolveMountFilePath({
  mountFilePath,
  mountBasePath,
  outsideScopeMessage = "Access denied: path is outside mount scope.",
}: {
  mountFilePath: string;
  mountBasePath: string;
  outsideScopeMessage?: string;
}): Result<{ normalizedMountFilePath: string }, ResolveMountFilePathError> {
  const normalizedMountFilePath = path.posix.normalize(
    mountFilePath.trim().replace(/^\/+/, "")
  );
  if (!normalizedMountFilePath.startsWith(mountBasePath)) {
    return new Err({
      code: "outside_scope",
      message: outsideScopeMessage,
    });
  }

  const mountRelative = normalizedMountFilePath.slice(mountBasePath.length);
  const validated = normalizeAndValidateMountRelativeFilePath(mountRelative);
  if (validated.isErr()) {
    return new Err({
      code: "invalid_path",
      message: validated.error.message,
    });
  }

  return new Ok({ normalizedMountFilePath });
}

/**
 * Resolve a move source path: scoped listing path (`project/foo.pdf`),
 * mount-relative path (`foo.pdf`), or full GCS path (`w/...`).
 */
export function resolveMoveSourcePath({
  sourcePath,
  expectedPrefix,
  mountBasePath,
  outsideScopeMessage = "Access denied: path is outside mount scope.",
}: {
  sourcePath: string;
  expectedPrefix: ScopedFilePathPrefix;
  mountBasePath: string;
  outsideScopeMessage?: string;
}): Result<{ normalizedMountFilePath: string }, ResolveMountFilePathError> {
  const trimmed = sourcePath.trim().replace(/^\/+/, "");

  const scoped = parseScopedFilePath(trimmed);
  if (scoped) {
    if (scoped.prefix !== expectedPrefix) {
      return new Err({
        code: "invalid_path",
        message: "Path must start with the correct scope prefix.",
      });
    }

    const relativeRes = normalizeAndValidateMountRelativeFilePath(scoped.rel);
    if (relativeRes.isErr()) {
      return new Err({
        code: "invalid_path",
        message: relativeRes.error.message,
      });
    }

    const normalizedMountFilePath = path.posix.normalize(
      `${mountBasePath}${relativeRes.value}`
    );
    if (!normalizedMountFilePath.startsWith(mountBasePath)) {
      return new Err({
        code: "outside_scope",
        message: outsideScopeMessage,
      });
    }

    return new Ok({ normalizedMountFilePath });
  }

  if (trimmed.startsWith("w/")) {
    return resolveMountFilePath({
      mountFilePath: trimmed,
      mountBasePath,
      outsideScopeMessage,
    });
  }

  return resolveMountFileSourcePath({
    sourcePath: trimmed,
    mountBasePath,
    outsideScopeMessage,
  });
}

/**
 * Resolve a move source path relative to the mount root (no scope prefix).
 * Returns the normalized mount file path or an error if the path is invalid.
 */
export function resolveMountFileSourcePath({
  sourcePath,
  mountBasePath,
  outsideScopeMessage = "Access denied: path is outside mount scope.",
}: {
  sourcePath: string;
  mountBasePath: string;
  outsideScopeMessage?: string;
}): Result<{ normalizedMountFilePath: string }, ResolveMountFilePathError> {
  const trimmed = sourcePath.trim().replace(/^\/+/, "");

  const relativeRes = normalizeAndValidateMountRelativeFilePath(trimmed);
  if (relativeRes.isErr()) {
    return new Err({
      code: "invalid_path",
      message: relativeRes.error.message,
    });
  }

  const normalizedMountFilePath = path.posix.normalize(
    `${mountBasePath}${relativeRes.value}`
  );
  if (!normalizedMountFilePath.startsWith(mountBasePath)) {
    return new Err({
      code: "outside_scope",
      message: outsideScopeMessage,
    });
  }

  return new Ok({ normalizedMountFilePath });
}

/**
 * Disambiguate a filename by inserting the file's sId before the extension.
 * "report.pdf" + "fil_abc" → "report_fil_abc.pdf"
 * "Makefile" + "fil_abc" → "Makefile_fil_abc"
 */
export function disambiguateFileName(file: FileResource): string {
  const { fileName, sId } = file;

  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return `${fileName}_${sId}`;
  }

  const basename = fileName.substring(0, lastDot);
  const ext = fileName.substring(lastDot);
  return `${basename}_${sId}${ext}`;
}

/**
 * Validate a single folder segment name (no path separators).
 */
export function validateMountFolderName(
  folderName: string
): Result<string, Error> {
  const trimmed = folderName.trim();
  if (
    trimmed === "" ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed === "." ||
    trimmed === ".."
  ) {
    return new Err(
      new Error(
        "folderName is required and must be a non-empty string without path separators."
      )
    );
  }

  return new Ok(trimmed);
}

/**
 * Normalize a parent directory path within a mount (no `project/` prefix).
 * Returns an empty string for the mount root.
 */
export function normalizeMountParentRelativePath(
  parentRelativePath: string | undefined
): Result<string, Error> {
  if (parentRelativePath === undefined || parentRelativePath.trim() === "") {
    return new Ok("");
  }

  const normalized = path.posix.normalize(
    parentRelativePath.replace(/^\/+/, "")
  );
  if (normalized === "." || normalized === "") {
    return new Ok("");
  }

  if (
    normalized.startsWith("..") ||
    normalized.split("/").some((part) => part === "..")
  ) {
    return new Err(new Error("parentRelativePath is outside mount scope."));
  }

  return new Ok(normalized);
}

/**
 * Normalize and validate a file path within a mount (no scope prefix).
 */
export function normalizeAndValidateMountRelativeFilePath(
  relativeFilePath: string
): Result<string, Error> {
  const trimmed = relativeFilePath.trim();
  if (trimmed === "") {
    return new Err(new Error("relativeFilePath is required."));
  }

  const normalized = path.posix.normalize(trimmed.replace(/^\/+/, ""));
  if (normalized === "." || normalized === "") {
    return new Err(new Error("Invalid file path."));
  }

  if (
    normalized.startsWith("..") ||
    normalized.split("/").some((part) => part === "..")
  ) {
    return new Err(new Error("relativeFilePath is outside mount scope."));
  }

  const fileName = normalized.split("/").pop();
  if (!fileName) {
    return new Err(new Error("Invalid file path."));
  }

  return new Ok(normalized);
}

export function joinMountRelativePath(
  parentRelativePath: string,
  folderName: string
): string {
  return parentRelativePath
    ? `${parentRelativePath}/${folderName}`
    : folderName;
}
