import type { GetTrialMessageUsageResponseType } from "@app/lib/api/assistant/rate_limits";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
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
