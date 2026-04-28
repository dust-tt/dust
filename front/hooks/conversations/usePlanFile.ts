import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationPlanModeResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/plan_mode";
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
    planFile: data?.planFile ?? null,
    content: data?.content ?? null,
    approvalState: data?.approvalState ?? "draft",
    isPlanLoading: conversationId != null && !error && !data,
    isPlanError: error,
    mutatePlan: mutate,
  };
}
