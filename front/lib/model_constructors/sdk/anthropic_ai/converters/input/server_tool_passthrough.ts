import type {
  MessageParam,
  ServerToolUseBlockParam,
  ToolSearchToolResultBlockParam,
  WebSearchToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import {
  parseAnthropicWebSearchBlock,
  stripWebSearchBlocks,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/native_web_search_passthrough";
import {
  parseAnthropicToolSearchBlock,
  stripUnreplayableToolSearchBlocks,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/tool_search_passthrough";
import logger from "@app/logger/logger";

// Dispatch across the Anthropic server-tool families whose blocks Dust persists
// as opaque provider passthrough. Each family owns its own schemas and replay
// rules (they genuinely differ); this module is only the router, so callers do
// not have to know which server tool produced a stored block.

export type AnthropicServerToolBlockParam =
  | ServerToolUseBlockParam
  | ToolSearchToolResultBlockParam
  | WebSearchToolResultBlockParam;

function hasBlockType(value: unknown): value is { type: unknown } {
  return typeof value === "object" && value !== null && "type" in value;
}

/**
 * Parses an opaque persisted block back into a typed Anthropic block param,
 * trying each server-tool family in turn.
 */
export function parseAnthropicServerToolBlock(
  block: unknown
): AnthropicServerToolBlockParam | null {
  const toolSearchBlock = parseAnthropicToolSearchBlock(block);
  if (toolSearchBlock) {
    return toolSearchBlock;
  }

  const webSearchBlock = parseAnthropicWebSearchBlock(block);
  if (webSearchBlock) {
    return webSearchBlock;
  }

  // We only ever store blocks we captured ourselves, so a parse failure means
  // storage drift or a newly enabled server tool no schema knows. Surface it:
  // dropping the block would re-break interleaved thinking.
  logger.warn(
    { blockType: hasBlockType(block) ? block.type : undefined },
    "[server-tool] Dropping unparseable Anthropic passthrough block"
  );
  return null;
}

interface StripUnreplayableServerToolBlocksOptions {
  // Whether the request being built carries the tool search server tool.
  toolSearchInRequest: boolean;
  // Whether the request being built carries the native web search server tool.
  nativeWebSearchInRequest: boolean;
}

/**
 * Strips every server-tool block the API would reject from the replay. Each
 * family's pass returns its input untouched when it has nothing to strip, so the
 * common path stays byte identical for prompt caching.
 */
export function stripUnreplayableServerToolBlocks(
  messages: MessageParam[],
  {
    toolSearchInRequest,
    nativeWebSearchInRequest,
  }: StripUnreplayableServerToolBlocksOptions
): MessageParam[] {
  const withoutToolSearch = stripUnreplayableToolSearchBlocks(messages, {
    toolSearchInRequest,
  });

  return nativeWebSearchInRequest
    ? withoutToolSearch
    : stripWebSearchBlocks(withoutToolSearch);
}
