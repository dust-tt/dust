import type {
  ToolSearchToolResultError,
  ToolSearchToolSearchResultBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { isRecord, isString } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

// The result block content. The legacy (beta) and model_constructors (non-beta)
// SDK types are structurally identical, so the beta caller can pass its own
// value where this non-beta type is expected.
type ToolSearchResultContent =
  | ToolSearchToolResultError
  | ToolSearchToolSearchResultBlock;

// Shared instrumentation for Anthropic's server-side tool search, used by both
// the legacy (lib/api/llm) and model_constructors client stacks. Callers map
// their own metadata into `tags` (StatsD) and `logFields` (structured logs).
// The parsing, log shape, and metric name live here so they stay in sync.

// Logs the natural-language query the model issued against a tool search tool
// (e.g. tool_search_tool_bm25) and increments a per-search StatsD counter. The
// query arrives as accumulated input_json_delta JSON: `{"query":"..."}`.
export function logToolSearchQuery({
  rawInput,
  toolName,
  tags,
  logFields,
}: {
  rawInput: string;
  toolName: string;
  tags: string[];
  logFields: Record<string, unknown>;
}): void {
  let query: string | undefined;
  const parsed = safeParseJSON(rawInput);
  if (
    parsed.isOk() &&
    parsed.value !== null &&
    isRecord(parsed.value) &&
    isString(parsed.value.query)
  ) {
    query = parsed.value.query;
  }

  logger.info(
    {
      ...logFields,
      toolName,
      query,
      // Keep the raw payload only when parsing failed, to debug malformed input.
      rawInput: query === undefined ? rawInput : undefined,
    },
    "Anthropic tool search query"
  );

  getStatsDClient().increment("llm_tool_search.requests", 1, [
    `tool_name:${toolName}`,
    ...tags,
  ]);
}

// Logs the tools surfaced by a tool search, or the error code when the search
// failed (e.g. too_many_requests, unavailable).
export function logToolSearchResult({
  content,
  logFields,
}: {
  content: ToolSearchResultContent;
  logFields: Record<string, unknown>;
}): void {
  if (content.type === "tool_search_tool_result_error") {
    logger.warn(
      {
        errorCode: content.error_code,
        errorMessage: content.error_message,
        ...logFields,
      },
      "Anthropic tool search returned an error"
    );
    return;
  }

  const toolReferences = content.tool_references.map((ref) => ref.tool_name);
  logger.info(
    { toolReferences, resultCount: toolReferences.length, ...logFields },
    "Anthropic tool search results"
  );
}
