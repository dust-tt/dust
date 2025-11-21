import type { Fetcher } from "swr";

import { emptyArray } from "@app/lib/swr/swr";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetCreditsResponseBody } from "@app/types/credits";

export function useCredits({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const creditsFetcher: Fetcher<GetCreditsResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/credits`,
    creditsFetcher,
    { disabled }
  );

  return {
    credits: data?.credits ?? emptyArray(),
    isCreditsLoading: !error && !data && !disabled,
    isCreditsValidating: isValidating,
    isCreditsError: error,
    mutateCredits: mutate,
  };
}
