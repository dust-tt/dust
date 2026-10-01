import type {
  ResponseFunctionWebSearch,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { z } from "zod";

// The Responses input is rebuilt in full on every request, so a `web_search_call`
// item the model produced has to be replayed: the API rejects a reasoning item
// whose following item was dropped, and a search call routinely sits between a
// reasoning item and the message. We persist it opaquely in the generic content
// layer (as provider passthrough) and parse it back here.
//
// Following the tool-search convention in this directory: validate only the
// stable fields Dust relies on, and `.passthrough()` the rest so new OpenAI
// replay fields need no plumbing through shared Dust types.

// OpenAI exposes no runtime schema for the action union. Validate the stable
// discriminator so Zod can return the SDK type without duplicating the union.
const webSearchActionSchema = z.custom<ResponseFunctionWebSearch["action"]>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
);

const webSearchCallSchema: z.ZodType<ResponseFunctionWebSearch> = z
  .object({
    type: z.literal("web_search_call"),
    id: z.string(),
    action: webSearchActionSchema,
    status: z.enum(["in_progress", "searching", "completed", "failed"]),
  })
  .passthrough();

// Returns null silently when the item is not a web-search call:
// `parseOpenAIServerToolItem` tries every server-tool family and owns the
// "unparseable" warning.
export function parseOpenAIWebSearchItem(
  block: unknown
): ResponseInputItem | null {
  const result = webSearchCallSchema.safeParse(block);
  return result.success ? result.data : null;
}
