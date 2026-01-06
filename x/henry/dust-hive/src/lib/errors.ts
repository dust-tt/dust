// Shared error and validation utilities

import type { ZodType } from "zod";

/**
 * Type guard to check if an error is a Node.js ErrnoException
 * (i.e., has a `code` property like 'ENOENT', 'EEXIST', etc.)
 */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

/**
 * Create a type guard function from a Zod schema.
 * This eliminates the boilerplate of writing `schema.safeParse(data).success`.
 */
export function createTypeGuard<T>(schema: ZodType<T>): (data: unknown) => data is T {
  return (data: unknown): data is T => schema.safeParse(data).success;
}
