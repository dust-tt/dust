import type { WebSearchToolResultBlockContent } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  logNativeWebSearchError,
  logNativeWebSearchRequest,
  logNativeWebSearchResults,
} from "@app/lib/model_constructors/utils/native_web_search_logging";
import { isRecord, isString } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

// Anthropic-specific parsing for the native web search server tool. Callers map
// their metadata into StatsD tags and structured log fields; the
// provider-independent log shape and metric live in the shared utility.

// Logs the query the model issued against the native web search tool and
// increments a per-search counter. The query arrives as accumulated
// input_json_delta JSON: `{"query":"..."}`.
export function logAnthropicWebSearchQuery({
  rawInput,
  tags,
  logFields,
}: {
  rawInput: string;
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

  logNativeWebSearchRequest({
    providerName: "Anthropic",
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

// Logs how many results a search returned, or the error code when the search
// failed (e.g. too_many_requests, max_uses_exceeded).
export function logAnthropicWebSearchResult({
  content,
  query,
  logFields,
}: {
  content: WebSearchToolResultBlockContent;
  query: string | undefined;
  logFields: Record<string, unknown>;
}): void {
  if (!Array.isArray(content)) {
    logNativeWebSearchError({
      providerName: "Anthropic",
      details: { query, errorCode: content.error_code },
      logFields,
    });
    return;
  }

  logNativeWebSearchResults({
    providerName: "Anthropic",
    details: { query, resultCount: content.length },
    logFields,
  });
}
