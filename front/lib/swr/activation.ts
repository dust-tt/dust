import { useSendNotification } from "@app/hooks/useNotification";
import type { GetActivationRecommendationsResponseBody } from "@app/lib/api/activation/recommendations";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useActivationRecommendations({
  workspaceId,
  podId,
  disabled,
}: {
  workspaceId: string;
  podId?: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const recommendationsFetcher: Fetcher<GetActivationRecommendationsResponseBody> =
    fetcher;

  const url = podId
    ? `/api/w/${workspaceId}/activation-recommendations?podId=${podId}`
    : `/api/w/${workspaceId}/activation-recommendations`;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    url,
    recommendationsFetcher,
    { disabled }
  );

  return {
    recommendations: data?.recommendations ?? emptyArray(),
    isRecommendationsLoading: disabled ? false : isLoading,
    isRecommendationsError: !!error,
    mutateRecommendations: mutate,
  };
}

export function useUpdateActivationRecommendation({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const updateRecommendation = useCallback(
    async (
      recommendationId: string,
      body: { status: "executed" | "dismissed" }
    ): Promise<boolean> => {
      try {
        const res = await clientFetch(
          `/api/w/${workspaceId}/activation-recommendations/${recommendationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const errorData = await getErrorFromResponse(res);
          sendNotification({
            type: "error",
            title: "Failed to update action recommendation",
            description: errorData.message,
          });
          return false;
        }

        return true;
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to update action recommendation",
        });
        return false;
      }
    },
    [workspaceId, sendNotification]
  );

  return { updateRecommendation };
}
