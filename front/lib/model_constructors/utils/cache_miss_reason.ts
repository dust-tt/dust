import { z } from "zod";

// Prompt-cache miss diagnostics surfaced by providers that support them
// (currently Claude API only). Attached to the `response_id` event metadata.
// https://platform.claude.com/docs/en/build-with-claude/cache-diagnostics
export const CacheMissReasonSchema = z.object({
  type: z.string(),
  // Only the `*_changed` reasons carry the lost-cache magnitude.
  cacheMissedInputTokens: z.number().optional(),
});

export type CacheMissReason = z.infer<typeof CacheMissReasonSchema>;

// Narrow an unknown value (e.g. read back from the metadata content bag) to a
// CacheMissReason.
export function isCacheMissReason(value: unknown): value is CacheMissReason {
  return CacheMissReasonSchema.safeParse(value).success;
}
