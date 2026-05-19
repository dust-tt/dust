// Pure path helpers for sandbox mount paths (gcsfuse mounting).
//
// Two scoped mounts are supported:
//   - "conversation": files scoped to a single conversation, mounted at /files/conversation
//   - "project":      files scoped to a project (space), mounted at /files/project when the
//                     conversation belongs to a project. Persistent across conversations within
//                     the same project.

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

export const scopedFilePathPrefixSchema = z.enum(["conversation", "project"]);
export type ScopedFilePathPrefix = z.infer<typeof scopedFilePathPrefixSchema>;

export type ScopedFilePath = {
  prefix: ScopedFilePathPrefix;
  rel: string;
};

/**
 * Parse a scoped file path like "conversation/chart.png" or "project/report.pdf".
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

export function joinMountRelativePath(
  parentRelativePath: string,
  folderName: string
): string {
  return parentRelativePath
    ? `${parentRelativePath}/${folderName}`
    : folderName;
}
