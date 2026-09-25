import type { GetActivationPodResponseBody } from "@app/lib/api/activation/recommendations";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

// The current user's activation pod, optionally scoped to a specific pod sId.
export function useActivationPod({
  workspaceId,
  podId,
  disabled,
}: {
  workspaceId: string;
  podId?: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const podFetcher: Fetcher<GetActivationPodResponseBody> = fetcher;

  const url = podId
    ? `/api/w/${workspaceId}/activation-pod?podId=${podId}`
    : `/api/w/${workspaceId}/activation-pod`;

  const { data, error, isLoading } = useSWRWithDefaults(url, podFetcher, {
    disabled,
    revalidateOnFocus: false,
  });

  return {
    activationPodId: data?.podId ?? null,
    podKind: data?.kind ?? null,
    isActivationPodLoading: disabled ? false : isLoading,
    isActivationPodError: !!error,
  };
}
