import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetPodFunctionFrameUsageResponseBody,
  GetPodFunctionLastFailureResponseBody,
  GetPodFunctionsResponseBody,
  PodFunctionType,
} from "@app/types/api/sandbox_functions";
import { useMemo } from "react";
import type { Fetcher } from "swr";

function podFunctionsUrl(workspaceId: string, podId: string) {
  return `/api/w/${workspaceId}/spaces/${podId}/sandbox-functions`;
}

export function usePodFunctions({
  workspaceId,
  podId,
  disabled,
}: {
  workspaceId: string;
  podId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const functionsFetcher: Fetcher<GetPodFunctionsResponseBody> = fetcher;

  const isDisabled = disabled || !podId;
  const { data, error, mutate } = useSWRWithDefaults(
    podId ? podFunctionsUrl(workspaceId, podId) : null,
    functionsFetcher,
    { disabled: isDisabled }
  );

  return {
    podFunctions: data?.functions ?? emptyArray<PodFunctionType>(),
    isPodFunctionsLoading: !error && !data && !isDisabled,
    isPodFunctionsError: !!error,
    mutatePodFunctions: mutate,
  };
}

/**
 * Which published frames of the pod call each function. Fetched separately from the listing: it
 * reads a bundle per frame, so the tab renders from the listing and fills usage in after.
 */
export function usePodFunctionFrameUsage({
  workspaceId,
  podId,
  disabled,
}: {
  workspaceId: string;
  podId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const usageFetcher: Fetcher<GetPodFunctionFrameUsageResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `${podFunctionsUrl(workspaceId, podId)}/frame-usage`,
    usageFetcher,
    { disabled }
  );

  const framesByFunctionId = useMemo(
    () =>
      new Map(
        (data?.usage ?? []).map(({ functionId, frames }) => [
          functionId,
          frames,
        ])
      ),
    [data]
  );

  return {
    framesByFunctionId,
    isFrameUsageLoading: !error && !data && !disabled,
    isFrameUsageError: !!error,
    mutateFrameUsage: mutate,
  };
}

export function usePodFunctionLastFailure({
  workspaceId,
  podId,
  functionId,
  disabled,
}: {
  workspaceId: string;
  podId: string;
  functionId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const failureFetcher: Fetcher<GetPodFunctionLastFailureResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `${podFunctionsUrl(workspaceId, podId)}/${functionId}/last-failure`,
    failureFetcher,
    { disabled }
  );

  return {
    // Null covers both "never failed" and "that run isn't yours to see"; the caller knows from
    // the pod-wide activity which one it is looking at.
    failure: data?.failure ?? null,
    isFailureLoading: !error && !data && !disabled,
    isFailureError: !!error,
    mutateFailure: mutate,
  };
}
