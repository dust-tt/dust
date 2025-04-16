import { useSendNotification } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServers } from "@app/lib/swr/mcp_servers";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetMCPServersResponseBody } from "@app/pages/api/w/[wId]/mcp";
import type { GetMCPServerViewsListResponseBody } from "@app/pages/api/w/[wId]/mcp/views";
import type { GetMCPServerViewsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/mcp_views";
import type { GetMCPServerViewsNotActivatedResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/mcp_views/not_activated";
import type { LightWorkspaceType, SpaceType } from "@app/types";

function getMCPServerViewsKey(owner: LightWorkspaceType, space?: SpaceType) {
  return space ? `/api/w/${owner.sId}/spaces/${space.sId}/mcp_views` : null;
}

export function useMCPServerViews({
  owner,
  space,
  disabled,
}: {
  owner: LightWorkspaceType;
  space?: SpaceType;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetMCPServerViewsResponseBody> = fetcher;
  const url = getMCPServerViewsKey(owner, space);
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
    return { servers: [], success: true };
  }
  const mcpServerWithViews = data.servers.find((s) => s.id === server.id);

  if (mcpServerWithViews) {
    return {
      ...data,
      servers: [
        ...data.servers.filter((v) => v.id !== server.id),
        {
          ...mcpServerWithViews,
          views: [
            ...mcpServerWithViews.views,
            {
              id: "global",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              server,
              editedByUser: null,
              spaceId: space.sId,
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
    return { servers: [], success: true };
  }

  const mcpServerWithViews = data.servers.find(
    (s) => s.id === serverView.server.id
  );

  if (mcpServerWithViews) {
    return {
      ...data,
      servers: [
        ...data.servers.filter((v) => v.id !== serverView.server.id),
        {
          ...mcpServerWithViews,
          views: mcpServerWithViews.views.filter((v) => v.id !== serverView.id),
        },
      ],
    };
  }
  return data;
};

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
              body: JSON.stringify({ mcpServerId: server.id }),
            }
          );

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.api_error?.message || "Unknown error");
          }

          if (response.ok) {
            sendNotification({
              type: "success",
              title: `Actions added to space ${space.name}`,
              description:
                "Your actions have been added to the space successfully.",
            });
          } else {
            sendNotification({
              type: "error",
              title: `Failed to add actions to space ${space.name}`,
              description:
                "Could not add actions to the space. Please try again.",
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
      void mutateMCPServers(
        async (data) => {
          const response = await fetch(
            `/api/w/${owner.sId}/spaces/${space.sId}/mcp_views/${serverView.id}`,
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
              description:
                "Your actions have been removed from the space successfully.",
            });
          } else {
            sendNotification({
              type: "error",
              title: "Failed to remove action",
              description: `Could not remove actions from the space ${space.name}. Please try again.`,
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

// this is a post request to get the mcp server views from the spaces
export function useMCPServerViewsFromSpaces(
  owner: LightWorkspaceType,
  spaces: SpaceType[]
) {
  const configFetcher: Fetcher<GetMCPServerViewsListResponseBody> = fetcher;
  const url = `/api/w/${owner.sId}/mcp/views?spaceIds=${spaces.map((s) => s.sId).join(",")}`;
  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled: !spaces.length,
  });

  return {
    serverViews: data?.serverViews,
    isLoading: !error && !data && !spaces.length,
    isError: error,
    mutateServerViews: mutate,
  };
}
