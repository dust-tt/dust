import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetTrialMessageUsageResponseType } from "@app/pages/api/w/[wId]/trial-message-usage";
import type { Fetcher } from "swr";

export function useTrialMessageUsage({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const usageFetcher: Fetcher<GetTrialMessageUsageResponseType> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/trial-message-usage`,
    usageFetcher,
    {
      disabled,
    }
  );

  return {
    messageUsage: data ?? null,
    isMessageUsageLoading: !error && !data && !disabled,
    isMessageUsageError: error,
    mutateMessageUsage: mutate,
  };
}
