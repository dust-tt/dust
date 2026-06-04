import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationCreditCostResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/credit-cost";
import type { Fetcher } from "swr";

export function useConversationCreditCost({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId?: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const { fetcher } = useFetcher();
  const creditCostFetcher: Fetcher<GetConversationCreditCostResponse> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/credit-cost`
      : null,
    creditCostFetcher,
    options
  );

  return {
    totalCostCredits: data?.totalCostCredits ?? null,
    isCreditCostLoading: !error && !data && !options?.disabled,
    isCreditCostError: error,
    mutateCreditCost: mutate,
  };
}
