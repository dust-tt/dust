import { useSendNotification } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import type { RemoteMCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  getMcpServerDisplayName,
  mcpServersSortingFn,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerType, MCPServerTypeWithViews } from "@app/lib/api/mcp";
import type {
  MCPServerConnectionConnectionType,
  MCPServerConnectionType,
} from "@app/lib/resources/mcp_server_connection_resource";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
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
} from "@app/pages/api/w/[wId]/mcp/connections/[connectionType]";
import type { DiscoverOAuthMetadataResponseBody } from "@app/pages/api/w/[wId]/mcp/discover_oauth_metadata";
import type {
  LightWorkspaceType,
  OAuthProvider,
  OAuthUseCase,
  Result,
  SpaceType,
} from "@app/types";
import { Err, Ok, setupOAuthConnection } from "@app/types";
import { getProviderAdditionalClientSideAuthCredentials } from "@app/types/oauth/lib";

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
        : emptyArray<MCPServerTypeWithViews>(),
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

  const mcpServers = data?.servers ?? emptyArray();

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
 * Hook to discover the OAuth metadata for a remote MCP server.
 * It is used to check if the server requires OAuth authentication.
 * If it does, it returns the OAuth connection metadata with the oauthRequired set to true.
 * If it does not, it returns the oauthRequired set to false.
 *
 * Note: this hook should not be called too frequently, as it is likely rate limited by the mcp server provider.
 */
export function useDiscoverOAuthMetadata(owner: LightWorkspaceType) {
  const discoverOAuthMetadata = async (
    url: string
  ): Promise<Result<DiscoverOAuthMetadataResponseBody, Error>> => {
    const response = await fetch(
      `/api/w/${owner.sId}/mcp/discover_oauth_metadata`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return new Err(
        new Error(
          error.api_error?.message || "Failed to check OAuth connection"
        )
      );
    }

    return new Ok(await response.json());
  };

  return { discoverOAuthMetadata };
}

/**
 * Hook to create a new MCP server from a URL
 */
