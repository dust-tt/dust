import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationPlanModeResponseBody } from "@app/types/api/assistant/plan_mode";
import type { Fetcher } from "swr";

export function planFileKey({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}): string {
  return `/api/w/${workspaceId}/assistant/conversations/${conversationId}/plan_mode`;
}

export function usePlanFile({
  conversationId,
  workspaceId,
}: {
  conversationId: string | null;
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const planFetcher: Fetcher<GetConversationPlanModeResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId ? planFileKey({ workspaceId, conversationId }) : null,
    planFetcher
  );

  return {
    content: data?.content ?? null,
    isPlanLoading: conversationId != null && !error && !data,
    isPlanError: error,
    mutatePlan: mutate,
  };
}
