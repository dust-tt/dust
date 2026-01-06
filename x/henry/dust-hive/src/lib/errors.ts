// Shared error utilities

/**
 * Type guard to check if an error is a Node.js ErrnoException
 * (i.e., has a `code` property like 'ENOENT', 'EEXIST', etc.)
 */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
