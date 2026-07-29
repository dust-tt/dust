import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetConversationGoalResponseBody } from "@app/types/api/assistant/goal";
import { PatchConversationGoalResponseBodySchema } from "@app/types/api/assistant/goal";
import type { GoalUserAction } from "@app/types/assistant/goal";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";

export function conversationGoalKey({
  workspaceId,
  conversationId,
  branchId,
}: {
  workspaceId: string;
  conversationId: string;
  branchId: string | null;
}): string {
  const base = `/api/w/${workspaceId}/assistant/conversations/${conversationId}/goal`;
  return branchId ? `${base}?branchId=${encodeURIComponent(branchId)}` : base;
}

export function useConversationGoal({
  conversationId,
  workspaceId,
  branchId,
}: {
  conversationId: string | null;
  workspaceId: string;
  branchId: string | null;
}) {
  const { fetcher } = useFetcher();
  const goalFetcher: Fetcher<GetConversationGoalResponseBody> = fetcher;
  const sendNotification = useSendNotification();
  const [pendingAction, setPendingAction] = useState<GoalUserAction | null>(
    null
  );
  const key = conversationId
    ? conversationGoalKey({ workspaceId, conversationId, branchId })
    : null;
  const { data, error, mutate } = useSWRWithDefaults(key, goalFetcher, {
    refreshInterval: (latest) =>
      latest?.goal?.status === "active" ? 2_000 : 0,
  });

  const updateGoal = useCallback(
    async (action: GoalUserAction): Promise<boolean> => {
      if (!key) {
        return false;
      }

      setPendingAction(action);
      try {
        const response = await clientFetch(key, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, branchId }),
        });
        if (!response.ok) {
          const apiError = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to update goal",
            description: apiError.message,
          });
          return false;
        }

        const updated = PatchConversationGoalResponseBodySchema.safeParse(
          await response.json()
        );
        if (!updated.success) {
          sendNotification({
            type: "error",
            title: "Failed to update goal",
            description: "The server returned an invalid response.",
          });
          return false;
        }
        await mutate(updated.data, { revalidate: false });
        return true;
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to update goal",
          description: normalizeError(error).message,
        });
        return false;
      } finally {
        setPendingAction(null);
      }
    },
    [branchId, key, mutate, sendNotification]
  );

  return {
    goal: data?.goal ?? null,
    canManage: data?.canManage ?? false,
    isGoalLoading: conversationId !== null && !data && !error,
    isGoalError: error,
    pendingAction,
    updateGoal,
  };
}
