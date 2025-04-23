import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import type { RemoteMCPToolStakeLevelType } from "@app/lib/actions/constants";
import { mcpServersSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerType } from "@app/lib/api/mcp";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  CreateMCPServerResponseBody,
  GetMCPServersResponseBody,
} from "@app/pages/api/w/[wId]/mcp";
import type {
  DeleteMCPServerResponseBody,
  GetMCPServerResponseBody,
  PatchMCPServerResponseBody,
} from "@app/pages/api/w/[wId]/mcp/[serverId]";
import type { SyncMCPServerResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]/sync";
import type { GetMCPServerToolsPermissionsResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]/tools";
import type { PatchMCPServerToolsPermissionsResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]/tools/[toolName]";
import type {
  GetConnectionsResponseBody,
  PostConnectionResponseBody,
} from "@app/pages/api/w/[wId]/mcp/connections";
import type { LightWorkspaceType, OAuthProvider, SpaceType } from "@app/types";
/**
 * Hook to fetch a specific remote MCP server by ID
 */
export function useMCPServer({
  disabled,
  owner,
  serverId,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
  serverId: string;
}) {
  const serverFetcher: Fetcher<GetMCPServerResponseBody> = fetcher;

  const url = serverId ? `/api/w/${owner.sId}/mcp/${serverId}` : null;

  const { data, error, mutate } = useSWRWithDefaults(url, serverFetcher, {
    disabled,
  });

  if (!serverId) {
    return {
      server: null,
      isMCPServerLoading: false,
      isMCPServerError: true,
      mutateMCPServer: () => {},
    };
  }

  return {
    server: data?.server || null,
    isMCPServerLoading: !error && !data && !disabled,
    isMCPServerError: !!error,
    mutateMCPServer: mutate,
  };
}

export function useAvailableMCPServers({
  owner,
  space,
}: {
  owner: LightWorkspaceType;
  space?: SpaceType;
}) {
  const configFetcher: Fetcher<GetMCPServersResponseBody> = fetcher;

  const url = space
    ? `/api/w/${owner.sId}/spaces/${space.sId}/mcp/available`
    : `/api/w/${owner.sId}/mcp/available`;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher);

  const availableMCPServers = useMemo(
    () =>
      data
        ? data.servers.sort((a, b) =>
            mcpServersSortingFn({ mcpServer: a }, { mcpServer: b })
          )
        : [],
    [data]
  );

  return {
    availableMCPServers,
    isAvailableMCPServersLoading: !error && !data,
    isAvailableMCPServersError: error,
    mutateAvailableMCPServers: mutate,
  };
}

export function useMCPServers({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetMCPServersResponseBody> = fetcher;

  const url = `/api/w/${owner.sId}/mcp`;

  const { data, error, mutateRegardlessOfQueryParams } = useSWRWithDefaults(
    url,
    configFetcher,
    {
      disabled,
    }
  );

  const mcpServers = useMemo(() => (data ? data.servers : []), [data]);

  return {
    mcpServers,
    isMCPServersLoading: !error && !data && !disabled,
    isMCPServersError: error,
    mutateMCPServers: mutateRegardlessOfQueryParams,
  };
}

/**
 * Hook to delete an MCP server
 */
export function useDeleteMCPServer(owner: LightWorkspaceType) {
  const { mutateMCPServers } = useMCPServers({
    disabled: true,
    owner,
  });

  const deleteServer = async (
    serverId: string
  ): Promise<DeleteMCPServerResponseBody> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp/${serverId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.api_error?.message || "Failed to delete server");
    }

    await mutateMCPServers();
    return response.json();
  };

  return { deleteServer };
}

export function useCreateInternalMCPServer(owner: LightWorkspaceType) {
  const { mutateMCPServers } = useMCPServers({
    disabled: true,
    owner,
  });

  const createInternalMCPServer = async (
    name: string,
    includeGlobal: boolean
  ): Promise<CreateMCPServerResponseBody> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        serverType: "internal",
        includeGlobal,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.api_error?.message || "Failed to create server");
    }

    await mutateMCPServers();
    return response.json();
  };

  return { createInternalMCPServer };
}

