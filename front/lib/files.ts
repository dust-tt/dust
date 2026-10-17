import type { AllSupportedFileContentType } from "@app/types/files";

import capitalize from "lodash/capitalize";
import words from "lodash/words";

export const FILE_ID_PATTERN = "fil_[A-Za-z0-9]{10,}";
export const FILE_ID_REGEX = new RegExp(`\\b${FILE_ID_PATTERN}\\b`, "g");
const EXACT_FILE_ID_REGEX = new RegExp(`^${FILE_ID_PATTERN}$`);

export function isFileId(value: string): boolean {
  return EXACT_FILE_ID_REGEX.test(value);
}
const PASTED_FILE_CONTENT_TYPE =
  "text/vnd.dust.attachment.pasted" satisfies AllSupportedFileContentType;

export const isPastedFile = (contentType: string | undefined): boolean => {
  return contentType === PASTED_FILE_CONTENT_TYPE;
};

/**
 * Converts a filename to a human-friendly format suitable for display.
 *
 * Examples:
 * - "testFile.tsx" -> "Test File"
 * - "my_document.pdf" -> "My Document"
 * - "user-profile-settings.js" -> "User Profile Settings"
 * - "API_DOCUMENTATION.md" -> "API Documentation"
 */
export function formatFilenameForDisplay(filename: string): string {
  // Remove file extension.
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

  // Split on camelCase, underscores, and hyphens, then join with spaces.
  return nameWithoutExt
    .split(/[_-]/) // Split on underscores and hyphens.
    .flatMap((word) => words(word)) // Split camelCase words.
    .filter((word) => word.length > 0) // Remove empty strings.
    .map((word) => capitalize(word)) // Capitalize each word.
    .join(" ");
}
