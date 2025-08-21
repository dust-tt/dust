import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPendingValidationsResponseType } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/pending-validations";

export function usePendingValidations({
  conversationId,
  workspaceId,
}: {
  conversationId: string | null;
  workspaceId: string;
}) {
  const pendingValidationsFetcher: Fetcher<GetPendingValidationsResponseType> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/pending-validations`
      : null,
    pendingValidationsFetcher,
    { disabled: conversationId === null }
  );

  return {
    pendingValidations: data?.pendingValidations || [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
