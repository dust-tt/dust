import { useCallback, useMemo, useState } from "react";
import type { Fetcher, SWRConfiguration } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  getMcpServerViewDisplayName,
  mcpServerViewSortingFn,
} from "@app/lib/actions/mcp_helper";
import {
  getMcpServerDisplayName,
  mcpServersSortingFn,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import type { MCPServerTypeWithViews } from "@app/lib/api/mcp";
import type {
  MCPServerConnectionConnectionType,
  MCPServerConnectionType,
} from "@app/lib/resources/mcp_server_connection_resource";
import { useSpaceInfo, useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { emptyArray } from "@app/lib/swr/swr";
import type { GetMCPServersResponseBody } from "@app/pages/api/w/[wId]/mcp";
import type { CreateMCPServerResponseBody } from "@app/pages/api/w/[wId]/mcp";
import type {
  DeleteMCPServerResponseBody,
  GetMCPServerResponseBody,
  PatchMCPServerBody,
  PatchMCPServerResponseBody,
} from "@app/pages/api/w/[wId]/mcp/[serverId]";
import type { SyncMCPServerResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]/sync";
import type {
  PatchMCPServerToolsPermissionsResponseBody,
  UpdateMCPToolSettingsBodyType,
} from "@app/pages/api/w/[wId]/mcp/[serverId]/tools/[toolName]";
import type {
  GetConnectionsResponseBody,
  PostConnectionResponseBody,
} from "@app/pages/api/w/[wId]/mcp/connections/[connectionType]";
import type { DiscoverOAuthMetadataResponseBody } from "@app/pages/api/w/[wId]/mcp/discover_oauth_metadata";
import type { GetMCPServersUsageResponseBody } from "@app/pages/api/w/[wId]/mcp/usage";
import type { GetMCPServerViewsListResponseBody } from "@app/pages/api/w/[wId]/mcp/views";
import type {
  PatchMCPServerViewBody,
  PatchMCPServerViewResponseBody,
} from "@app/pages/api/w/[wId]/mcp/views/[viewId]";
import type { GetMCPServerViewsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/mcp_views";
import type { GetMCPServerViewsNotActivatedResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/mcp_views/not_activated";
import type {
  LightWorkspaceType,
  SpaceType,
  WithAPIErrorResponse,
} from "@app/types";
import type {
  MCPOAuthUseCase,
  OAuthProvider,
  OAuthUseCase,
  Result,
} from "@app/types";
import {
  Err,
  isAdmin,
  isAPIErrorResponse,
  Ok,
  removeNulls,
  setupOAuthConnection,
} from "@app/types";

export type MCPConnectionType = {
  useCase: MCPOAuthUseCase;
  connectionId: string;
};

function useMutateMCPServersViewsForAdmin(owner: LightWorkspaceType) {
  const { spaces } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: !isAdmin(owner),
  });
  const { mutateMCPServerViews } = useMCPServerViews({
    owner,
    space: spaces.find((s) => s.kind === "system"),
    disabled: true,
  });
  const { mutateMCPServers } = useMCPServers({
    disabled: true,
    owner,
  });

  return {
    mutate: useCallback(async () => {
      await mutateMCPServerViews();
      await mutateMCPServers();
    }, [mutateMCPServerViews, mutateMCPServers]),
  };
}

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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  const sendNotification = useSendNotification();
  const { mutate } = useMutateMCPServersViewsForAdmin(owner);

  const [isDeleting, setIsDeleting] = useState(false);

  const deleteServer = useCallback(
    async (server: MCPServerType): Promise<boolean> => {
      setIsDeleting(true);
      try {
        const response = await fetch(`/api/w/${owner.sId}/mcp/${server.sId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const body = await response.json();
          sendNotification({
            title: `Failure`,
            type: "error",
            description:
              body.error?.message ||
              `Failed to delete ${getMcpServerDisplayName(server)}`,
          });
          return false;
        }

        const result: WithAPIErrorResponse<DeleteMCPServerResponseBody> =
          await response.json();

        if (isAPIErrorResponse(result)) {
          sendNotification({
            title: `Failure`,
            type: "error",
            description:
              result.error?.message ||
              `Failed to delete ${getMcpServerDisplayName(server)}`,
          });
          return false;
        }

        if (!result.deleted) {
          sendNotification({
            title: `Failure`,
            type: "error",
            description: `Failed to delete ${getMcpServerDisplayName(server)}`,
          });
          return false;
        }

        sendNotification({
          title: `Success`,
          type: "success",
          description: `Successfully deleted ${getMcpServerDisplayName(server)}`,
        });
        await mutate();
        return result.deleted;
      } finally {
        setIsDeleting(false);
      }
    },
    [mutate, owner.sId, sendNotification]
  );

  return { deleteServer, isDeleting };
}

export function useCreateInternalMCPServer(owner: LightWorkspaceType) {
  const { mutate } = useMutateMCPServersViewsForAdmin(owner);

  const createInternalMCPServer = async ({
    name,
    oauthConnection,
    includeGlobal,
  }: {
    name: string;
    oauthConnection?: MCPConnectionType;
    includeGlobal: boolean;
  }): Promise<Result<CreateMCPServerResponseBody, Error>> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        serverType: "internal",
        useCase: oauthConnection?.useCase,
        connectionId: oauthConnection?.connectionId,
        includeGlobal,
      }),
    });

    if (!response.ok) {
      const body = await response.json();
      return new Err(
        new Error(body.error?.message || "Failed to create server")
      );
    }

    await mutate();
    return new Ok(await response.json());
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
  const discoverOAuthMetadata = useCallback(
    async (
      url: string,
      customHeaders?: { key: string; value: string }[]
    ): Promise<Result<DiscoverOAuthMetadataResponseBody, Error>> => {
      const response = await fetch(
        `/api/w/${owner.sId}/mcp/discover_oauth_metadata`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, customHeaders }),
        }
      );

      if (!response.ok) {
        const body = await response.json();
        return new Err(
          new Error(body.error.message || "Failed to check OAuth connection")
        );
      }

      return new Ok(await response.json());
    },
    [owner.sId]
  );

  return { discoverOAuthMetadata };
}

/**
 * Hook to create a new MCP server from a URL
 */
export function useCreateRemoteMCPServer(owner: LightWorkspaceType) {
  const { mutate } = useMutateMCPServersViewsForAdmin(owner);

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
      oauthConnection,
      customHeaders,
    }: {
      url: string;
      includeGlobal: boolean;
      sharedSecret?: string;
      oauthConnection?: MCPConnectionType;
      customHeaders?: { key: string; value: string }[];
    }): Promise<Result<CreateMCPServerResponseBody, Error>> => {
      const body: any = { url, serverType: "remote", includeGlobal };
      if (sharedSecret) {
        body.sharedSecret = sharedSecret;
      }

      if (oauthConnection) {
        body.connectionId = oauthConnection.connectionId;
        body.useCase = oauthConnection.useCase;
      }
      if (customHeaders) {
        body.customHeaders = customHeaders;
      }
      const response = await fetch(`/api/w/${owner.sId}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const body = await response.json();
        return new Err(
          new Error(body.error?.message || "Failed to create server")
        );
      }
      await mutate();
      if (oauthConnection?.connectionId) {
        await mutateConnections();
      }
      const r = await response.json();
      return new Ok(r);
    },
    [mutate, mutateConnections, owner.sId]
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
  const sendNotification = useSendNotification();

  const { mutateMCPServer } = useMCPServer({
    disabled: true,
    owner,
    serverId: serverId || "",
  });

  const { mutate } = useMutateMCPServersViewsForAdmin(owner);

  const syncServer = async (): Promise<boolean> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp/${serverId}/sync`, {
      method: "POST",
    });

    if (!response.ok) {
      const body = await response.json();
      sendNotification({
        title: `Error synchronizing server`,
        type: "error",
        description: body.error?.message || "An error occurred",
      });
      return false;
    }

    const result: WithAPIErrorResponse<SyncMCPServerResponseBody> =
      await response.json();

    if (isAPIErrorResponse(result)) {
      sendNotification({
        title: `Error synchronizing server`,
        type: "error",
        description: result.error.message || "An error occurred",
      });
      return false;
    }

    sendNotification({
      title: "Success",
      type: "success",
      description: `${getMcpServerDisplayName(result.server)} synchronized successfully.`,
    });

    void mutateMCPServer();
    void mutate();
    return true;
  };

  return { syncServer };
}

/**
 * Hook to update an MCP server
 */
function useUpdateMCPServer(
  owner: LightWorkspaceType,
  // Using the view to get the proper name/description
  mcpServerView: MCPServerViewType
) {
  const sendNotification = useSendNotification();
  const { mutateMCPServer } = useMCPServer({
    disabled: true,
    owner,
    serverId: mcpServerView.server.sId,
  });

  const { mutate } = useMutateMCPServersViewsForAdmin(owner);

  const updateServer = async (data: PatchMCPServerBody): Promise<boolean> => {
    const response = await fetch(
      `/api/w/${owner.sId}/mcp/${mcpServerView.server.sId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const body = await response.json();
      sendNotification({
        title: `Error updating server`,
        type: "error",
        description: body.error?.message || "An error occurred",
      });

      return false;
    }

    const result: WithAPIErrorResponse<PatchMCPServerResponseBody> =
      await response.json();
    if (isAPIErrorResponse(result)) {
      sendNotification({
        title: `Error updating server`,
        type: "error",
        description: result.error?.message || "An error occurred",
      });
      return false;
    }

    sendNotification({
      title: `${getMcpServerViewDisplayName(mcpServerView)} updated`,
      type: "success",
      description: `${getMcpServerViewDisplayName(mcpServerView)} has been successfully updated.`,
    });

    void mutateMCPServer();
    void mutate();
    return true;
  };

  return { updateServer };
}

/**
 * Hook to update an MCP serverView
 */
export function useUpdateMCPServerView(
  owner: LightWorkspaceType,
  mcpServerView: MCPServerViewType
) {
  const sendNotification = useSendNotification();
  const { mutateMCPServer } = useMCPServer({
    disabled: true,
    owner,
    serverId: mcpServerView.server.sId,
  });

  const { mutate } = useMutateMCPServersViewsForAdmin(owner);

  const updateServerView = async (
    data: PatchMCPServerViewBody
  ): Promise<boolean> => {
    const response = await fetch(
      `/api/w/${owner.sId}/mcp/views/${mcpServerView.sId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const body = await response.json();
      sendNotification({
        title: `Error updating server`,
        type: "error",
        description: body.error?.message || "An error occurred",
      });

      return false;
    }

    const result: WithAPIErrorResponse<PatchMCPServerViewResponseBody> =
      await response.json();
    if (isAPIErrorResponse(result)) {
      sendNotification({
        title: `Error updating server`,
        type: "error",
        description: result.error?.message || "An error occurred",
      });
      return false;
    }

    const serverView = result.serverView;
    sendNotification({
      title: `${getMcpServerViewDisplayName(serverView)} updated`,
      type: "success",
      description: `${getMcpServerViewDisplayName(serverView)} has been successfully updated.`,
    });

    void mutateMCPServer();
    void mutate();
    return true;
  };

  return { updateServerView };
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

  const { mutate } = useMutateMCPServersViewsForAdmin(owner);

  const sendNotification = useSendNotification();
  const createMCPServerConnection = async ({
    connectionId,
    mcpServerId,
    mcpServerDisplayName,
    provider,
  }: {
    connectionId: string;
    mcpServerId: string;
    mcpServerDisplayName: string;
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
          mcpServerId,
          provider,
        }),
      }
    );
    if (response.ok) {
      sendNotification({
        type: "success",
        title: `${mcpServerDisplayName} connected`,
        description: `Successfully connected to ${mcpServerDisplayName}.`,
      });
      void mutateConnections();
      if (connectionType === "workspace") {
        void mutate();
      }
      return response.json();
    } else {
      sendNotification({
        type: "error",
        title: `Failed to connect ${mcpServerDisplayName}`,
        description: `Could not connect to ${mcpServerDisplayName}. Please try again.`,
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

  const { mutate } = useMutateMCPServersViewsForAdmin(owner);

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
          void mutate();
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
      mutate,
    ]
  );

  return { deleteMCPServerConnection };
}

export function useUpdateMCPServerToolsSettings({
  owner,
  mcpServerView,
}: {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
}) {
  const space = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId: mcpServerView.spaceId,
  });
  const { mutateMCPServerViews } = useMCPServerViews({
    owner,
    space: space.spaceInfo ?? undefined,
    disabled: true,
  });

  const sendNotification = useSendNotification();

  const updateToolSettings = async ({
    toolName,
    permission,
    enabled,
  }: {
    toolName: string;
    permission: MCPToolStakeLevelType;
    enabled: boolean;
  }): Promise<PatchMCPServerToolsPermissionsResponseBody> => {
    const body: UpdateMCPToolSettingsBodyType = {
      permission,
      enabled,
    };
    const response = await fetch(
      `/api/w/${owner.sId}/mcp/${mcpServerView.server.sId}/tools/${toolName}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!response.ok) {
      const body = await response.json();
      throw new Error(
        body.error?.message || "Failed to update MCP tool settings"
      );
    }

    sendNotification({
      type: "success",
      title: "Settings updated",
      description: `The settings for ${toolName} have been updated.`,
    });

    void mutateMCPServerViews();
    return response.json();
  };

  return { updateToolSettings };
}

export function useCreatePersonalConnection(owner: LightWorkspaceType) {
  const { createMCPServerConnection } = useCreateMCPServerConnection({
    owner,
    connectionType: "personal",
  });

  const sendNotification = useSendNotification();

  const createPersonalConnection = async ({
    mcpServerId,
    mcpServerDisplayName,
    provider,
    useCase,
    scope,
  }: {
    mcpServerId: string;
    mcpServerDisplayName: string;
    provider: OAuthProvider;
    useCase: OAuthUseCase;
    scope?: string;
  }): Promise<boolean> => {
    try {
      const extraConfig: Record<string, string> = {
        mcp_server_id: mcpServerId,
      };

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
        mcpServerId: mcpServerId,
        mcpServerDisplayName: mcpServerDisplayName,
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

function getMCPServerViewsKey(
  owner: LightWorkspaceType,
  space?: SpaceType,
  availability?: MCPServerAvailability | "all"
) {
  return space
    ? `/api/w/${owner.sId}/spaces/${space.sId}/mcp_views${
        availability ? `?availability=${availability}` : ""
      }`
    : null;
}

export function useMCPServerViews({
  owner,
  space,
  availability,
  disabled,
}: {
  owner: LightWorkspaceType;
  space?: SpaceType;
  availability?: MCPServerAvailability | "all";
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetMCPServerViewsResponseBody> = fetcher;
  const url = getMCPServerViewsKey(owner, space, availability);
  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });
  const serverViews = useMemo(
    () => (data ? data.serverViews.sort(mcpServerViewSortingFn) : []),
    [data]
  );
  return {
    serverViews,
    isMCPServerViewsLoading: !error && !data && !disabled,
    isMCPServerViewsError: error,
    mutateMCPServerViews: mutate,
  };
}

const getOptimisticDataForCreate = (
  data: GetMCPServersResponseBody | undefined,
  server: MCPServerType,
  space: SpaceType
) => {
  if (!data) {
    return { servers: [], success: true as const };
  }
  const mcpServerWithViews = data.servers.find((s) => s.sId === server.sId);

  if (mcpServerWithViews) {
    return {
      ...data,
      servers: [
        ...data.servers.filter((v) => v.sId !== server.sId),
        {
          ...mcpServerWithViews,
          views: [
            ...mcpServerWithViews.views,
            {
              id: -1, // The ID is not known at optimistic data creation time.
              sId: "global",
              name: null,
              description: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              serverType: "internal" as const,
              server,
              editedByUser: null,
              spaceId: space.sId,
              oAuthUseCase: null,
            },
          ],
        },
      ],
    };
  }
  return data;
};

const getOptimisticDataForRemove = (
  data: GetMCPServersResponseBody | undefined,
  serverView: MCPServerViewType
) => {
  if (!data) {
    return { servers: [], success: true as const };
  }

  const mcpServerWithViews = data.servers.find(
    (s) => s.sId === serverView.server.sId
  );

  if (mcpServerWithViews) {
    return {
      ...data,
      servers: [
        ...data.servers.filter((v) => v.sId !== serverView.server.sId),
        {
          ...mcpServerWithViews,
          views: mcpServerWithViews.views.filter(
            (v) => v.sId !== serverView.sId
          ),
        },
      ],
    };
  }
  return data;
};

export function useMCPServersUsage({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetMCPServersUsageResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/mcp/usage`,
    configFetcher,
    {
      disabled,
    }
  );
  return {
    usage: data?.usage ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function useMCPServerViewsNotActivated({
  owner,
  space,
  disabled,
}: {
  owner: LightWorkspaceType;
  space: SpaceType;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetMCPServerViewsNotActivatedResponseBody> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/spaces/${space.sId}/mcp_views/not_activated`,
    configFetcher,
    {
      disabled,
    }
  );
  const serverViews = useMemo(
    () => (data ? data.serverViews.sort(mcpServerViewSortingFn) : []),
    [data]
  );
  return {
    serverViews,
    isMCPServerViewsLoading: !error && !data && !disabled,
    isMCPServerViewsError: error,
    mutateMCPServerViews: mutate,
  };
}

export function useAddMCPServerToSpace(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const { mutateMCPServers } = useMCPServers({
    owner,
  });

  const createView = useCallback(
    async (server: MCPServerType, space: SpaceType): Promise<void> => {
      await mutateMCPServers(
        async (data) => {
          const response = await fetch(
            `/api/w/${owner.sId}/spaces/${space.sId}/mcp_views`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mcpServerId: server.sId }),
            }
          );

          if (!response.ok) {
            const body = await response.json();
            throw new Error(body.error?.message || "Unknown error");
          }

          if (response.ok) {
            sendNotification({
              type: "success",
              title: `Actions added to space ${space.name}`,
              description: `${getMcpServerDisplayName(server)} has been added to the ${space.name} space successfully.`,
            });
          } else {
            sendNotification({
              type: "error",
              title: `Failed to add actions to space ${space.name}`,
              description: `Could not add ${getMcpServerDisplayName(server)} to the ${space.name} space. Please try again.`,
            });
          }
          return getOptimisticDataForCreate(data, server, space);
        },
        {
          optimisticData: (data) => {
            return getOptimisticDataForCreate(data, server, space);
          },
          revalidate: true,
        }
      );
    },
    [sendNotification, owner, mutateMCPServers]
  );

  return { addToSpace: createView };
}

export function useRemoveMCPServerViewFromSpace(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const { mutateMCPServers } = useMCPServers({
    owner,
  });

  const deleteView = useCallback(
    async (serverView: MCPServerViewType, space: SpaceType): Promise<void> => {
      await mutateMCPServers(
        async (data) => {
          const response = await fetch(
            `/api/w/${owner.sId}/spaces/${space.sId}/mcp_views/${serverView.sId}`,
            {
              method: "DELETE",
            }
          );

          if (response.ok) {
            sendNotification({
              type: "success",
              title:
                space.kind === "system"
                  ? "Action removed from workspace"
                  : "Action removed from space",
              description: `${getMcpServerDisplayName(serverView.server)} has been removed from the ${space.name} space successfully.`,
            });
          } else {
            const res = await response.json();
            sendNotification({
              type: "error",
              title: "Failed to remove action",
              description:
                res.error?.message ||
                `Could not remove ${getMcpServerDisplayName(serverView.server)} from the ${space.name} space. Please try again.`,
            });
          }

          return getOptimisticDataForRemove(data, serverView);
        },
        {
          optimisticData: (data) => {
            return getOptimisticDataForRemove(data, serverView);
          },
          revalidate: true,
        }
      );
    },
    [sendNotification, owner, mutateMCPServers]
  );

  return { removeFromSpace: deleteView };
}

function useMCPServerViewsFromSpacesBase(
  owner: LightWorkspaceType,
  spaces: SpaceType[],
  availabilities: MCPServerAvailability[],
  swrOptions?: SWRConfiguration
) {
  const configFetcher: Fetcher<GetMCPServerViewsListResponseBody> = fetcher;

  const spaceIds = spaces.map((s) => s.sId).join(",");
  const availabilitiesParam = availabilities.join(",");

  const url = `/api/w/${owner.sId}/mcp/views?spaceIds=${spaceIds}&availabilities=${availabilitiesParam}`;
  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled: !spaces.length,
    ...swrOptions,
  });

  return {
    serverViews: data?.serverViews ?? emptyArray(),
    isLoading: !error && !data && spaces.length !== 0,
    isError: error,
    mutateServerViews: mutate,
  };
}

