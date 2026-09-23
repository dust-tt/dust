import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetHomepageUseCasesResponseBody } from "@app/types/api/homepage_use_cases";
import type { Fetcher } from "swr";

const USE_CASES_DEDUPING_INTERVAL_MS = 30 * 60 * 1000;

interface UseHomepageUseCasesOptions {
  workspaceId: string;
}

export function useHomepageUseCases({
  workspaceId,
}: UseHomepageUseCasesOptions) {
  const { fetcher } = useFetcher();
  const useCasesFetcher: Fetcher<GetHomepageUseCasesResponseBody> = fetcher;
  const { data, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/homepage_use_cases`,
    useCasesFetcher,
    {
      dedupingInterval: USE_CASES_DEDUPING_INTERVAL_MS,
      revalidateOnFocus: false,
    }
  );

  return {
    useCases: data?.useCases ?? emptyArray(),
    isUseCasesLoading: isLoading,
  };
}
