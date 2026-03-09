import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import logger from "@app/logger/logger";
import type {
  ConversationToolActionRequest,
  FetchConversationToolsResponse,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/tools";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

export function useConversationTools({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId?: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const { fetcher } = useFetcher();
  const conversationToolsFetcher: Fetcher<FetchConversationToolsResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/tools`
      : null,
    conversationToolsFetcher,
    { ...options, focusThrottleInterval: 30 * 60 * 1000 } // 30 minutes
  );

  return {
    conversationTools: useMemo(
      () =>
        data
          ? data.tools
          : emptyArray<FetchConversationToolsResponse["tools"][number]>(),
      [data]
    ),
    isConversationToolsLoading: !error && !data,
    isConversationToolsError: error,
    mutateConversationTools: mutate,
  };
}

export function useAddDeleteConversationTool({
  conversationId,
  workspaceId,
}: {
  conversationId?: string | null;
  workspaceId: string;
}) {
  const { mutateConversationTools } = useConversationTools({
    conversationId,
    workspaceId,
    options: {
      disabled: true,
    },
  });

  const addTool = useCallback(
    async (mcpServerViewId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/tools`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "add",
              mcp_server_view_id: mcpServerViewId,
            } satisfies ConversationToolActionRequest),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to add tool to conversation");
        }

        const result = await response.json();
        if (result.success) {
          // Refetch the tools list to get the updated state
          void mutateConversationTools();
          return true;
        }

        return false;
      } catch (err) {
        logger.error({ err }, "Error adding tool to conversation");
        return false;
      }
    },
    [conversationId, workspaceId, mutateConversationTools]
  );

  const deleteTool = useCallback(
    async (mcpServerViewId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/tools`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "delete",
              mcp_server_view_id: mcpServerViewId,
            } satisfies ConversationToolActionRequest),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to remove tool from conversation");
        }

        const result = await response.json();
        if (result.success) {
          // Refetch the tools list to get the updated state
          void mutateConversationTools();
          return true;
        }

        return false;
      } catch (err) {
        logger.error({ err }, "Error removing tool from conversation");
        return false;
      }
    },
    [conversationId, workspaceId, mutateConversationTools]
  );

  return { addTool, deleteTool };
}
