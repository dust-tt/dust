import { useSendNotification } from "@app/hooks/useNotification";
import type {
  GetActivationPodResponseBody,
  GetActivationRecommendationsResponseBody,
} from "@app/lib/api/activation/recommendations";
import type { GetActivationWorkAreasResponseBody } from "@app/lib/api/activation/work_areas";
import { clientFetch } from "@app/lib/egress/client";
import type { ActivationWorkAreaStatus } from "@app/lib/models/activation/activation_work_area";
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
  status,
  disabled,
}: {
  workspaceId: string;
  podId?: string;
  status?: "suggested" | "executed";
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const recommendationsFetcher: Fetcher<GetActivationRecommendationsResponseBody> =
    fetcher;

  const params = new URLSearchParams();
  if (podId) {
    params.set("podId", podId);
  }
  if (status) {
    params.set("status", status);
  }
  const queryString = params.toString();
  const url = queryString
    ? `/api/w/${workspaceId}/activation-recommendations?${queryString}`
    : `/api/w/${workspaceId}/activation-recommendations`;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    url,
    recommendationsFetcher,
    { disabled, revalidateOnFocus: false }
  );

  return {
    recommendations: data?.recommendations ?? emptyArray(),
    isRecommendationsLoading: disabled ? false : isLoading,
    isRecommendationsError: !!error,
    mutateRecommendations: mutate,
  };
}

export function useActivationPod({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const podFetcher: Fetcher<GetActivationPodResponseBody> = fetcher;

  const { data, error, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/activation-pod`,
    podFetcher,
    { disabled, revalidateOnFocus: false }
  );

  return {
    activationPodId: data?.podId ?? null,
    isActivationPodLoading: disabled ? false : isLoading,
    isActivationPodError: !!error,
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

export function useActivationWorkAreas({
  workspaceId,
  podId,
  status,
  disabled,
}: {
  workspaceId: string;
  podId?: string;
  status?: ActivationWorkAreaStatus;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const workAreasFetcher: Fetcher<GetActivationWorkAreasResponseBody> = fetcher;

  const params = new URLSearchParams();
  if (podId) {
    params.set("podId", podId);
  }
  if (status) {
    params.set("status", status);
  }
  const queryString = params.toString();
  const url = queryString
    ? `/api/w/${workspaceId}/activation-work-areas?${queryString}`
    : `/api/w/${workspaceId}/activation-work-areas`;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    url,
    workAreasFetcher,
    { disabled, revalidateOnFocus: false }
  );

  return {
    workAreas: data?.workAreas ?? emptyArray(),
    isWorkAreasLoading: disabled ? false : isLoading,
    isWorkAreasError: !!error,
    mutateWorkAreas: mutate,
  };
}

export function useUpdateActivationWorkArea({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const updateWorkArea = useCallback(
    async (
      workAreaId: string,
      body: {
        status?: ActivationWorkAreaStatus;
        title?: string;
        description?: string;
      }
    ): Promise<boolean> => {
      try {
        const res = await clientFetch(
          `/api/w/${workspaceId}/activation-work-areas/${workAreaId}`,
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
            title: "Failed to update work area",
            description: errorData.message,
          });
          return false;
        }

        return true;
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to update work area",
        });
        return false;
      }
    },
    [workspaceId, sendNotification]
  );

  return { updateWorkArea };
}
