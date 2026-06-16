import type { GetFairUseCreditsResponseBody } from "@app/lib/metronome/user_block";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function useFairUseCredits({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const fairUseCreditsFetcher: Fetcher<GetFairUseCreditsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/fair-use-credits`,
    fairUseCreditsFetcher,
    {
      disabled,
    }
  );

  return {
    fairUseAwuCreditsState: data?.fairUseAwuCreditsState ?? null,
    isFairUseCreditsLoading: !error && !data && !disabled,
    isFairUseCreditsError: error,
    mutateFairUseCredits: mutate,
  };
}