/**
 * Hook to create a new MCP server from a URL
 */
export function useCreateRemoteMCPServer(owner: LightWorkspaceType) {
  const { mutateMCPServers } = useMCPServers({
    disabled: true,
    owner,
  });

  const createWithUrlSync = async (
    url: string,
    includeGlobal: boolean
  ): Promise<CreateMCPServerResponseBody> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, serverType: "remote", includeGlobal }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.api_error?.message || "Failed to synchronize server"
      );
    }

    await mutateMCPServers();
    return response.json();
  };

  return { createWithUrlSync };
}

/**
 * Hook to create a new MCP server from a URL
 */
export function useFetchRemoteMCPServer(owner: LightWorkspaceType) {
  const fetchRemoteMCPServer = async (
    url: string
  ): Promise<{ server: Omit<MCPServerType, "id"> }> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp/fetch?url=${url}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.api_error?.message || "Failed to synchronize server"
      );
    }

    return response.json();
  };

  return { fetchRemoteMCPServer };
}

/**
 * Hook to synchronize with a remote MCP server
 */
export function useSyncRemoteMCPServer(
  owner: LightWorkspaceType,
  serverId: string
) {
  const { mutateMCPServer } = useMCPServer({
    disabled: true,
    owner,
    serverId: serverId || "",
  });

  const syncServer = async (): Promise<SyncMCPServerResponseBody> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp/${serverId}/sync`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.api_error?.message || "Failed to synchronize server"
      );
    }

    await mutateMCPServer();
    return response.json();
  };

  return { syncServer };
}

/**
 * Hook to update a remote MCP server
 */
export function useUpdateRemoteMCPServer(
  owner: LightWorkspaceType,
  serverId: string
) {
  const { mutateMCPServer } = useMCPServer({
    disabled: true,
    owner,
    serverId,
  });

  const updateServer = async (data: {
    name: string;
    icon: string;
    description: string;
  }): Promise<PatchMCPServerResponseBody> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp/${serverId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.api_error?.message || "Failed to update server");
    }

    await mutateMCPServer();
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
    isConnectionsLoading: !error && !data && !disabled,
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
    provider,
  }: {
    connectionId: string;
    mcpServerId: string;
    provider: OAuthProvider;
  }): Promise<PostConnectionResponseBody> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp/connections`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId,
        mcpServerId,
        provider,
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

export function useMCPServerToolsPermissions({
  owner,
  serverId,
}: {
  owner: LightWorkspaceType;
  serverId: string;
}) {
  const toolsFetcher: Fetcher<GetMCPServerToolsPermissionsResponseBody> =
    fetcher;

  const url = `/api/w/${owner.sId}/mcp/${serverId}/tools`;

  const { data, error, mutate } = useSWRWithDefaults(url, toolsFetcher);

  const toolsPermissions = useMemo(
    () => (data ? data.permissions : {}),
    [data]
  );

  return {
    toolsPermissions,
    isToolsPermissionsLoading: !error && !data,
    isToolsPermissionsError: error,
    mutateToolsPermissions: mutate,
  };
}

export function useUpdateMCPServerToolsPermissions({
  owner,
  serverId,
}: {
  owner: LightWorkspaceType;
  serverId: string;
}) {
  const { mutateToolsPermissions } = useMCPServerToolsPermissions({
    owner,
    serverId,
  });

  const sendNotification = useSendNotification();

  const updateToolPermission = async ({
    toolName,
    permission,
  }: {
    toolName: string;
    permission: RemoteMCPToolStakeLevelType;
  }): Promise<PatchMCPServerToolsPermissionsResponseBody> => {
    const response = await fetch(
      `/api/w/${owner.sId}/mcp/${serverId}/tools/${toolName}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.api_error?.message || "Failed to update permission"
      );
    }

    sendNotification({
      type: "success",
      title: "Permission updated",
      description: `The permission for ${toolName} has been updated.`,
    });

    await mutateToolsPermissions();
    return response.json();
  };

  return { updateToolPermission };
}