export function useMCPServerViewsFromSpaces(
  owner: LightWorkspaceType,
  spaces: SpaceType[],
  swrOptions?: SWRConfiguration & { disabled?: boolean }
) {
  return useMCPServerViewsFromSpacesBase(
    owner,
    spaces,
    ["manual", "auto"],
    swrOptions
  );
}

// Note from seb: the name is misleading as manual will return both internal and remote servers. (all remote are manual, some internals are manual too).
export function useRemoteMCPServerViewsFromSpaces(
  owner: LightWorkspaceType,
  spaces: SpaceType[],
  swrOptions?: SWRConfiguration & { disabled?: boolean }
) {
  return useMCPServerViewsFromSpacesBase(owner, spaces, ["manual"], swrOptions);
}

// Note from seb: on the flip side, auto will return only internal servers but not all of them so the name is also misleading.
export function useInternalMCPServerViewsFromSpaces(
  owner: LightWorkspaceType,
  spaces: SpaceType[],
  swrOptions?: SWRConfiguration & { disabled?: boolean }
) {
  return useMCPServerViewsFromSpacesBase(owner, spaces, ["auto"], swrOptions);
}

export function useMCPServerViewsWithPersonalConnections({
  owner,
  mcpServerViewToCheckIds,
  mcpServerViews,
}: {
  owner: LightWorkspaceType;
  mcpServerViewToCheckIds: string[];
  mcpServerViews: MCPServerViewType[];
}): {
  mcpServerView: MCPServerViewType;
  isAlreadyConnected: boolean;
}[] {
  const mcpServerViewsMap = new Map(mcpServerViews.map((v) => [v.sId, v]));

  const mcpServerViewsWithPersonalConnections = removeNulls(
    mcpServerViewToCheckIds.map((id) => {
      const mcpServerView = mcpServerViewsMap.get(id);
      if (mcpServerView?.oAuthUseCase === "personal_actions") {
        return mcpServerView;
      }
      return null;
    })
  );

  const { connections } = useMCPServerConnections({
    owner,
    connectionType: "personal",
    disabled: mcpServerViewsWithPersonalConnections.length === 0,
  });

  return useMemo(
    () =>
      mcpServerViewsWithPersonalConnections.length === 0
        ? emptyArray()
        : mcpServerViewsWithPersonalConnections.map((mcpServerView) => {
            const isAlreadyConnected = connections.some(
              (c) =>
                c.internalMCPServerId === mcpServerView.server.sId ||
                c.remoteMCPServerId === mcpServerView.server.sId
            );
            return { mcpServerView, isAlreadyConnected };
          }),
    [connections, mcpServerViewsWithPersonalConnections]
  );
}
