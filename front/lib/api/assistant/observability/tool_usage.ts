import {
  fetchNestedTermsBuckets,
  fetchNestedUsageMetrics,
} from "@app/lib/api/assistant/observability/nested_usage_metrics";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";
import type { estypes } from "@elastic/elasticsearch";

const TOOLS_NESTED_PATH = "tools_used";
const TOOLS_SERVER_NAME_FIELD = "tools_used.server_name";

export type ToolUsagePoint = {
  timestamp: number;
  date: string;
  uniqueUsers: number;
  executionCount: number;
};

export type AvailableTool = {
  serverName: string;
  displayName: string;
  totalExecutions: number;
};

export type GetWorkspaceToolsResponse = {
  tools: AvailableTool[];
};

export type GetWorkspaceToolUsageResponse = {
  points: ToolUsagePoint[];
};

export async function fetchToolUsageMetrics(
  baseQuery: estypes.QueryDslQueryContainer,
  serverName: string | null,
  timezone: string = "UTC"
): Promise<Result<ToolUsagePoint[], Error>> {
  return fetchNestedUsageMetrics(baseQuery, {
    nestedPath: TOOLS_NESTED_PATH,
    filterField: TOOLS_SERVER_NAME_FIELD,
    filterValue: serverName,
    timezone,
  });
}

export async function fetchAvailableTools(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<AvailableTool[], Error>> {
  const result = await fetchNestedTermsBuckets(baseQuery, {
    nestedPath: TOOLS_NESTED_PATH,
    field: TOOLS_SERVER_NAME_FIELD,
  });

  if (result.isErr()) {
    return result;
  }

  return new Ok(
    result.value.map((bucket) => ({
      serverName: bucket.key,
      displayName: bucket.key,
      totalExecutions: bucket.docCount,
    }))
  );
}

export async function resolveServerDisplayNames(
  auth: Authenticator,
  serverNames: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(serverNames)];
  const remoteNameMap = await RemoteMCPServerResource.resolveNamesBySIds(
    auth,
    unique
  );

  const displayMap = new Map<string, string>();
  for (const name of unique) {
    displayMap.set(name, remoteNameMap.get(name) ?? asDisplayToolName(name));
  }
  return displayMap;
}

export async function resolveToolDisplayNames(
  auth: Authenticator,
  tools: AvailableTool[]
): Promise<AvailableTool[]> {
  const displayMap = await resolveServerDisplayNames(
    auth,
    tools.map((t) => t.serverName)
  );

  return tools.map((tool) => ({
    ...tool,
    displayName: displayMap.get(tool.serverName) ?? tool.serverName,
  }));
}
