import { parseOpenAIWebSearchItem } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/native_web_search_passthrough";
import { parseOpenAIToolSearchItem } from "@app/lib/model_constructors/sdk/openai_responses/converters/input/tool_search_passthrough";
import logger from "@app/logger/logger";
import type { ResponseInputItem } from "openai/resources/responses/responses";

// Dispatch across the OpenAI Responses server-tool families whose items Dust
// persists as opaque provider passthrough, so callers do not have to know which
// server tool produced a stored item.

function hasItemType(value: unknown): value is { type: unknown } {
  return typeof value === "object" && value !== null && "type" in value;
}

export function parseOpenAIServerToolItem(
  block: unknown
): ResponseInputItem | null {
  const toolSearchItem = parseOpenAIToolSearchItem(block);
  if (toolSearchItem) {
    return toolSearchItem;
  }

  const webSearchItem = parseOpenAIWebSearchItem(block);
  if (webSearchItem) {
    return webSearchItem;
  }

  // We only ever store items we captured ourselves, so a parse failure means
  // storage drift or a newly enabled server tool no schema knows.
  logger.warn(
    { itemType: hasItemType(block) ? block.type : undefined },
    "[server-tool] Dropping unparseable OpenAI passthrough item"
  );
  return null;
}
