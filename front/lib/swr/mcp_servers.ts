import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetConnectionsResponseBody,
  PostConnectionResponseBody,
} from "@app/pages/api/w/[wId]/mcp/connections";
import type {
  AllowedFilter,
  GetMCPServersResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/mcp";
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

export function useMCPServerConnections({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const connectionsFetcher: Fetcher<GetConnectionsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/mcp/connections`,
    connectionsFetcher,
    {
      disabled,
    }
  );

  return {
    connections: useMemo(() => (data ? data.connections : []), [data]),
    isConnectionsLoading: !error && !data,
    isConnectionsError: error,
    mutateConnections: mutate,
  };
}

export function useCreateMCPServerConnection({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutateConnections } = useMCPServerConnections({
    disabled: true,
    owner,
  });
  const sendNotification = useSendNotification();
  const createMCPServerConnection = async ({
    connectionId,
    mcpServerId,
  }: {
    connectionId: string;
    mcpServerId: string;
  }): Promise<PostConnectionResponseBody> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId,
        mcpServerId,
      }),
    });
    if (response.ok) {
      sendNotification({
        type: "success",
        title: "Provider connected",
        description:
          "Your capability provider has been connected successfully.",
      });
    } else {
      sendNotification({
        type: "error",
        title: "Failed to connect provider",
        description: "Could not connect to your provider. Please try again.",
      });
    }

    if (response.ok) {
      void mutateConnections();
    }
    return response.json();
  };

  return { createMCPServerConnection };
}

export function useDeleteMCPServerConnection({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutateConnections } = useMCPServerConnections({
    disabled: true,
    owner,
  });
  const sendNotification = useSendNotification();

  const deleteMCPServerConnection = async ({
    connectionId,
  }: {
    connectionId: string;
  }): Promise<{ success: boolean }> => {
    const response = await fetch(
      `/api/w/${owner.sId}/mcp/connections/${connectionId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.ok) {
      sendNotification({
        type: "success",
        title: "Provider disconnected",
        description:
          "Your capability provider has been disconnected successfully.",
      });
      void mutateConnections();
    } else {
      sendNotification({
        type: "error",
        title: "Failed to disconnect provider",
        description: "Could not disconnect to your provider. Please try again.",
      });
    }

    return response.json();
  };

  return { deleteMCPServerConnection };
}

export function useMcpServers({
  owner,
  space,
  filter,
}: {
  owner: LightWorkspaceType;
  space?: SpaceType;
  filter: AllowedFilter;
}) {
  const configFetcher: Fetcher<GetMCPServersResponseBody> = fetcher;

  const url = space
    ? `/api/w/${owner.sId}/spaces/${space.sId}/mcp?filter=${filter}`
    : null;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher);

  const mcpServers = useMemo(() => (data ? data.mcpServers : []), [data]);

  return {
    mcpServers,
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
