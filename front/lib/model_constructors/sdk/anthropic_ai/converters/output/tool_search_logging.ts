import type {
  ToolSearchToolResultError,
  ToolSearchToolSearchResultBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import {
  logToolSearchError,
  logToolSearchRequest,
  logToolSearchResults,
} from "@app/lib/api/llm/utils/tool_search_logging";
import { isRecord, isString } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

// The result block content. The legacy (beta) and model_constructors (non-beta)
// SDK types are structurally identical, so the beta caller can pass its own
// value where this non-beta type is expected.
type ToolSearchResultContent =
  | ToolSearchToolResultError
  | ToolSearchToolSearchResultBlock;

// Anthropic parsing shared by the legacy and model_constructors client stacks.
// Callers map their metadata into StatsD tags and structured log fields. The
// provider-independent log shape and metric live in the shared utility.

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
}): string | undefined {
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

  logToolSearchRequest({
    providerName: "Anthropic",
    toolName,
    details: {
      query,
      // Keep the raw payload only when parsing failed, to debug malformed input.
      rawInput: query === undefined ? rawInput : undefined,
    },
    tags,
    logFields,
  });

  return query;
}

// Logs the tools surfaced by a tool search, or the error code when the search
// failed (e.g. too_many_requests, unavailable).
export function logToolSearchResult({
  content,
  query,
  logFields,
}: {
  content: ToolSearchResultContent;
  query: string | undefined;
  logFields: Record<string, unknown>;
}): void {
  if (content.type === "tool_search_tool_result_error") {
    logToolSearchError({
      providerName: "Anthropic",
      details: {
        query,
        errorCode: content.error_code,
        errorMessage: content.error_message,
      },
      logFields,
    });
    return;
  }

  const toolReferences = content.tool_references.map((ref) => ref.tool_name);
  logToolSearchResults({
    providerName: "Anthropic",
    details: {
      query,
      toolReferences,
      resultCount: toolReferences.length,
    },
    logFields,
  });
}
