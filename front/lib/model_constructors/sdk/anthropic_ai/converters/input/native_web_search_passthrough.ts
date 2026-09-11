import type {
  ContentBlockParam,
  MessageParam,
  ServerToolUseBlockParam,
  WebSearchToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { mergeConsecutiveSameRoleMessages } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/message_blocks";
import { ANTHROPIC_WEB_SEARCH_TOOL_NAME } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/native_web_search";
import logger from "@app/logger/logger";
import { z } from "zod";

// Anthropic runs its native web search server-side inside a single assistant
// turn, emitting a `server_tool_use` block and a `web_search_tool_result` block
// interleaved with the thinking blocks. Those must be replayed verbatim on the
// next request or the thinking-block signatures are rejected, and the results
// carry the `encrypted_content` the model needs to keep citing them. We persist
// them opaquely in the generic content layer (as provider passthrough) and parse
// them back here with full typing.
//
// The schemas mirror the Anthropic SDK param shapes so a parsed block is
// directly assignable to BetaContentBlockParam, no cast required. They are kept
// separate from the tool-search schemas rather than merged: the error-code
// vocabularies differ, and the replay rules do too (see below).

const webSearchServerToolUseSchema = z.object({
  type: z.literal("server_tool_use"),
  id: z.string(),
  name: z.literal(ANTHROPIC_WEB_SEARCH_TOOL_NAME),
  input: z.unknown(),
});

const webSearchResultSchema = z.object({
  type: z.literal("web_search_result"),
  url: z.string(),
  title: z.string(),
  // Opaque provider blob. Required on replay for the model to keep citing the
  // result: the underlying page content never reaches us in the clear.
  encrypted_content: z.string(),
  page_age: z.string().nullish(),
});

const webSearchToolResultSchema = z.object({
  type: z.literal("web_search_tool_result"),
  tool_use_id: z.string(),
  content: z.union([
    z.object({
      type: z.literal("web_search_tool_result_error"),
      error_code: z.enum([
        "invalid_tool_input",
        "unavailable",
        "max_uses_exceeded",
        "too_many_requests",
        "query_too_long",
        "request_too_large",
      ]),
    }),
    z.array(webSearchResultSchema),
  ]),
});

export const anthropicWebSearchBlockSchema = z.discriminatedUnion("type", [
  webSearchServerToolUseSchema,
  webSearchToolResultSchema,
]);

export type AnthropicWebSearchBlock = z.infer<
  typeof anthropicWebSearchBlockSchema
>;

// Parses an opaque persisted block back into a typed Anthropic block param.
// Returns null silently when the block is not a web-search block:
// `parseAnthropicServerToolBlock` tries every server-tool family and owns the
// "unparseable" warning.
export function parseAnthropicWebSearchBlock(
  block: unknown
): ServerToolUseBlockParam | WebSearchToolResultBlockParam | null {
  const r = anthropicWebSearchBlockSchema.safeParse(block);
  if (!r.success) {
    return null;
  }

  // Reconstruct the param explicitly so required fields are present, since zod
  // infers `z.unknown()` keys as optional. `caller` is optional on both params
  // and carries no replay meaning, so it is not reconstructed.
  if (r.data.type === "server_tool_use") {
    return {
      type: "server_tool_use",
      id: r.data.id,
      name: r.data.name,
      input: r.data.input,
    };
  }

  const { content } = r.data;
  return {
    type: "web_search_tool_result",
    tool_use_id: r.data.tool_use_id,
    content: Array.isArray(content)
      ? content.map((result) => ({
          type: "web_search_result" as const,
          url: result.url,
          title: result.title,
          encrypted_content: result.encrypted_content,
          ...(result.page_age != null ? { page_age: result.page_age } : {}),
        }))
      : content,
  };
}

// -- Replay sanitation --
//
// Simpler than tool search: a web search always completes inside the turn that
// issued it, so there is no resumable-dangling-search case to preserve. The one
// rule is that without the web search tool in the request — auxiliary calls such
// as title generation, which build their own specifications — no web-search
// block is replayable at all, because the API cannot expand results for a tool
// it was not given.
//
// Returns the input array untouched when nothing needs stripping, so the common
// path is allocation free and byte identical for prompt caching.

function isWebSearchServerToolUseBlock(
  block: ContentBlockParam
): block is ServerToolUseBlockParam {
  return (
    block.type === "server_tool_use" &&
    block.name === ANTHROPIC_WEB_SEARCH_TOOL_NAME
  );
}

function isWebSearchToolResultBlock(
  block: ContentBlockParam
): block is WebSearchToolResultBlockParam {
  return block.type === "web_search_tool_result";
}

export function stripWebSearchBlocks(messages: MessageParam[]): MessageParam[] {
  let strippedCount = 0;
  let droppedMessageCount = 0;

  const sanitized: MessageParam[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") {
      sanitized.push(message);
      continue;
    }

    const content = message.content.filter((block) => {
      const isWebSearchBlock =
        isWebSearchServerToolUseBlock(block) ||
        isWebSearchToolResultBlock(block);
      if (isWebSearchBlock) {
        strippedCount++;
      }

      return !isWebSearchBlock;
    });

    if (content.length === 0) {
      droppedMessageCount++;
      continue;
    }

    sanitized.push(
      content.length === message.content.length
        ? message
        : { ...message, content }
    );
  }

  if (strippedCount === 0) {
    return messages;
  }

  logger.info(
    { strippedCount, droppedMessageCount },
    "[native-web-search] Stripped web search blocks from replay"
  );

  return droppedMessageCount > 0
    ? mergeConsecutiveSameRoleMessages(sanitized)
    : sanitized;
}
