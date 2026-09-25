import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetHomepageUseCasesResponseBody } from "@app/types/api/homepage_use_cases";
import { useCallback } from "react";
import type { Fetcher } from "swr";

const USE_CASES_DEDUPING_INTERVAL_MS = 30 * 60 * 1000;

interface UseHomepageUseCasesOptions {
  disabled?: boolean;
  workspaceId: string;
}

export function useHomepageUseCases({
  disabled,
  workspaceId,
}: UseHomepageUseCasesOptions) {
  const { fetcher } = useFetcher();
  const useCasesFetcher: Fetcher<GetHomepageUseCasesResponseBody> = fetcher;
  const { data, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/homepage_use_cases`,
    useCasesFetcher,
    {
      dedupingInterval: USE_CASES_DEDUPING_INTERVAL_MS,
      disabled,
      revalidateOnFocus: false,
    }
  );

  return {
    useCases: data?.useCases ?? emptyArray(),
    isUseCasesLoading: isLoading && !disabled,
    mutateUseCases: mutate,
  };
}

export function useDismissHomepageUseCase({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateUseCases } = useHomepageUseCases({
    disabled: true,
    workspaceId,
  });

  return useCallback(
    async (useCaseId: string): Promise<void> => {
      const res = await clientFetch(
        `/api/w/${workspaceId}/assistant/homepage_use_cases/dismissals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ useCaseId }),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to hide the suggestion.",
          description: errorData.message,
        });
        return;
      }

      void mutateUseCases(
        (current) =>
          current && {
            useCases: current.useCases.filter(({ id }) => id !== useCaseId),
          },
        { revalidate: false }
      );
    },
    [mutateUseCases, sendNotification, workspaceId]
  );
}
