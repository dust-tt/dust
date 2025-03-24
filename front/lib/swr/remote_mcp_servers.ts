import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import type { MCPApiResponse, MCPResponse } from "@app/types/mcp";

// Type for the GetRemoteMCPServersResponseBody
export type GetRemoteMCPServersResponseBody = {
  servers: MCPResponse[];
};

/**
 * Hook to fetch the list of remote MCP servers for a space
 */
export function useRemoteMCPServers({
  disabled,
  owner,
  space,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}) {
  const serversFetcher: Fetcher<GetRemoteMCPServersResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/spaces/${space.sId}/mcp/remote`,
    serversFetcher,
    {
      disabled,
    }
  );

  return {
    servers: useMemo(() => (data ? data.servers : []), [data]),
    isServersLoading: !error && !data,
    isServersError: !!error,
    mutateServers: mutate,
  };
}

/**
 * Hook to fetch a specific remote MCP server by ID
 */
export function useRemoteMCPServer({
  disabled,
  owner,
  space,
  serverId,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
  serverId: string;
}) {
  const serverFetcher: Fetcher<MCPApiResponse> = fetcher;

  const url = serverId
    ? `/api/w/${owner.sId}/spaces/${space.sId}/mcp/remote/${serverId}`
    : null;

  const { data, error, mutate } = useSWRWithDefaults(url, serverFetcher, {
    disabled,
  });

  if (!serverId) {
    return {
      server: null,
      isServerLoading: false,
      isServerError: true,
      mutateServer: () => {},
    };
  }

  return {
    server: data?.data || null,
    isServerLoading: !error && !data,
    isServerError: !!error,
    mutateServer: mutate,
  };
}

/**
 * Hook to delete a remote MCP server
 */
export function useDeleteRemoteMCPServer() {
  const deleteServer = async (
    owner: LightWorkspaceType,
    space: SpaceType,
    serverId: string
  ): Promise<MCPApiResponse> => {
    const response = await fetch(
      `/api/w/${owner.sId}/spaces/${space.sId}/mcp/remote/${serverId}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.api_error?.message || "Failed to delete server");
    }

    return response.json();
  };

  return { deleteServer };
}

/**
 * Hook to synchronize with a remote MCP server
 * This can either create a new server using a URL or sync an existing server by its ID
 */
export function useSyncRemoteMCPServer() {
  // Create a new server with the provided URL
  const syncByUrl = async (
    owner: LightWorkspaceType,
    space: SpaceType,
    url: string
  ): Promise<MCPApiResponse> => {
    const response = await fetch(
      `/api/w/${owner.sId}/spaces/${space.sId}/mcp/remote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.api_error?.message || "Failed to synchronize server"
      );
    }

    return response.json();
  };

  const syncById = async (
    owner: LightWorkspaceType,
    space: SpaceType,
    serverId: string
  ): Promise<MCPApiResponse> => {
    const response = await fetch(
      `/api/w/${owner.sId}/spaces/${space.sId}/mcp/remote/${serverId}/sync`,
      { method: "POST" }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.api_error?.message || "Failed to synchronize server"
      );
    }

    return response.json();
  };

  return { syncByUrl, syncById };
}

/**
 * Hook to update a remote MCP server
 */
export function useUpdateRemoteMCPServer() {
  const updateServer = async (
    owner: LightWorkspaceType,
    space: SpaceType,
    serverId: string,
    data: {
      name: string;
      url: string;
      description: string;
      tools: { name: string; description: string }[];
    }
  ): Promise<MCPApiResponse> => {
    const response = await fetch(
      `/api/w/${owner.sId}/spaces/${space.sId}/mcp/remote/${serverId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.api_error?.message || "Failed to update server");
    }

    return response.json();
  };

  return { updateServer };
}
