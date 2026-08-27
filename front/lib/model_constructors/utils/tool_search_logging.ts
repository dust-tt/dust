import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";

interface ToolSearchLogContext {
  providerName: string;
  logFields: Record<string, unknown>;
}

interface ToolSearchRequestLog extends ToolSearchLogContext {
  toolName: string;
  details: Record<string, unknown>;
  tags: string[];
}

interface ToolSearchResultLog extends ToolSearchLogContext {
  details: Record<string, unknown>;
}

export function logToolSearchRequest({
  providerName,
  toolName,
  details,
  tags,
  logFields,
}: ToolSearchRequestLog): void {
  logger.info(
    { ...logFields, toolName, ...details },
    `${providerName} tool search query`
  );

  statsDMetrics.increment("llm_tool_search.requests", 1, [
    `tool_name:${toolName}`,
    ...tags,
  ]);
}

export function logToolSearchResults({
  providerName,
  details,
  logFields,
}: ToolSearchResultLog): void {
  logger.info(
    { ...logFields, ...details },
    `${providerName} tool search results`
  );
}

export function logToolSearchError({
  providerName,
  details,
  logFields,
}: ToolSearchResultLog): void {
  logger.warn(
    { ...logFields, ...details },
    `${providerName} tool search returned an error`
  );
}
