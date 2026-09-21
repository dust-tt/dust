import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  GetOngoingAgentLoopsResponseBody,
  OngoingAgentLoopType,
} from "@app/types/api/assistant/conversation/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback } from "react";
import type { Fetcher } from "swr";

const ONGOING_AGENT_LOOPS_REFRESH_INTERVAL_MS = 10_000;

interface UseOngoingAgentLoopsOptions {
  workspaceId: string;
  onSuccess: (agentLoops: OngoingAgentLoopType[]) => void;
}

export function useOngoingAgentLoops({
  workspaceId,
  onSuccess,
}: UseOngoingAgentLoopsOptions) {
  const { fetcher } = useFetcher();
  const agentLoopsFetcher: Fetcher<GetOngoingAgentLoopsResponseBody> = fetcher;
  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/ongoing-agent-loops`,
    agentLoopsFetcher,
    {
      onSuccess: ({ agentLoops }) => onSuccess(agentLoops),
      refreshInterval: ONGOING_AGENT_LOOPS_REFRESH_INTERVAL_MS,
      refreshWhenHidden: true,
    }
  );
  const refreshOngoingAgentLoops = useCallback(() => {
    void mutate().catch((error: unknown) => {
      datadogLogger.warn(
        { err: normalizeError(error), workspaceId },
        "Failed to refresh ongoing agent loops."
      );
    });
  }, [mutate, workspaceId]);

  return {
    ongoingAgentLoops: data?.agentLoops ?? emptyArray(),
    isOngoingAgentLoopsLoading: isLoading,
    isOngoingAgentLoopsError: !!error,
    refreshOngoingAgentLoops,
  };
}
