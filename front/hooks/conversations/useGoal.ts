import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationGoalResponseBody } from "@app/types/api/assistant/goal";
import type { Fetcher } from "swr";

export function conversationGoalKey({
  workspaceId,
  conversationId,
  branchId,
}: {
  workspaceId: string;
  conversationId: string;
  branchId: string | null;
}): string {
  const base = `/api/w/${workspaceId}/assistant/conversations/${conversationId}/goal`;
  return branchId ? `${base}?branchId=${encodeURIComponent(branchId)}` : base;
}

export function useConversationGoal({
  conversationId,
  workspaceId,
  branchId,
}: {
  conversationId: string | null;
  workspaceId: string;
  branchId: string | null;
}) {
  const { fetcher } = useFetcher();
  const goalFetcher: Fetcher<GetConversationGoalResponseBody> = fetcher;
  const key = conversationId
    ? conversationGoalKey({ workspaceId, conversationId, branchId })
    : null;
  const { data, error } = useSWRWithDefaults(key, goalFetcher, {
    refreshInterval: (latest) =>
      latest?.goal?.status === "active" ? 2_000 : 0,
  });

  return {
    goal: data?.goal ?? null,
    isGoalLoading: conversationId !== null && !data && !error,
    isGoalError: error,
  };
}
