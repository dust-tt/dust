import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetConversationPlanModeResponseBody } from "@app/types/api/assistant/plan_mode";
import { useCallback, useState } from "react";
import { type Fetcher, useSWRConfig } from "swr";

export function planFileKey({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `/api/w/${workspaceId}/assistant/conversations/${conversationId}/plan_mode`;
}

export function usePlanFile({
  conversationId,
  workspaceId,
}: {
  conversationId: string | null;
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const planFetcher: Fetcher<GetConversationPlanModeResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId ? planFileKey({ workspaceId, conversationId }) : null,
    planFetcher
  );

  return {
    content: data?.content ?? null,
    isPlanLoading: conversationId != null && !error && !data,
    isPlanError: error,
    mutatePlan: mutate,
  };
}

export function useClosePlan({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string | null;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();
  const [isClosing, setIsClosing] = useState(false);

  const closePlan = useCallback(async (): Promise<boolean> => {
    if (!conversationId) {
      return false;
    }

    setIsClosing(true);
    try {
      const key = planFileKey({ workspaceId, conversationId });
      const res = await clientFetch(key, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to close plan",
          description: errorData.message,
        });
        return false;
      }

      // Write the cache directly instead of refetching: a refetch could race a quick subsequent
      // create and leave a stale null.
      await mutate(key, { content: null }, { revalidate: false });
      return true;
    } finally {
      setIsClosing(false);
    }
  }, [workspaceId, conversationId, sendNotification, mutate]);

  return { closePlan, isClosing };
}
