import type {
  ServerToolUseBlockParam,
  ToolSearchToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { z } from "zod";

// Anthropic runs tool search server-side inside a single assistant turn, emitting
// `server_tool_use` and `tool_search_tool_result` blocks interleaved with the
// thinking blocks. Those blocks must be replayed verbatim on the next request or
// the thinking-block signatures are rejected. We persist them opaquely in the
// generic content layer (as provider passthrough) and parse them back here with
// full typing.
//
// The schemas mirror the Anthropic SDK param shapes so a parsed block is directly
// assignable to BetaContentBlockParam, no cast required.

const toolReferenceSchema = z.object({
  type: z.literal("tool_reference"),
  tool_name: z.string(),
});

const serverToolUseSchema = z.object({
  type: z.literal("server_tool_use"),
  id: z.string(),
  name: z.enum(["tool_search_tool_bm25", "tool_search_tool_regex"]),
  input: z.unknown(),
});

const toolSearchToolResultSchema = z.object({
  type: z.literal("tool_search_tool_result"),
  tool_use_id: z.string(),
  content: z.union([
    z.object({
      type: z.literal("tool_search_tool_result_error"),
      error_code: z.enum([
        "invalid_tool_input",
        "unavailable",
        "too_many_requests",
        "execution_time_exceeded",
      ]),
      error_message: z.string().nullish(),
    }),
    z.object({
      type: z.literal("tool_search_tool_search_result"),
      tool_references: z.array(toolReferenceSchema),
    }),
  ]),
});

export const anthropicToolSearchBlockSchema = z.discriminatedUnion("type", [
  serverToolUseSchema,
  toolSearchToolResultSchema,
]);

export type AnthropicToolSearchBlock = z.infer<
  typeof anthropicToolSearchBlockSchema
>;

// Parses an opaque persisted block back into a typed Anthropic block param.
// Returns null when the block is not a recognized tool-search block so the
// caller can skip it rather than send a malformed request.
export function parseAnthropicToolSearchBlock(
  block: unknown
): ServerToolUseBlockParam | ToolSearchToolResultBlockParam | null {
  const r = anthropicToolSearchBlockSchema.safeParse(block);
  if (!r.success) {
    return null;
  }
  // Reconstruct the param explicitly so required fields (e.g. `input`) are
  // present, since zod infers `z.unknown()` keys as optional.
  if (r.data.type === "server_tool_use") {
    return {
      type: "server_tool_use",
      id: r.data.id,
      name: r.data.name,
      input: r.data.input,
    };
  }
  return {
    type: "tool_search_tool_result",
    tool_use_id: r.data.tool_use_id,
    content: r.data.content,
  };
}