export function useCreateRemoteMCPServer(owner: LightWorkspaceType) {
  const { mutateMCPServers } = useMCPServers({
    disabled: true,
    owner,
  });

  const { mutateConnections } = useMCPServerConnections({
    disabled: true,
    connectionType: "workspace",
    owner,
  });

  const createWithURL = useCallback(
    async ({
      url,
      includeGlobal,
      sharedSecret,
      connectionId,
    }: {
      url: string;
      includeGlobal: boolean;
      sharedSecret?: string;
      connectionId?: string;
    }): Promise<Result<CreateMCPServerResponseBody, Error>> => {
      const body: any = { url, serverType: "remote", includeGlobal };
      if (sharedSecret) {
        body.sharedSecret = sharedSecret;
      }
      if (connectionId) {
        body.connectionId = connectionId;
      }
      const response = await fetch(`/api/w/${owner.sId}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        return new Err(
          new Error(error.error?.message || "Failed to create server")
        );
      }

      await mutateMCPServers();
      if (connectionId) {
        await mutateConnections();
      }
      const r = await response.json();
      return new Ok(r);
    },
    [mutateMCPServers, mutateConnections, owner.sId]
  );

  return { createWithURL };
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
      await mutateMCPServer();
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
    sharedSecret?: string;
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
  connectionType,
  disabled,
}: {
  owner: LightWorkspaceType;
  connectionType: MCPServerConnectionConnectionType;
  disabled?: boolean;
}) {
  const connectionsFetcher: Fetcher<GetConnectionsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/mcp/connections/${connectionType}`,
    connectionsFetcher,
    {
      disabled,
    }
  );

  return {
    connections: data?.connections ?? emptyArray(),
    isConnectionsLoading: !error && !data && !disabled,
    isConnectionsError: error,
    mutateConnections: mutate,
  };
}

export function useCreateMCPServerConnection({
  owner,
  connectionType,
}: {
  owner: LightWorkspaceType;
  connectionType: MCPServerConnectionConnectionType;
}) {
  const { mutateConnections } = useMCPServerConnections({
    disabled: true,
    connectionType,
    owner,
  });
  const sendNotification = useSendNotification();
  const createMCPServerConnection = async ({
    connectionId,
    mcpServer,
    provider,
  }: {
    connectionId: string;
    mcpServer: MCPServerType;
    provider: OAuthProvider;
  }): Promise<PostConnectionResponseBody | null> => {
    const response = await fetch(
      `/api/w/${owner.sId}/mcp/connections/${connectionType}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionId,
          mcpServerId: mcpServer.sId,
          provider,
        }),
      }
    );
    if (response.ok) {
      sendNotification({
        type: "success",
        title: `${getMcpServerDisplayName(mcpServer)} connected`,
        description: `Successfully connected to ${getMcpServerDisplayName(mcpServer)}.`,
      });
      void mutateConnections();
      return response.json();
    } else {
      sendNotification({
        type: "error",
        title: `Failed to connect ${getMcpServerDisplayName(mcpServer)}`,
        description: `Could not connect to ${getMcpServerDisplayName(mcpServer)}. Please try again.`,
      });
      return null;
    }
  };

  return { createMCPServerConnection };
}

export function useDeleteMCPServerConnection({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutateConnections: mutateWorkspaceConnections } =
    useMCPServerConnections({
      disabled: true,
      connectionType: "workspace",
      owner,
    });

  const { mutateConnections: mutatePersonalConnections } =
    useMCPServerConnections({
      disabled: true,
      connectionType: "personal",
      owner,
    });

  const sendNotification = useSendNotification();

  const deleteMCPServerConnection = useCallback(
    async ({
      connection,
      mcpServer,
    }: {
      connection: MCPServerConnectionType;
      mcpServer: MCPServerType;
    }): Promise<{ success: boolean }> => {
      const response = await fetch(
        `/api/w/${owner.sId}/mcp/connections/${connection.connectionType}/${connection.sId}`,
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
          title: `${getMcpServerDisplayName(mcpServer)} disconnected`,
          description: `Successfully disconnected from ${getMcpServerDisplayName(mcpServer)}.`,
        });
        if (connection.connectionType === "workspace") {
          void mutateWorkspaceConnections();
        } else if (connection.connectionType === "personal") {
          void mutatePersonalConnections();
        }
      } else {
        sendNotification({
          type: "error",
          title: `Failed to disconnect ${getMcpServerDisplayName(mcpServer)}`,
          description: `Could not disconnect from ${getMcpServerDisplayName(mcpServer)}. Please try again.`,
        });
      }

      return response.json();
    },
    [
      owner.sId,
      sendNotification,
      mutateWorkspaceConnections,
      mutatePersonalConnections,
    ]
  );

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

export function useCreatePersonalConnection(owner: LightWorkspaceType) {
  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "personal",
  });

  const sendNotification = useSendNotification();

  const createPersonalConnection = async (
    mcpServer: MCPServerType,
    provider: OAuthProvider,
    useCase: OAuthUseCase,
    scope?: string
  ): Promise<boolean> => {
    try {
      const extraConfig: Record<string, string> = {
        mcp_server_id: mcpServer.sId,
      };

      const additionalCredentials =
        await getProviderAdditionalClientSideAuthCredentials({
          provider,
          // @ts-expect-error useCase is too broad here but will fixed when we remove salesforce labs integration.
          use_case: useCase,
        });
      if (additionalCredentials) {
        Object.entries(additionalCredentials).forEach(([key, value]) => {
          if (typeof value === "string") {
            extraConfig[key] = value;
          }
        });
      }
      if (scope) {
        extraConfig.scope = scope;
      }

      const cRes = await setupOAuthConnection({
        dustClientFacingUrl: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}`,
        owner,
        provider,
        useCase,
        extraConfig,
      });

      if (cRes.isErr()) {
        sendNotification({
          type: "error",
          title: "Failed to connect provider",
          description: cRes.error.message,
        });
        return false;
      }

      const result = await createMCPServerConnection({
        connectionId: cRes.value.connection_id,
        mcpServer,
        provider,
      });

      return result !== null;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect provider",
        description:
          "Unexpected error trying to connect to your provider. Please try again. Error: " +
          error,
      });
    }
    return false;
  };

  return { createPersonalConnection };
}
