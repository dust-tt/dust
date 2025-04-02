import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  AllowedFilter,
  CreateMCPServerResponseBody,
  GetMCPServersResponseBody,
} from "@app/pages/api/w/[wId]/mcp";
import type {
  DeleteMCPServerResponseBody,
  PatchMCPServerResponseBody,
} from "@app/pages/api/w/[wId]/mcp/[serverId]";
import type { SyncMCPServerResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]/sync";
import type {
  GetConnectionsResponseBody,
  PostConnectionResponseBody,
} from "@app/pages/api/w/[wId]/mcp/connections";
import type { LightWorkspaceType } from "@app/types";

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
  const serverFetcher: Fetcher<GetMCPServersResponseBody> = fetcher;

  const url = serverId ? `/api/w/${owner.sId}/mcp/${serverId}` : null;

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
    server: data?.servers || null,
    isServerLoading: !error && !data,
    isServerError: !!error,
    mutateServer: mutate,
  };
}

export function useMCPServers({
  owner,
  filter,
  disabled,
}: {
  owner: LightWorkspaceType;
  filter: AllowedFilter;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetMCPServersResponseBody> = fetcher;

  const url = `/api/w/${owner.sId}/mcp?filter=${filter}`;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });

  const mcpServers = useMemo(() => (data ? data.servers : []), [data]);

  return {
    mcpServers,
    isMCPServersLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

/**
 * Hook to delete an MCP server
 */
export function useDeleteMCPServer(owner: LightWorkspaceType) {
  //TODO(mcp) mutate also "all"
  const { mutate: mutateServers } = useMCPServers({
    disabled: true,
    owner,
    filter: "remote",
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

    void mutateServers();
    return response.json();
  };

  return { deleteServer };
}

/**
 * Hook to create a new MCP server from a URL
 */
export function useCreateRemoteMCPServer(owner: LightWorkspaceType) {
  //TODO(mcp) mutate also "all"
  const { mutate: mutateServers } = useMCPServers({
    disabled: true,
    owner,
    filter: "remote",
  });

  const createWithUrlSync = async (
    url: string
  ): Promise<CreateMCPServerResponseBody> => {
    const response = await fetch(`/api/w/${owner.sId}/mcp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

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
  serverId: string
) {
  const { mutateServer } = useMCPServer({
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
  serverId: string
) {
  const { mutateServer } = useMCPServer({
    disabled: true,
    owner,
    serverId,
  });

  const updateServer = async (data: {
    name: string;
    url: string;
    description: string;
    tools: { name: string; description: string }[];
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
