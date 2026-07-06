import type {
  ContentBlockParam,
  MessageParam,
  ServerToolUseBlockParam,
  ToolSearchToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import logger from "@app/logger/logger";
import { z } from "zod";

const TOOL_SEARCH_SERVER_TOOL_NAMES = [
  "tool_search_tool_bm25",
  "tool_search_tool_regex",
] as const;

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
  name: z.enum(TOOL_SEARCH_SERVER_TOOL_NAMES),
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

function hasBlockType(value: unknown): value is { type: unknown } {
  return typeof value === "object" && value !== null && "type" in value;
}

// Parses an opaque persisted block back into a typed Anthropic block param.
// Returns null when the block is not a recognized tool-search block so the
// caller can skip it rather than send a malformed request.
export function parseAnthropicToolSearchBlock(
  block: unknown
): ServerToolUseBlockParam | ToolSearchToolResultBlockParam | null {
  const r = anthropicToolSearchBlockSchema.safeParse(block);
  if (!r.success) {
    // We only ever store blocks we captured ourselves, so a parse failure means
    // storage drift or a newly enabled server tool the schema does not know.
    // Surface it: dropping the block would re-break interleaved thinking.
    logger.warn(
      { blockType: hasBlockType(block) ? block.type : undefined },
      "[tool-search] Dropping unparseable Anthropic passthrough block"
    );
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

// -- Replay sanitation --
//
// The API constrains how tool search blocks can be replayed, and rejects the whole request with a
// 400 when a constraint is violated:
//
//   - Completed pairs (a server_tool_use with its tool_search_tool_result) must be replayed
//     verbatim, even when the current request no longer carries the tool search server tool. A pair
//     can span two assistant messages: when a pending search is resumed, its result opens the next
//     assistant turn, with the tool_result continuation in between. Both halves must be kept, so
//     pairing is computed across the whole replay, not per message.
//   - A dangling server_tool_use (a search the API never ran, e.g. because the turn ended on a
//     client tool call or was interrupted) is valid only when the request still carries the tool
//     search server tool, it is on the final assistant message, and the continuation is exclusively
//     tool_result blocks. The API then resumes the search.
//   - A tool_search_tool_result without its server_tool_use earlier in the replay is always
//     rejected, so a result whose matching use was stripped (or never persisted) must be stripped
//     with it.
//
// This sanitizer keeps completed pairs in place and strips dangling or unpaired blocks. Completed
// pairs can sit between signed thinking blocks, so removing them changes the latest assistant
// message shape.

function isToolSearchServerToolUseBlock(
  block: ContentBlockParam
): block is ServerToolUseBlockParam {
  return (
    block.type === "server_tool_use" &&
    TOOL_SEARCH_SERVER_TOOL_NAMES.some((name) => name === block.name)
  );
}

function isToolSearchToolResultBlock(
  block: ContentBlockParam
): block is ToolSearchToolResultBlockParam {
  return block.type === "tool_search_tool_result";
}

// Ids of every tool search result across the whole replay. A server_tool_use is dangling only
// when no result matches it anywhere, since a resumed search completes in a later assistant
// message than the one that issued it.
function collectToolSearchResultIds(messages: MessageParam[]): Set<string> {
  const resultIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.content === "string") {
      continue;
    }
    for (const block of message.content) {
      if (isToolSearchToolResultBlock(block)) {
        resultIds.add(block.tool_use_id);
      }
    }
  }

  return resultIds;
}

function isToolResultOnlyUserMessage(message: MessageParam): boolean {
  return (
    message.role === "user" &&
    Array.isArray(message.content) &&
    message.content.length > 0 &&
    message.content.every((block) => block.type === "tool_result")
  );
}

// Index of the final assistant message when its dangling searches are still resumable, meaning
// every message after it carries exclusively tool_result blocks. -1 when there is no such message.
function findResumableAssistantIndex(messages: MessageParam[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "assistant") {
      continue;
    }

    for (let j = i + 1; j < messages.length; j++) {
      if (!isToolResultOnlyUserMessage(messages[j])) {
        return -1;
      }
    }
    return i;
  }

  return -1;
}

function toContentBlocks(
  content: MessageParam["content"]
): ContentBlockParam[] {
  return typeof content === "string"
    ? [{ type: "text", text: content }]
    : content;
}

// Anthropic rejects consecutive same-role messages, so re-merge neighbors after a message was
// dropped entirely. O(n) in messages. Merging a run of same-role messages re-copies the merged
// content at each step, but the input arrives with no same-role neighbors (the renderers already
// merged them), so runs only form around dropped messages and stay short.
function mergeConsecutiveSameRoleMessages(
  messages: MessageParam[]
): MessageParam[] {
  const merged: MessageParam[] = [];
  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      merged[merged.length - 1] = {
        ...previous,
        content: [
          ...toContentBlocks(previous.content),
          ...toContentBlocks(message.content),
        ],
      };
    } else {
      merged.push(message);
    }
  }

  return merged;
}

interface StripUnreplayableToolSearchBlocksOptions {
  // Whether the request being built carries the tool search server tool, allowing dangling final
  // assistant searches to resume.
  toolSearchInRequest: boolean;
}

// Strips the tool search blocks the API would reject, per the rules above.
// Returns the input array untouched when nothing needs stripping, so the common path is allocation
// free and byte identical for prompt caching.
export function stripUnreplayableToolSearchBlocks(
  messages: MessageParam[],
  { toolSearchInRequest }: StripUnreplayableToolSearchBlocksOptions
): MessageParam[] {
  const resumableAssistantIndex = findResumableAssistantIndex(messages);
  const resultIds = collectToolSearchResultIds(messages);

  let strippedServerToolUseCount = 0;
  let strippedResultCount = 0;
  let droppedMessageCount = 0;

  // A server_tool_use always precedes its result in the replay, so by the time a result block is
  // reached its use has already been kept or stripped.
  const keptServerToolUseIds = new Set<string>();

  const sanitized: MessageParam[] = [];
  for (const [index, message] of messages.entries()) {
    if (message.role !== "assistant" || typeof message.content === "string") {
      sanitized.push(message);
      continue;
    }

    const danglingIsResumable =
      toolSearchInRequest && index === resumableAssistantIndex;

    const content = message.content.filter((block) => {
      if (isToolSearchServerToolUseBlock(block)) {
        const dangling = !resultIds.has(block.id);
        const keep = !dangling || danglingIsResumable;
        if (keep) {
          keptServerToolUseIds.add(block.id);
        } else {
          strippedServerToolUseCount++;
        }

        return keep;
      }

      if (isToolSearchToolResultBlock(block)) {
        const keep = keptServerToolUseIds.has(block.tool_use_id);
        if (!keep) {
          strippedResultCount++;
        }

        return keep;
      }

      return true;
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

  if (strippedServerToolUseCount + strippedResultCount === 0) {
    return messages;
  }

  logger.warn(
    {
      toolSearchInRequest,
      strippedServerToolUseCount,
      strippedResultCount,
      droppedMessageCount,
    },
    "[tool-search] Stripped unreplayable tool search blocks from replay"
  );

  return droppedMessageCount > 0
    ? mergeConsecutiveSameRoleMessages(sanitized)
    : sanitized;
}
