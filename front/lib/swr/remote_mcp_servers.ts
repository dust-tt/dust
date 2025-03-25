import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import type { MCPApiResponse, MCPResponse } from "@app/types/mcp";

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
export function useDeleteRemoteMCPServer(
  owner: LightWorkspaceType,
  space: SpaceType
) {
  const { mutateServers } = useRemoteMCPServers({
    disabled: true,
    owner,
    space,
  });

  const deleteServer = async (serverId: string): Promise<MCPApiResponse> => {
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

    void mutateServers();
    return response.json();
  };

  return { deleteServer };
}

/**
 * Hook to create a new MCP server from a URL
 */
export function useCreateRemoteMCPServer(
  owner: LightWorkspaceType,
  space: SpaceType
) {
  const { mutateServers } = useRemoteMCPServers({
    disabled: true,
    owner,
    space,
  });

  const createWithUrlSync = async (url: string): Promise<MCPApiResponse> => {
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

    void mutateServers();
    return response.json();
  };

  return { createWithUrlSync };
}

/**
 * Hook to synchronize with a remote MCP server
 */
export function useSyncRemoteMCPServer(
  owner: LightWorkspaceType,
  space: SpaceType,
  serverId: string
) {
  const { mutateServer } = useRemoteMCPServer({
    disabled: true,
    owner,
    space,
    serverId: serverId || "",
  });

  const syncServer = async (): Promise<MCPApiResponse> => {
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

    void mutateServer();
    return response.json();
  };

  return { syncServer };
}

/**
 * Hook to update a remote MCP server
 */
export function useUpdateRemoteMCPServer(
  owner: LightWorkspaceType,
  space: SpaceType,
  serverId: string
) {
  const { mutateServer } = useRemoteMCPServer({
    disabled: true,
    owner,
    space,
    serverId,
  });

  const updateServer = async (data: {
    name: string;
    url: string;
    description: string;
    tools: { name: string; description: string }[];
  }): Promise<MCPApiResponse> => {
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

    void mutateServer();
    return response.json();
  };

  return { updateServer };
}
