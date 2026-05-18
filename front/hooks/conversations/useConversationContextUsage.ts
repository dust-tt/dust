import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationContextUsageResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/context-usage";
import { useMemo, useRef } from "react";
import type { Fetcher } from "swr";

export const CONTEXT_USAGE_PERCENT_THRESHOLDS = {
  enable_compaction: 33,
  show_warning: 70,
  force_compaction: 80,
};

export function useConversationContextUsage({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId?: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const { fetcher } = useFetcher();
  const contextUsageFetcher: Fetcher<GetConversationContextUsageResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/context-usage`
      : null,
    contextUsageFetcher,
    options
  );

  const lastValidPercentageRef = useRef<number>(0);

  const percentage = useMemo(() => {
    if (
      data &&
      data.contextUsage !== null &&
      data.contextSize !== null &&
      data.contextSize > 0
    ) {
      const computed = Math.round((data.contextUsage / data.contextSize) * 100);
      lastValidPercentageRef.current = computed;
      return computed;
    }
    // API is in pending state (new run has no usages yet) — keep the last
    // known value to avoid a jarring drop to 0% while the message processes.
    return lastValidPercentageRef.current;
  }, [data]);

  return {
    contextUsage: data ?? null,
    contextUsagePercentage: percentage,
    isContextUsageLoading: !error && !data,
    isContextUsageError: error,
    mutateContextUsage: mutate,
  };
}
