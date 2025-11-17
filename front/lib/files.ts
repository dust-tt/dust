import _ from "lodash";

// We use this to detect if a Interactive Content file uses conversation files.
// In which case, we don't want to display it publicly. Our proxy here is to look for usage of the
// `useFile` hook.
export function isUsingConversationFiles(content: string): boolean {
  // Simple regex to detect useFile hook usage.
  const useFileRegex = /useFile\s*\(/;
  return useFileRegex.test(content);
}

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
  const words = _.chain(nameWithoutExt)
    .split(/[_-]/) // Split on underscores and hyphens.
    .flatMap((word) => _.words(word)) // Split camelCase words.
    .compact() // Remove empty strings.
    .map((word) => _.capitalize(word)) // Capitalize each word.
    .join(" ")
    .value();

  return words;
}
