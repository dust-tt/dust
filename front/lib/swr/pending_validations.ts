import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";

export function usePendingValidations({
  conversationId,
  workspaceId,
}: {
  conversationId: string | null;
  workspaceId: string;
}) {
  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/pending-validations`
      : null,
    fetcher,
    { disabled: conversationId === null }
  );

  return {
    pendingValidations: data?.pendingValidations || [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
