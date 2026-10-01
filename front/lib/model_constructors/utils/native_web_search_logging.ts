import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";

// Provider-native web search produces no `AgentMCPAction` row, so none of the
// usual per-tool surfaces see it: no action card, no message breakdown entry, no
// cost attribution. Logs and metrics are the only visibility we have into query
// volume, result counts and provider-side failures, which is what the feature
// flag is being measured on.

interface NativeWebSearchLogContext {
  providerName: string;
  logFields: Record<string, unknown>;
}

interface NativeWebSearchRequestLog extends NativeWebSearchLogContext {
  details: Record<string, unknown>;
  tags: string[];
}

interface NativeWebSearchResultLog extends NativeWebSearchLogContext {
  details: Record<string, unknown>;
}

export function logNativeWebSearchRequest({
  providerName,
  details,
  tags,
  logFields,
}: NativeWebSearchRequestLog): void {
  logger.info(
    { ...logFields, ...details },
    `${providerName} native web search query`
  );

  statsDMetrics.increment("llm_native_web_search.requests", 1, tags);
}

export function logNativeWebSearchResults({
  providerName,
  details,
  logFields,
}: NativeWebSearchResultLog): void {
  logger.info(
    { ...logFields, ...details },
    `${providerName} native web search results`
  );
}

// The provider returns search failures inside the assistant turn rather than as
// an API error, so the model degrades on its own. Logged at warn so rate-limit
// and max-uses exhaustion are visible instead of silent quality loss.
export function logNativeWebSearchError({
  providerName,
  details,
  logFields,
}: NativeWebSearchResultLog): void {
  logger.warn(
    { ...logFields, ...details },
    `${providerName} native web search returned an error`
  );
}
