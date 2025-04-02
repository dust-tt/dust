import { useSendNotification } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { MCPServerViewType } from "@app/lib/resources/mcp_server_view_resource";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { DeleteMCPServerResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]";
import type {
  GetMCPServerViewsResponseBody,
  PostMCPServerViewResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/mcp_views";
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
  const serverViews = useMemo(() => (data ? data.serverViews : []), [data]);
  return {
    serverViews,
    isMCPServerViewsLoading: !error && !data && !disabled,
    isMCPServerViewsError: error,
    mutateMCPServerViews: mutate,
  };
}

export function useAddMCPServerToSpace(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();

  const createView = useCallback(
    async (
      server: MCPServerType,
      space: SpaceType
    ): Promise<PostMCPServerViewResponseBody> => {
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
          description: "Could not add actions to the space. Please try again.",
        });
      }

      return response.json();
    },
    [sendNotification, owner]
  );

  return { addToSpace: createView };
}

export function useRemoveMCPServerViewFromSpace(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();

  const deleteView = useCallback(
    async (
      serverView: MCPServerViewType,
      space: SpaceType
    ): Promise<DeleteMCPServerResponseBody> => {
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

      return response.json();
    },
    [sendNotification, owner]
  );

  return { removeFromSpace: deleteView };
}
