import { z } from "zod";

// User-facing limit, counted as visible characters (markdown formatting syntax
// does not count against it).
export const MAX_USER_MEMORY_CHARS = 8_000;

// Server-side cap on the raw stored markdown. Formatting syntax (**bold**,
// headings, ...) inflates the raw length beyond the visible character count, so
// this ceiling is slightly higher to avoid rejecting formatted memories that
// are under the visible limit.
export const MAX_USER_MEMORY_CONTENT_LENGTH = 2 * MAX_USER_MEMORY_CHARS;

export const GetUserMemoryResponseBodySchema = z.object({
  content: z.string(),
  enabled: z.boolean(),
});
export type GetUserMemoryResponseBody = z.infer<
  typeof GetUserMemoryResponseBodySchema
>;

export const PatchUserMemoryResponseBodySchema = z.object({
  content: z.string(),
  enabled: z.boolean(),
});
export type PatchUserMemoryResponseBody = z.infer<
  typeof PatchUserMemoryResponseBodySchema
>;
