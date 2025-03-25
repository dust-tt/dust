import { MCPServerConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { useMemo } from "react";
import { Fetcher } from "swr";

export function useMCPServerConnections({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const connectionsFetcher: Fetcher<{
    connections: MCPServerConnectionType[];
  }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/connections`,
    connectionsFetcher
  );

  return {
    connections: useMemo(() => (data ? data.connections : []), [data]),
    isConnectionsLoading: !error && !data,
    isConnectionsError: error,
    mutateConnections: mutate,
  };
}
