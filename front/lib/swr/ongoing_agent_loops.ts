import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  GetOngoingAgentLoopsResponseBody,
  OngoingAgentLoopType,
} from "@app/types/api/assistant/conversation/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback, useEffect, useRef } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

const ACTIVE_AGENT_LOOPS_REFRESH_INTERVAL_MS = 10_000;
const IDLE_AGENT_LOOPS_REFRESH_INTERVAL_MS = 120_000;

type OngoingAgentLoopsSWRData = GetOngoingAgentLoopsResponseBody & {
  pendingAgentLoopStart?: true;
};

function ongoingAgentLoopsKey(workspaceId: string) {
  return `/api/w/${workspaceId}/assistant/ongoing-agent-loops`;
}

interface UseOngoingAgentLoopsOptions {
  workspaceId: string;
  onSuccess: (agentLoops: OngoingAgentLoopType[]) => void;
}

/**
 * @cc [owner:id13,label:performance] adaptive-ongoing-agent-loop-polling
 * The next registry poll MUST wait 10 seconds when the latest response contains agent loops and
 * 120 seconds when the latest response is empty or unavailable.
 */
export function useOngoingAgentLoops({
  workspaceId,
  onSuccess,
}: UseOngoingAgentLoopsOptions) {
  const { fetcher } = useFetcher();
  const agentLoopsFetcher: Fetcher<OngoingAgentLoopsSWRData> = fetcher;
  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    ongoingAgentLoopsKey(workspaceId),
    agentLoopsFetcher,
    {
      onSuccess: ({ agentLoops }) => onSuccess(agentLoops),
      refreshInterval: (latest) =>
        latest?.agentLoops.length || latest?.pendingAgentLoopStart
          ? ACTIVE_AGENT_LOOPS_REFRESH_INTERVAL_MS
          : IDLE_AGENT_LOOPS_REFRESH_INTERVAL_MS,
      refreshWhenHidden: true,
      revalidateOnFocus: false,
    }
  );
  const refreshOngoingAgentLoops = useCallback(() => {
    void mutate().catch((error: unknown) => {
      datadogLogger.warn(
        { err: normalizeError(error), workspaceId, conversationId: null },
        "Failed to refresh ongoing agent loops."
      );
    });
  }, [mutate, workspaceId]);
  const lastWakeRefreshAt = useRef(-Infinity);

  useEffect(() => {
    const refreshOnWake = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      const now = Date.now();
      if (now - lastWakeRefreshAt.current < 1_000) {
        return;
      }
      lastWakeRefreshAt.current = now;
      refreshOngoingAgentLoops();
    };
    document.addEventListener("visibilitychange", refreshOnWake);
    window.addEventListener("focus", refreshOnWake);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnWake);
      window.removeEventListener("focus", refreshOnWake);
    };
  }, [refreshOngoingAgentLoops]);

  return {
    ongoingAgentLoops: data?.agentLoops ?? emptyArray(),
    isOngoingAgentLoopsLoading: isLoading,
    isOngoingAgentLoopsError: !!error,
    refreshOngoingAgentLoops,
  };
}

/**
 * @cc [owner:id13,label:performance;react] newly-started-agent-loop-polling
 * A successful message submission MUST resume 10-second polling without immediately revalidating.
 * The next registry response MUST replace this hint and determine the following interval.
 */
export function useResumeOngoingAgentLoopsPolling(workspaceId: string) {
  const { mutate } = useSWRConfig();

  return useCallback(() => {
    void mutate<OngoingAgentLoopsSWRData>(
      ongoingAgentLoopsKey(workspaceId),
      (current) => ({
        agentLoops: current?.agentLoops ?? [],
        pendingAgentLoopStart: true,
      }),
      { revalidate: false }
    );
  }, [mutate, workspaceId]);
}
