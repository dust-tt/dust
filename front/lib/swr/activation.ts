import { useSendNotification } from "@app/hooks/useNotification";
import type { GetActivationNudgeSettingsResponseBody } from "@app/lib/api/activation/nudge_settings";
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
    ? `/api/w/${workspaceId}/action-recommendations?podId=${podId}`
    : `/api/w/${workspaceId}/action-recommendations`;

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

export function useActivationNudgeSettings({
  workspaceId,
  podId,
  disabled,
}: {
  workspaceId: string;
  podId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const settingsFetcher: Fetcher<GetActivationNudgeSettingsResponseBody> =
    fetcher;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/spaces/${podId}/activation_nudges`,
    settingsFetcher,
    { disabled }
  );

  return {
    activationNudgeSettings: data?.activationNudgeSettings ?? null,
    isActivationNudgeSettingsLoading: disabled ? false : isLoading,
    isActivationNudgeSettingsError: !!error,
    mutateActivationNudgeSettings: mutate,
  };
}

export function useUpdateActivationNudgeSettings({
  workspaceId,
  podId,
}: {
  workspaceId: string;
  podId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateActivationNudgeSettings } = useActivationNudgeSettings({
    workspaceId,
    podId,
    disabled: true,
  });

  const updateNudgeSettings = useCallback(
    async (nudgesEnabled: boolean): Promise<boolean> => {
      const res = await clientFetch(
        `/api/w/${workspaceId}/spaces/${podId}/activation_nudges`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nudgesEnabled }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to update Dust check-ins",
          description: errorData.message,
        });
        return false;
      }

      void mutateActivationNudgeSettings();
      return true;
    },
    [workspaceId, podId, sendNotification, mutateActivationNudgeSettings]
  );

  return { updateNudgeSettings };
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
          `/api/w/${workspaceId}/action-recommendations/${recommendationId}`,
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
